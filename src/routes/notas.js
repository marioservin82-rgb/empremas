import { Router } from 'express';
import { autenticar } from '../middleware/autenticar.js';
import { permitirRolesOPermiso } from '../middleware/permitirRoles.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
    crearNota,
    listarNotas,
    obtenerNota,
    notasDeVenta,
    reintentarNota,
    descargarKudeNota,
} from '../controllers/notasController.js';

const router = Router();
router.use(autenticar);

const puede = permitirRolesOPermiso(['dueno', 'encargado'], 'gestionar_clientes');

router.get('/', asyncHandler(listarNotas));
router.get('/de-venta/:ventaId', asyncHandler(notasDeVenta));
router.get('/:id', asyncHandler(obtenerNota));
router.get('/:id/kude', asyncHandler(descargarKudeNota));
router.post('/', puede, asyncHandler(crearNota));
router.post('/:id/reintentar', puede, asyncHandler(reintentarNota));

export default router;
