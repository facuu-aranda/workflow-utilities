const fs = require("fs");
const path = require("path");
const readlineSync = require("readline-sync");
const { chromium } = require("playwright");
const sharp = require("sharp");

const MAX_ELEMENTS = 6; 
const GRID_COLS = 3;    

async function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function sanitize(str) {
  return str ? str.replace(/[^\w.-]+/g, "_").slice(0, 40) : "unnamed";
}

async function snapshot(page, folder, label, elementName = "") {
  await ensureDir(folder);
  const filename = path.join(
    folder,
    `${Date.now()}__${label}${elementName ? "__" + sanitize(elementName) : ""}.png`
  );
  await page.screenshot({ path: filename, fullPage: true });
  console.log("📸", filename);
  return filename;
}

function detectRoutes(projectPath) {
  const routes = new Set();

  const candidates = ["pages", "app", "src/pages", "src/routes"];
  function scanDir(dir, baseUrl = "") {
    const items = fs.readdirSync(dir);
    for (const item of items) {
      const fullPath = path.join(dir, item);
      const stat = fs.statSync(fullPath);

      if (stat.isDirectory()) {
        scanDir(fullPath, path.join(baseUrl, item));
      } else if (/\.(js|jsx|ts|tsx|astro|svelte|html)$/i.test(item)) {
        const name = path.basename(item, path.extname(item));
        if (
          name.startsWith("_") ||
          ["layout", "error", "not-found", "_document", "_app"].includes(name)
        )
          continue;

        let route = baseUrl;
        if (name !== "index" && name !== "page") {
          route = path.join(baseUrl, name);
        }

        route = route.replace(/\\/g, "/");
        if (!route.startsWith("/")) route = "/" + route;
        routes.add(route);
      }
    }
  }

  for (const candidate of candidates) {
    const full = path.join(projectPath, candidate);
    if (fs.existsSync(full) && fs.statSync(full).isDirectory()) {
      scanDir(full, "");
    }
  }

  function findAngularRoutes(dir) {
    if (!fs.existsSync(dir)) return;
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const full = path.join(dir, file);
      if (fs.statSync(full).isDirectory()) {
        findAngularRoutes(full);
      } else if (/routing\.module\.ts$|\.routes\.ts$/i.test(file)) {
        const content = fs.readFileSync(full, "utf-8");
        const matches = content.match(/path:\s*['"]([^'"]+)['"]/g) || [];
        matches.forEach((m) => {
          const clean = m.match(/['"]([^'"]+)['"]/)[1];
          const route = clean === "" ? "/" : "/" + clean;
          routes.add(route);
        });
      }
    }
  }
  findAngularRoutes(path.join(projectPath, "src/app"));

  return Array.from(routes);
}

async function createGrid(screenshots, outputPath, cols = GRID_COLS, padding = 20) {
  if (!screenshots.length) return;

  const imgs = await Promise.all(
    screenshots.map((f) =>
      sharp(f)
        .resize({ width: 400 })
        .extend({ bottom: padding, right: padding, background: "white" })
        .toBuffer()
    )
  );

  const meta = await sharp(imgs[0]).metadata();
  const w = meta.width;
  const h = meta.height;
  const rows = Math.ceil(imgs.length / cols);

  const canvas = {
    create: {
      width: w * cols,
      height: h * rows,
      channels: 3,
      background: { r: 255, g: 255, b: 255 },
    },
  };

  const composites = imgs.map((img, i) => {
    const row = Math.floor(i / cols);
    const col = i % cols;
    return { input: img, top: row * h, left: col * w };
  });

  await sharp(canvas).composite(composites).toFile(outputPath);
  console.log(`\n✅ Grid generado en: ${outputPath}`);
}

async function run() {
  const projectPath = readlineSync.question("📂 Ruta del proyecto local: ");
  const baseUrl = readlineSync.question("🌐 URL base (ej: http://localhost:3000): ");
  const savePath = readlineSync.question("📁 Ruta donde guardar capturas: ");

  const folder = path.join(savePath, ".screenshots");
  await ensureDir(folder);

  const projectRoutes = detectRoutes(projectPath);
  console.log("\n🔎 Rutas detectadas:", projectRoutes);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const screenshots = [];

  for (const route of projectRoutes) {
    const url = new URL(route, baseUrl).toString();
    console.log(`\n🌐 Visitando: ${url}`);
    const page = await context.newPage();

    try {
      await page.goto(url, { waitUntil: "networkidle" });
    } catch (e) {
      console.warn("⚠️ Error al cargar:", e.message);
      continue;
    }

    screenshots.push(await snapshot(page, folder, "initial", route));

    const elements = await page.$$(
      "button, a[href], [role='button'], [aria-haspopup], .modal-trigger"
    );
    for (let i = 0; i < Math.min(elements.length, MAX_ELEMENTS); i++) {
      const el = elements[i];
      const name = await el.evaluate(
        (e) =>
          e.getAttribute("id") ||
          e.getAttribute("class") ||
          e.textContent.trim().slice(0, 20)
      );

      try {
        await el.hover();
        screenshots.push(await snapshot(page, folder, `hover_${i}`, name));
      } catch {}

      try {
        await Promise.race([
          page.waitForNavigation({ timeout: 2000 }).catch(() => null),
          el.click({ timeout: 2000 }),
        ]);
        await page.waitForTimeout(600);
        screenshots.push(await snapshot(page, folder, `click_${i}`, name));
      } catch {}
    }

    await page.close();
  }

  await browser.close();

  await createGrid(screenshots, path.join(folder, "grid.png"));
}

run();
