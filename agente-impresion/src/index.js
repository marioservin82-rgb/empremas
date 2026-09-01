// CommonJS a proposito (no ESM) - pkg (el empaquetador que arma el .exe
// para distribuir a los comercios) todavia no soporta bien "type":
// "module"/import.meta, y esto evita ese problema por completo.
const express = require('express');
const cors = require('cors');
const { armarBuffer } = require('./escpos.js');
const { listarImpresoras, enviarRaw } = require('./impresoraWindows.js');
const { asegurarInicioAutomatico } = require('./autoInicio.js');

asegurarInicioAutomatico();

const app = express();

// CORS abierto a proposito: este agente corre en la compu del comercio,
// atendiendo solo pedidos a 127.0.0.1 - no es un servicio expuesto a
// internet, asi que no tiene sentido restringir el origen (ademas el
// frontend de EMPREMAS puede estar en localhost:3000 durante desarrollo o
// en empremas-frontend.onrender.com en produccion, dos origenes distintos).
app.use(cors());
app.use(express.json());

// Asi el frontend detecta si el agente esta instalado y corriendo antes de
// intentar imprimir con el (ver frontend/lib/agenteImpresion.js).
app.get('/estado', (req, res) => {
    res.json({ ok: true, version: '0.3.0' });
});

app.get('/impresoras', async (req, res) => {
    try {
        const impresoras = await listarImpresoras();
        res.json({ impresoras });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/imprimir', async (req, res) => {
    const { impresora, lineas, cortar } = req.body;

    if (!impresora) {
        return res.status(400).json({ error: 'Falta indicar la impresora' });
    }
    if (!Array.isArray(lineas) || lineas.length === 0) {
        return res.status(400).json({ error: 'No hay nada para imprimir' });
    }

    try {
        const buffer = armarBuffer(lineas, { cortar: cortar !== false });
        await enviarRaw(impresora, buffer);
        res.json({ ok: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

const PUERTO = 9100;
app.listen(PUERTO, '127.0.0.1', () => {
    console.log(`Agente de impresión EMPREMAS escuchando en http://127.0.0.1:${PUERTO}`);
});
