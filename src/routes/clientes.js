import { Router } from 'express';
import { autenticar } from '../middleware/autenticar.js';
import { permitirRoles, permitirRolesOPermiso } from '../middleware/permitirRoles.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
    listarClientes,
    obtenerCliente,
    crearCliente,
    actualizarCliente,
    extractoCliente,
    importarClientes,
    ajustarSaldo,
    historialAjustesSaldo,
    listarCategorias,
    crearCategoria,
    actualizarCategoria,
    reporteCategoriasCliente,
    productosFrecuentesDeCliente,
    clientesCumpleanos,
} from '../controllers/clientesController.js';
import { facturasPendientes, crearCobro, listarCobros, obtenerCobro } from '../controllers/cobrosController.js';
import { consultarRucDnit } from '../controllers/sifenConsultaController.js';

const router = Router();

router.use(autenticar);

// categorias y reporte-categorias antes de /:id para que Express no las
// confunda con un id de cliente (mismo criterio que /inventario-valorizado
// en productos.js). Dueño-only: es politica financiera del negocio, la
// spec de esta funcion dice "el dueño define/configura", nunca "dueño o
// encargado".
router.get('/categorias', permitirRoles('dueno'), asyncHandler(listarCategorias));
router.post('/categorias', permitirRoles('dueno'), asyncHandler(crearCategoria));
router.patch('/categorias/:id', permitirRoles('dueno'), asyncHandler(actualizarCategoria));
router.get('/reporte-categorias', permitirRoles('dueno'), asyncHandler(reporteCategoriasCliente));
router.get('/cumpleanos', asyncHandler(clientesCumpleanos));

// Autocompletar el alta desde el padrón de la DNIT — antes de /:id.
router.get('/consultar-ruc', permitirRolesOPermiso(['dueno', 'encargado'], 'gestionar_clientes'), asyncHandler(consultarRucDnit));

// Lectura abierta a cualquier rol logueado: el cajero necesita poder
// consultar el credito disponible de un cliente antes de vender (regla de
// oro del POS), aunque no pueda tocar el limite.
router.get('/', asyncHandler(listarClientes));
router.get('/:id', asyncHandler(obtenerCliente));
router.get('/:id/facturas-pendientes', asyncHandler(facturasPendientes));
router.get('/:id/cobros', asyncHandler(listarCobros));
router.get('/:id/cobros/:cobroId', asyncHandler(obtenerCobro));
router.get('/:id/extracto', asyncHandler(extractoCliente));
router.get('/:id/productos-frecuentes', asyncHandler(productosFrecuentesDeCliente));
router.get('/:id/ajustes-saldo', permitirRolesOPermiso(['dueno', 'encargado'], 'gestionar_clientes'), asyncHandler(historialAjustesSaldo));

router.post('/', permitirRolesOPermiso(['dueno', 'encargado'], 'gestionar_clientes'), asyncHandler(crearCliente));
router.post('/importar', permitirRolesOPermiso(['dueno', 'encargado'], 'gestionar_clientes'), asyncHandler(importarClientes));
router.patch('/:id', permitirRolesOPermiso(['dueno', 'encargado'], 'gestionar_clientes'), asyncHandler(actualizarCliente));
router.post('/:id/ajustes-saldo', permitirRolesOPermiso(['dueno', 'encargado'], 'gestionar_clientes'), asyncHandler(ajustarSaldo));
// Cobrar es una tarea de caja diaria: cualquier rol logueado puede
// registrar un cobro, igual que puede vender.
router.post('/:id/cobros', asyncHandler(crearCobro));

export default router;
