import { Router } from 'express';
import { autenticar } from '../middleware/autenticar.js';
import { permitirRoles, permitirRolesOPermiso } from '../middleware/permitirRoles.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
    crearVenta,
    listarVentas,
    resumenDia,
    listarFacturasElectronicas,
    obtenerVenta,
    anularVenta,
    cancelarVentaEnSifen,
    reporteVentas,
    reintentarSifen,
    descargarKudeVenta,
} from '../controllers/ventasController.js';

const router = Router();

router.use(autenticar);

// /reporte, /resumen-dia y /facturas-electronicas antes de /:id para que
// Express no las confunda con un id.
router.get('/reporte', permitirRolesOPermiso(['dueno', 'encargado'], 'ver_reportes'), asyncHandler(reporteVentas));
// Sin permitirRoles: el alcance (todo vs. solo lo propio) se resuelve
// adentro del controller, mismo criterio que listarRetirosDeTurno.
router.get('/resumen-dia', asyncHandler(resumenDia));
router.get(
    '/facturas-electronicas',
    permitirRolesOPermiso(['dueno', 'encargado'], 'ver_reportes'),
    asyncHandler(listarFacturasElectronicas)
);

// Cualquier rol logueado puede vender (incluido el cajero, es su trabajo
// principal) y ver el historial de ventas. Anular tambien lo puede
// disparar un cajero — la autorizacion de un supervisor se valida adentro
// del controller (PIN), no a nivel de rol de ruta. El mesero queda afuera
// de las dos: sus ventas nacen siempre de cerrar la cuenta de un pedido
// (ver /api/pedidos/:id/cerrar-cuenta), nunca de Vender directo.
router.post('/', permitirRoles('dueno', 'encargado', 'cajero'), asyncHandler(crearVenta));
router.get('/', asyncHandler(listarVentas));
router.get('/:id', asyncHandler(obtenerVenta));
router.get('/:id/kude', asyncHandler(descargarKudeVenta));
router.post('/:id/anular', permitirRoles('dueno', 'encargado', 'cajero'), asyncHandler(anularVenta));
router.post('/:id/cancelar-sifen', permitirRoles('dueno', 'encargado'), asyncHandler(cancelarVentaEnSifen));
router.post('/:id/reintentar-sifen', permitirRoles('dueno', 'encargado'), asyncHandler(reintentarSifen));

export default router;
