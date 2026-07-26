// server.js — Ponto de entrada robusto para Hostinger
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const crashLog = path.join(__dirname, 'crash.log');

// Garante que o ambiente de produção esteja setado
process.env.NODE_ENV = 'production';

function logCrash(err) {
    const timestamp = new Date().toISOString();
    const stack = err instanceof Error ? err.stack : String(err);
    const msg = `[${timestamp}] [LOADER ERROR] ${stack}\n`;
    try {
        fs.appendFileSync(crashLog, msg);
    } catch (e) {}
    console.error(msg);
}

console.log('>>> [HOSTINGER LOADER] Iniciando servidor a partir de server.js');

try {
    const bundlePath = path.join(__dirname, 'dist-server', 'server-js-dist.cjs');
    
    if (!fs.existsSync(bundlePath)) {
        throw new Error(`Arquivo bundle não encontrado: ${bundlePath}`);
    }

    // Importação dinâmica do bundle CommonJS
    const cacheBuster = `?v=${Date.now()}`;
    import(`./dist-server/server-js-dist.cjs${cacheBuster}`).catch(err => {
        logCrash(err);
        process.exit(1);
    });

} catch (err) {
    logCrash(err);
    process.exit(1);
}
