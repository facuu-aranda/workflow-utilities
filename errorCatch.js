const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const readline = require('readline');

/**
 * Función principal que ejecuta el proceso.
 */
async function main() {
    console.log("=".repeat(50));
    console.log("TypeScript Error Reporter");
    console.log("=".repeat(50));

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    const askQuestion = (query) => new Promise(resolve => rl.question(query, resolve));

    let projectPath;
    while (true) {
        projectPath = await askQuestion("Por favor, introduce la ruta a la carpeta del proyecto de TypeScript: ");
        
        // Verifica que la ruta exista y que contenga un tsconfig.json
        const tsconfigPath = path.join(projectPath, 'tsconfig.json');
        if (fs.existsSync(projectPath) && fs.statSync(projectPath).isDirectory()) {
            if (fs.existsSync(tsconfigPath)) {
                break;
            } else {
                 console.log("\n❌ Error: No se encontró un archivo 'tsconfig.json' en esa carpeta. Asegúrate de que la ruta es correcta.\n");
            }
        } else {
            console.log("\n❌ Error: La ruta introducida no es válida o no es un directorio. Inténtalo de nuevo.\n");
        }
    }
    rl.close();

    const outputFilename = "typescript_errors.txt";
    const outputFilePath = path.join(projectPath, outputFilename);

    console.log("\n⏳ Ejecutando el compilador de TypeScript en modo de solo revisión...");
    console.log("   Esto puede tardar unos segundos en proyectos grandes...");

    // Comando para ejecutar TSC sin generar archivos y con salida limpia
    // Usamos npx para asegurar que se use el TSC del proyecto o el más reciente
    const command = 'npx tsc --noEmit --pretty false';

    exec(command, { cwd: projectPath }, (error, stdout, stderr) => {
        // 'tsc' a menudo devuelve un 'error' (código de salida > 0) cuando encuentra errores de tipo.
        // La lista de errores real se encuentra en 'stdout'.
        
        const output = stdout.toString() + stderr.toString();

        try {
            let reportContent = `Reporte de Errores de TypeScript para el proyecto: ${projectPath}\n`;
            reportContent += `Generado el: ${new Date().toLocaleString()}\n`;
            reportContent += "=".repeat(80) + "\n\n";

            if (!output.trim()) {
                // No hubo salida, lo que significa que no hay errores.
                reportContent += "✅ ¡Excelente! No se encontraron errores de TypeScript en el proyecto.";
                console.log("\n✅ ¡Felicitaciones! No se encontraron errores.");
            } else {
                reportContent += "Listado de errores encontrados:\n\n";
                reportContent += output;
                console.log(`\n⚠️ Se encontraron errores. Revisa el archivo '${outputFilename}' para ver los detalles.`);
            }

            fs.writeFileSync(outputFilePath, reportContent, 'utf-8');
            console.log(`\n📁 Reporte guardado exitosamente en: ${outputFilePath}`);

        } catch (writeError) {
            console.error("\n❌ Error: No se pudo escribir el archivo de reporte.", writeError);
        }
    });
}

main();