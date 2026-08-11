import { Router } from 'express';
import { autenticar } from '../middleware/autenticar.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { crearPresupuesto, listarPresupuestos, obtenerPresupuesto } from '../controllers/presupuestosController.js';

const router = Router();

router.use(autenticar);

// Cualquier rol logueado puede cotizar, igual que puede vender.
router.post('/', asyncHandler(crearPresupuesto));
router.get('/', asyncHandler(listarPresupuestos));
router.get('/:id', asyncHandler(obtenerPresupuesto));

export default router;
