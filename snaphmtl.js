const puppeteer = require('puppeteer');
const fs = require('fs').promises;
const path = require('path');

// --- Configuración ---
const targetUrl = 'https://app.sesametime.com/login';
const outputDir = './pagina-final';
// ---------------------

async function main() {
  try {
    await fs.mkdir(outputDir, { recursive: true });
    console.log('Iniciando Puppeteer...');

    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });

    console.log(`Navegando a: ${targetUrl}`);
    await page.goto(targetUrl, { waitUntil: 'networkidle0' });
    console.log('¡Página cargada y renderizada!');

    console.log('Guardando snapshot como .mhtml...');
    const mhtmlPath = path.join(outputDir, 'snapshot.mhtml');
    const cdpSession = await page.target().createCDPSession();
    const { data } = await cdpSession.send('Page.captureSnapshot', { format: 'mhtml' });
    await fs.writeFile(mhtmlPath, data);
    console.log(`Snapshot MHTML guardado en: ${mhtmlPath}`);


    console.log('Guardando solo el HTML renderizado...');
    const htmlPath = path.join(outputDir, 'index.html');
    const html = await page.content(); 
    await fs.writeFile(htmlPath, html);
    console.log(`HTML final guardado en: ${htmlPath}`);


    await browser.close();
    console.log('Proceso completado.');

  } catch (error) {
    console.error(`Ocurrió un error: ${error.message}`);
  }
}

main();