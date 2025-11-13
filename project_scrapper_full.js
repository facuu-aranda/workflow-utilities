const fs = require('fs');
const path = require('path');
const readline = require('readline');
const cliProgress = require('cli-progress');
const inquirer = require('inquirer'); 

// --- CONFIGURACIÓN DE EXCLUSIÓN (SOLO PARA CONTENIDO) ---
const IGNORED_DIRS = new Set([
    '.git', '.next', 'build', '__pycache__',
    'venv', '.venv', 'env', '.env', '.vscode', '.idea', 'target'
]);

const IGNORED_EXTENSIONS = new Set([
    '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp', '.ico', '.tif', '.tiff',
    '.mp3', '.wav', '.ogg', '.mp4', '.mov', '.avi', '.wmv', '.mkv',
    '.zip', '.tar', '.gz', '.rar', '.7z',
    '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
    '.eot', '.ttf', '.woff', '.woff2',
    '.exe', '.dll', '.so', '.o', '.a', '.jar',
    '.lock', '.log', '.DS_Store'
]);
// --- FIN DE LA CONFIGURACIÓN ---

/**
 * Recopila recursivamente todas las rutas de archivos válidas (CONTENIDO).
 * Esta función SÍ respeta las exclusiones y la selección de node_modules.
 */
function getAllFiles(dir, rootPath, selectedNodeModules) {
    let filesToProcess = [];
    const nodeModulesRoot = path.join(rootPath, 'node_modules');
    
    let items;
    try {
        items = fs.readdirSync(dir);
    } catch (e) {
        return []; 
    }

    for (const item of items) {
        if (IGNORED_DIRS.has(item)) continue;

        const fullPath = path.join(dir, item);
        
        if (dir === nodeModulesRoot && !selectedNodeModules.has(item)) {
            continue; 
        }
        if (item === 'node_modules' && dir.startsWith(nodeModulesRoot)) {
            continue; 
        }

        let stat;
        try {
            stat = fs.statSync(fullPath);
        } catch (e) {
            continue; 
        }

        if (stat.isDirectory()) {
            filesToProcess = filesToProcess.concat(getAllFiles(fullPath, rootPath, selectedNodeModules));
        } else {
            const ext = path.extname(item).toLowerCase();
            if (!IGNORED_EXTENSIONS.has(ext)) {
                filesToProcess.push(fullPath);
            }
        }
    }
    return filesToProcess;
}

/**
 * Genera una representación en string de la estructura del proyecto (ÁRBOL).
 * Esta función NO ignora NADA para mostrar la estructura completa.
 */
function getProjectStructure(dir, prefix = "") {
    let structure = "";
    let items;
    
    try {
        items = fs.readdirSync(dir);
    } catch (e) {
        return ""; 
    }
    
    items.forEach((item, index) => {
        const itemPath = path.join(dir, item);
        const isLast = index === items.length - 1;
        const connector = isLast ? "└── " : "├── ";
        
        structure += `${prefix}${connector}${item}\n`;

        try {
            if (fs.statSync(itemPath).isDirectory()) {
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
    console.log("Smart Project Scraper (Árbol Completo, Contenido Selectivo)");
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

    let outputFilename = await askQuestion("\nIntroduce el nombre para el archivo de resumen (ej: mi_proyecto.txt): ");
    
   
    rl.close(); 

    let selectedModulesSet = new Set();
    const nodeModulesPath = path.join(targetPath, 'node_modules');

    if (fs.existsSync(nodeModulesPath)) {
        console.log("\nDetectamos una carpeta 'node_modules'.");
        
        const allNodeModules = fs.readdirSync(nodeModulesPath)
            .filter(pkg => !pkg.startsWith('.') && !IGNORED_DIRS.has(pkg));

        if (allNodeModules.length > 0) {
            const { selectedPackages } = await inquirer.prompt([ 
                {
                    type: 'checkbox',
                    name: 'selectedPackages',
                    message: 'Selecciona los paquetes de node_modules cuyo CONTENIDO deseas incluir (usa ESPACIO para marcar, ENTER para confirmar):',
                    choices: allNodeModules,
                    pageSize: 15
                }
            ]);
            selectedModulesSet = new Set(selectedPackages);
            console.log(`\nSe incluirá el contenido de ${selectedModulesSet.size} paquetes de node_modules.`);
        } else {
            console.log("La carpeta 'node_modules' está vacía o solo contiene archivos ocultos.");
        }
    } else {
        console.log("\nNo se encontró la carpeta 'node_modules'. Se omitirá este paso.");
    }

    if (!outputFilename.trim()) {
        outputFilename = "project_summary_v3.txt";
        console.log(`No se ingresó un nombre. Usando el nombre por defecto: ${outputFilename}`);
    }

    if (!outputFilename.toLowerCase().endsWith('.txt')) {
        outputFilename += '.txt';
    }
    
    const outputFilePath = path.join(targetPath, outputFilename);

    console.log(`\nAnalizando el directorio: ${targetPath}`);
    console.log(`El resumen se guardará en: ${outputFilePath}\n`);
    
    try {
        const filesToProcess = getAllFiles(targetPath, targetPath, selectedModulesSet)
            .filter(file => path.basename(file) !== outputFilename);

        const outputStream = fs.createWriteStream(outputFilePath, { encoding: 'utf-8' });

        outputStream.write("=".repeat(80) + "\n");
        outputStream.write("INICIO DEL ANÁLISIS DEL PROYECTO (Selectivo)\n");
        outputStream.write("=".repeat(80) + "\n\n");
        outputStream.write("Este archivo contiene la estructura completa y el código fuente selectivo del proyecto.\n\n");

        outputStream.write("-".repeat(80) + "\n");
        outputStream.write("SECCIÓN 1: ESTRUCTURA DE ARCHIVOS Y DIRECTORIOS (COMPLETA)\n");
        outputStream.write("-".repeat(80) + "\n\n");
        const projectName = path.basename(targetPath);
        outputStream.write(`${projectName}/\n`);
        
        const structureStr = getProjectStructure(targetPath); 
        outputStream.write(structureStr);

        outputStream.write("\n\n" + "-".repeat(80) + "\n");
        outputStream.write("NOTA IMPORTANTE:\n\n");
        outputStream.write("El árbol de archivos anterior (SECCIÓN 1) muestra la estructura COMPLETA del proyecto, incluyendo todos los archivos y carpetas (como .git, node_modules, etc.) para un contexto total.\n\n");
        outputStream.write("El contenido de los archivos (SECCIÓN 2, a continuación) es SELECTIVO.\n");
        outputStream.write("Se omite el contenido de los directorios ignorados (como .git, .vscode), los archivos binarios (imágenes, etc.) y los paquetes de 'node_modules' que no fueron seleccionados en el menú.\n\n");
        outputStream.write("Si necesitas el contenido de algún archivo específico que ves en el árbol pero no encuentras en la SECCIÓN 2, por favor, solicítalo.\n");
        outputStream.write("-".repeat(80) + "\n");

        outputStream.write("\n\n" + "-".repeat(80) + "\n");
        outputStream.write("SECCIÓN 2: CONTENIDO DE LOS ARCHIVOS (SELECTIVO)\n");
        outputStream.write("-".repeat(80) + "\n\n");
        
        console.log("Procesando archivos (contenido selectivo) y escribiendo...");
        const progressBar = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic);
        progressBar.start(filesToProcess.length, 0);

        for (const filePath of filesToProcess) {
            const relativePath = path.relative(targetPath, filePath);
            outputStream.write(`\n${'#'.repeat(30)} INICIO DEL ARCHIVO: ${relativePath} ${'#'.repeat(30)}\n\n`);
            try {
                const content = fs.readFileSync(filePath, 'utf-8');
                outputStream.write(content);
            } catch (e) {
                outputStream.write(`--- No se pudo leer el archivo (posiblemente binario o con codificación no soportada) ---\n`);
                outputStream.write(`--- Error: ${e.message} ---\n`);
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