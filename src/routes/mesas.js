import { Router } from 'express';
import { autenticar } from '../middleware/autenticar.js';
import { permitirRoles } from '../middleware/permitirRoles.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { listarMesas, crearMesa, actualizarMesa } from '../controllers/mesasController.js';

const router = Router();

router.use(autenticar);

// Lectura abierta a cualquier rol logueado: el mesero la necesita para
// elegir mesa, igual que el resto de los roles si quieren usarla.
router.get('/', asyncHandler(listarMesas));
router.post('/', permitirRoles('dueno', 'encargado'), asyncHandler(crearMesa));
router.patch('/:id', permitirRoles('dueno', 'encargado'), asyncHandler(actualizarMesa));

export default router;
