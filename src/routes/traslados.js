import { Router } from 'express';
import { autenticar } from '../middleware/autenticar.js';
import { permitirRolesOPermiso } from '../middleware/permitirRoles.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
    crearTraslado,
    listarTrasladosPendientes,
    listarTraslados,
    confirmarTraslado,
    cancelarTraslado,
} from '../controllers/trasladosController.js';

const router = Router();

router.use(autenticar);

// Crear/cancelar es movimiento de stock: mismo gate que Ajuste de
// Inventario (dueño/encargado, o cajero con el permiso).
router.post('/', permitirRolesOPermiso(['dueno', 'encargado'], 'gestionar_inventario'), asyncHandler(crearTraslado));
router.get('/pendientes', asyncHandler(listarTrasladosPendientes));
router.get('/', asyncHandler(listarTraslados));
// Confirmar es solo "firmar que llegó" - cualquier rol logueado de esa
// sucursal puede hacerlo (el controller ya valida que sea SU sucursal).
router.post('/:id/confirmar', asyncHandler(confirmarTraslado));
router.post('/:id/cancelar', permitirRolesOPermiso(['dueno', 'encargado'], 'gestionar_inventario'), asyncHandler(cancelarTraslado));

export default router;
