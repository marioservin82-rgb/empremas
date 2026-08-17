// El agente es un .exe portable (no tiene instalador) - sin esto, cada vez
// que Mario reinicia la compu el agente deja de correr y tiene que abrirlo
// de nuevo a mano (y el frontend, al no detectarlo, le muestra el aviso de
// "descargalo" como si nunca lo hubiera instalado). Esto lo registra en el
// arranque de Windows la primera vez que corre, asi despues de un reinicio
// ya queda escuchando solo, sin que nadie lo abra a mano.
//
// Se usa la clave de usuario actual (HKCU) a proposito, no la de maquina
// (HKLM): no requiere permisos de administrador ni un instalador elevado,
// alcanza con el .exe portable de siempre.
const { execFileSync } = require('child_process');

const NOMBRE_CLAVE = 'EMPREMASAgenteImpresion';
const RUTA_REGISTRO = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';

function asegurarInicioAutomatico() {
    // process.pkg solo existe cuando esto corre como el .exe empaquetado
    // (pkg lo define) - en desarrollo (node src/index.js) process.execPath
    // apunta a node.exe, y registrar eso en el inicio de Windows arrancaria
    // node.exe suelto sin argumentos, que no sirve de nada.
    if (process.platform !== 'win32' || !process.pkg) {
        return;
    }
    try {
        execFileSync('reg', [
            'add', RUTA_REGISTRO,
            '/v', NOMBRE_CLAVE,
            '/t', 'REG_SZ',
            '/d', `"${process.execPath}"`,
            '/f',
        ]);
        console.log('Inicio automático con Windows: configurado.');
    } catch (error) {
        // No es critico - el agente sigue funcionando igual esta sesion,
        // solo no arranca solo la proxima vez que se reinicie la compu.
        console.log('No se pudo configurar el inicio automático (no es grave):', error.message);
    }
}

module.exports = { asegurarInicioAutomatico };
