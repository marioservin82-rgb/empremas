import { Router } from 'express';
import { autenticar } from '../middleware/autenticar.js';
import { permitirRolesOPermiso } from '../middleware/permitirRoles.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
    crearPedidoSucursal,
    listarPedidosSucursalPendientes,
    obtenerPedidoSucursal,
    cancelarPedidoSucursal,
} from '../controllers/pedidosSucursalController.js';

const router = Router();

router.use(autenticar);

// Mismo gate en las tres: es decisión de inventario, no una tarea de
// caja diaria (dueño/encargado, o cajero con el permiso).
router.post('/', permitirRolesOPermiso(['dueno', 'encargado'], 'gestionar_inventario'), asyncHandler(crearPedidoSucursal));
router.get(
    '/pendientes',
    permitirRolesOPermiso(['dueno', 'encargado'], 'gestionar_inventario'),
    asyncHandler(listarPedidosSucursalPendientes)
);
router.get(
    '/:id',
    permitirRolesOPermiso(['dueno', 'encargado'], 'gestionar_inventario'),
    asyncHandler(obtenerPedidoSucursal)
);
router.post(
    '/:id/cancelar',
    permitirRolesOPermiso(['dueno', 'encargado'], 'gestionar_inventario'),
    asyncHandler(cancelarPedidoSucursal)
);

export default router;
