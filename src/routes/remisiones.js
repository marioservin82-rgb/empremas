import { Router } from 'express';
import { autenticar } from '../middleware/autenticar.js';
import { permitirRolesOPermiso } from '../middleware/permitirRoles.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
    crearRemision,
    crearRemisionDesdeVenta,
    listarRemisiones,
    obtenerRemision,
    reintentarRemision,
    descargarKudeRemision,
} from '../controllers/remisionesController.js';

const router = Router();

router.use(autenticar);

const puede = permitirRolesOPermiso(['dueno', 'encargado'], 'gestionar_compras');

router.get('/', asyncHandler(listarRemisiones));
router.get('/:id', asyncHandler(obtenerRemision));
router.get('/:id/kude', asyncHandler(descargarKudeRemision));
router.post('/', puede, asyncHandler(crearRemision));
router.post('/desde-venta', puede, asyncHandler(crearRemisionDesdeVenta));
router.post('/:id/reintentar', puede, asyncHandler(reintentarRemision));

export default router;
