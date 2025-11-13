const fs = require('fs');
const path = require('path');
const readline = require('readline');
const cliProgress = require('cli-progress');

const IGNORED_DIRS = new Set([
    'node_modules', '.git', '.next', 'dist', 'build', '__pycache__',
    'venv', '.venv', 'env', '.env', '.vscode', '.idea', 'target',
    'out' 
]);

const IGNORED_FILES = new Set([
    'tsconfig.tsbuildinfo', 
    '.DS_Store',
    'package-lock.json',
    'yarn.lock',
    'pnpm-lock.yaml',
    '.env',
    '.env.local',
    '.env.production',
    '.env.development'
]);

const IGNORED_EXTENSIONS = new Set([
    '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp', '.ico', '.tif', '.tiff', 'svg',
    '.mp3', '.wav', '.ogg', '.mp4', '.mov', '.avi', '.wmv', '.mkv',
    '.zip', '.tar', '.gz', '.rar', '.7z',
    '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
    '.eot', '.ttf', '.woff', '.woff2',
    '.exe', '.dll', '.so', '.o', '.a', '.jar',
    '.log' 
]);
/**
 * Recopila recursivamente todas las rutas de archivos válidas en un directorio.
 * @param {string} dir - El directorio desde el cual comenzar.
 * @returns {string[]} - Un array de rutas de archivo completas.
 */
function getAllFiles(dir) {
    let filesToProcess = [];
    const items = fs.readdirSync(dir);

    for (const item of items) {
        if (IGNORED_DIRS.has(item)) continue;

        const fullPath = path.join(dir, item);
        
        try {
            const stat = fs.statSync(fullPath);

            if (stat.isDirectory()) {
                filesToProcess = filesToProcess.concat(getAllFiles(fullPath));
            } else {
                if (IGNORED_FILES.has(item)) continue;

                const ext = path.extname(item).toLowerCase();
                if (!IGNORED_EXTENSIONS.has(ext)) {
                    filesToProcess.push(fullPath);
                }
            }
        } catch (error) {
            // Ignorar enlaces simbólicos rotos o archivos sin permisos
            // console.warn(`Advertencia: No se pudo acceder a '${fullPath}'. Omitiendo.`);
        }
    }
    return filesToProcess;
}
/**
 * Genera una representación en string de la estructura del proyecto.
 * @param {string} dir - El directorio raíz.
 * @param {string} prefix - El prefijo para las líneas (usado en recursión).
 * @returns {string} - El árbol de directorios como string.
 */
function getProjectStructure(dir, prefix = "") {
    let structure = "";
    
    const items = fs.readdirSync(dir).filter(item => 
        !IGNORED_DIRS.has(item) && 
        !IGNORED_FILES.has(item)
    );
    
    items.forEach((item, index) => {
        const itemPath = path.join(dir, item);
        const isLast = index === items.length - 1;
        const connector = isLast ? "└── " : "├── ";

        try {
            const stat = fs.statSync(itemPath);
            
            if (stat.isFile() && IGNORED_EXTENSIONS.has(path.extname(item).toLowerCase())) {
                return;
            }

            structure += `${prefix}${connector}${item}\n`;

            if (stat.isDirectory()) {
                const newPrefix = prefix + (isLast ? "    " : "│   ");
                structure += getProjectStructure(itemPath, newPrefix);
            }
        } catch (error) {
        }
    });
    return structure;
}


async function main() {
    console.log("=".repeat(50));
    console.log("Scraper de Proyecto (Excluyendo Contenido de Tests)");
    console.log("=".repeat(50));

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    const askQuestion = (query) => new Promise(resolve => rl.question(query, resolve));

    let targetPath;
    while (true) {
        targetPath = await askQuestion("Por favor, introduce la ruta del directorio que quieres analizar: ");
        if (fs.existsSync(targetPath) && fs.statSync(targetPath).isDirectory()) {
            break;
        } else {
            console.log("\nLa ruta introducida no es válida o no es un directorio. Inténtalo de nuevo.\n");
        }
    }

    let outputFilename = await askQuestion("\nIntroduce el nombre para el archivo de resumen (ej: proyecto_sin_tests.txt): ");
    rl.close();

    if (!outputFilename.trim()) {
        outputFilename = "project_summary_no_tests.txt";
        console.log(`No se ingresó un nombre. Usando el nombre por defecto: ${outputFilename}`);
    }

    if (!outputFilename.toLowerCase().endsWith('.txt')) {
        outputFilename += '.txt';
    }
    
    const outputFilePath = path.join(targetPath, outputFilename);

    console.log(`\nAnalizando el directorio: ${targetPath}`);
    console.log(`El resumen se guardará en: ${outputFilePath}\n`);
    
    try {
        const filesToProcess = getAllFiles(targetPath).filter(file => path.basename(file) !== outputFilename);
        const outputStream = fs.createWriteStream(outputFilePath, { encoding: 'utf-8' });

        // --- Escribir la cabecera ---
        outputStream.write("=".repeat(80) + "\n");
        outputStream.write("INICIO DEL ANÁLISIS DEL PROYECTO\n");
        outputStream.write("=".repeat(80) + "\n\n");
        outputStream.write("Hola, soy un script automatizado. Este archivo contiene la estructura completa y el código fuente del proyecto solicitado.\n\n");
        
        outputStream.write("NOTA IMPORTANTE: Este resumen excluye deliberadamente el contenido de los archivos de prueba (aquellos que contienen '.test' en su nombre). Sin embargo, estos archivos SÍ aparecen en la estructura de directorios a continuación para mantener la integridad del árbol del proyecto.\n\n");

        // --- Escribir la estructura ---
        outputStream.write("-".repeat(80) + "\n");
        outputStream.write("SECCIÓN 1: ESTRUCTURA DE ARCHIVOS Y DIRECTORIOS\n");
        outputStream.write("-".repeat(80) + "\n\n");
        const projectName = path.basename(targetPath);
        outputStream.write(`${projectName}/\n`);
        const structureStr = getProjectStructure(targetPath);
        outputStream.write(structureStr);

        // --- Escribir el contenido de los archivos ---
        outputStream.write("\n\n" + "-".repeat(80) + "\n");
        outputStream.write("SECCIÓN 2: CONTENIDO DE LOS ARCHIVOS\n");
        outputStream.write("-".repeat(80) + "\n\n");
        
        console.log("Procesando archivos y escribiendo su contenido...");
        const progressBar = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic);
        progressBar.start(filesToProcess.length, 0);

        for (const filePath of filesToProcess) {
            const relativePath = path.relative(targetPath, filePath);
            const isTestFile = path.basename(filePath).includes('.test');

            outputStream.write(`\n${'#'.repeat(30)} INICIO DEL ARCHIVO: ${relativePath} ${'#'.repeat(30)}\n\n`);
            
            if (isTestFile) {
                outputStream.write(`--- Contenido de archivo de prueba omitido intencionadamente ---\n`);
            } else {
                try {
                    const content = fs.readFileSync(filePath, 'utf-8');
                    outputStream.write(content);
                } catch (e) {
                    outputStream.write(`--- No se pudo leer el archivo (posiblemente binario o con codificación no soportada) ---\n`);
                    outputStream.write(`--- Error: ${e.message} ---\n`);
                }
            }

            outputStream.write(`\n\n${'#'.repeat(30)} FIN DEL ARCHIVO: ${relativePath} ${'#'.repeat(34)}\n`);
            progressBar.increment();
        }
        
        progressBar.stop();
        outputStream.end();

        console.log("\n¡Proceso completado con éxito!");
        console.log(`El archivo '${outputFilename}' ha sido creado en '${targetPath}'.`);

    } catch (e) {
        console.error("\nOcurrió un error inesperado:", e);
    }
}

main();