import { Router } from 'express';
import { autenticar } from '../middleware/autenticar.js';
import { permitirRoles } from '../middleware/permitirRoles.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { listarSucursales, crearSucursal, actualizarSucursal } from '../controllers/sucursalesController.js';

const router = Router();

router.use(autenticar);

router.get('/', asyncHandler(listarSucursales));
router.post('/', permitirRoles('dueno'), asyncHandler(crearSucursal));
router.patch('/:id', permitirRoles('dueno'), asyncHandler(actualizarSucursal));

export default router;
