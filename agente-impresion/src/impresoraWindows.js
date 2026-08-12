const { spawn } = require('child_process');
const fs = require('fs');
const { writeFile, unlink } = require('fs/promises');
const { tmpdir } = require('os');
const path = require('path');

// EnviarRaw.ps1 viaja empaquetado dentro del .exe (ver "pkg.assets" en
// package.json). Node puede leerlo con fs normal gracias a como pkg
// intercepta esas lecturas, pero PowerShell (un proceso aparte, no Node)
// no puede leerlo directo del .exe - por eso se vuelca a un archivo real
// en el temp de Windows una sola vez al arrancar, y de ahi en mas se usa
// esa copia real en disco.
const SCRIPT_ORIGEN = path.join(__dirname, 'EnviarRaw.ps1');
const SCRIPT_ENVIAR = path.join(tmpdir(), 'empremas-EnviarRaw.ps1');
fs.writeFileSync(SCRIPT_ENVIAR, fs.readFileSync(SCRIPT_ORIGEN));

function ejecutarPowershell(args) {
    return new Promise((resolve, reject) => {
        const proceso = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', ...args]);
        let salida = '';
        let errorSalida = '';
        proceso.stdout.on('data', (d) => { salida += d.toString(); });
        proceso.stderr.on('data', (d) => { errorSalida += d.toString(); });
        proceso.on('close', (codigo) => {
            if (codigo === 0) resolve(salida);
            else reject(new Error(errorSalida.trim() || `PowerShell terminó con código ${codigo}`));
        });
        proceso.on('error', reject);
    });
}

// Via WMI (Win32_Printer) en vez del modulo PrintManagement de PowerShell:
// funciona en cualquier Windows con .NET, sin depender de que ese modulo
// especifico este instalado/habilitado.
async function listarImpresoras() {
    const salida = await ejecutarPowershell([
        '-Command',
        'Get-CimInstance -ClassName Win32_Printer | Select-Object -ExpandProperty Name',
    ]);
    return salida
        .split(/\r?\n/)
        .map((linea) => linea.trim())
        .filter(Boolean);
}

async function enviarRaw(impresora, buffer) {
    const archivoTemp = path.join(tmpdir(), `empremas-ticket-${Date.now()}-${Math.random().toString(36).slice(2)}.prn`);
    await writeFile(archivoTemp, buffer);
    try {
        await ejecutarPowershell(['-File', SCRIPT_ENVIAR, '-Impresora', impresora, '-Archivo', archivoTemp]);
    } finally {
        await unlink(archivoTemp).catch(() => {});
    }
}

module.exports = { listarImpresoras, enviarRaw };
