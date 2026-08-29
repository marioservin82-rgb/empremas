import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import authRoutes from './routes/auth.js';
import productosRoutes from './routes/productos.js';
import clientesRoutes from './routes/clientes.js';
import ventasRoutes from './routes/ventas.js';
import empresasRoutes from './routes/empresas.js';
import proveedoresRoutes from './routes/proveedores.js';
import comprasRoutes from './routes/compras.js';
import turnosRoutes from './routes/turnos.js';
import presupuestosRoutes from './routes/presupuestos.js';
import usuariosRoutes from './routes/usuarios.js';
import sucursalesRoutes from './routes/sucursales.js';
import adminRoutes from './routes/admin.js';
import configuracionRoutes from './routes/configuracion.js';
import gastosRoutes from './routes/gastos.js';
import novedadesRoutes from './routes/novedades.js';
import produccionRoutes from './routes/produccion.js';
import vendedoresRoutes from './routes/vendedores.js';
import mesasRoutes from './routes/mesas.js';
import pedidosRoutes from './routes/pedidos.js';
import remisionesRoutes from './routes/remisiones.js';
import notasRoutes from './routes/notas.js';
import autofacturasRoutes from './routes/autofacturas.js';
import { iniciarBarredorDocumentosElectronicos } from './jobs/barrerDocumentosElectronicos.js';

const app = express();
app.use(cors());
// Limite subido de 100kb (default de Express) a 5mb - el logo de empresa
// viaja como data URI dentro del JSON (ver actualizarLogo en
// empresasController.js), y el default se queda corto para eso.
app.use(express.json({ limit: '5mb' }));

app.get('/salud', (req, res) => {
    res.json({ estado: 'ok' });
});

app.use('/api/auth', authRoutes);
app.use('/api/productos', productosRoutes);
app.use('/api/clientes', clientesRoutes);
app.use('/api/ventas', ventasRoutes);
app.use('/api/empresas', empresasRoutes);
app.use('/api/proveedores', proveedoresRoutes);
app.use('/api/compras', comprasRoutes);
app.use('/api/turnos', turnosRoutes);
app.use('/api/presupuestos', presupuestosRoutes);
app.use('/api/usuarios', usuariosRoutes);
app.use('/api/sucursales', sucursalesRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/configuracion', configuracionRoutes);
app.use('/api/gastos', gastosRoutes);
app.use('/api/novedades', novedadesRoutes);
app.use('/api/produccion', produccionRoutes);
app.use('/api/vendedores', vendedoresRoutes);
app.use('/api/mesas', mesasRoutes);
app.use('/api/pedidos', pedidosRoutes);
app.use('/api/remisiones', remisionesRoutes);
app.use('/api/notas', notasRoutes);
app.use('/api/autofacturas', autofacturasRoutes);

app.use((error, req, res, next) => {
    console.error(error);
    res.status(500).json({ error: 'Error interno' });
});

const puerto = process.env.PORT || 3001;
app.listen(puerto, () => {
    console.log(`EMPREMAS backend escuchando en http://localhost:${puerto}`);
    // Reintenta/re-consulta en segundo plano los documentos electrónicos que
    // quedaron "en trámite" o fallaron (facturación asíncrona por lote).
    iniciarBarredorDocumentosElectronicos();
});
