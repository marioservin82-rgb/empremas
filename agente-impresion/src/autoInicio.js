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
//
// El inicio automatico NO apunta directo al .exe: un .exe de consola
// (como este) siempre abre una ventana negra de terminal al arrancar, y
// esa ventana es justamente lo que alguien no tecnico cierra por error
// pensando que "cerrar la ventana" apaga solo eso, sin darse cuenta que
// mata el agente entero. Por eso el arranque automatico pasa por un
// lanzador .vbs chico que abre el .exe oculto (sin ventana) - asi no
// queda nada visible para cerrar sin querer. Si el agente se abre a mano
// haciendo doble clic en el .exe (ej. la primera vez), esa ventana si se
// ve - es solo el arranque automatico con Windows el que queda oculto.
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

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
        const rutaVbs = path.join(path.dirname(process.execPath), 'iniciar-agente-oculto.vbs');
        // Se reescribe cada vez a proposito: si Mario mueve el .exe a otra
        // carpeta y lo vuelve a abrir, el lanzador se regenera apuntando a
        // la ubicacion nueva en vez de quedar roto apuntando a la vieja.
        const contenidoVbs = `CreateObject("WScript.Shell").Run """${process.execPath}""", 0, False`;
        fs.writeFileSync(rutaVbs, contenidoVbs);

        execFileSync('reg', [
            'add', RUTA_REGISTRO,
            '/v', NOMBRE_CLAVE,
            '/t', 'REG_SZ',
            '/d', `wscript.exe "${rutaVbs}"`,
            '/f',
        ]);
        console.log('Inicio automático con Windows: configurado (sin ventana visible).');
    } catch (error) {
        // No es critico - el agente sigue funcionando igual esta sesion,
        // solo no arranca solo la proxima vez que se reinicie la compu.
        console.log('No se pudo configurar el inicio automático (no es grave):', error.message);
    }
}

module.exports = { asegurarInicioAutomatico };
