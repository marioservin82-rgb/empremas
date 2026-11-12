import { Router } from 'express';
import { autenticar } from '../middleware/autenticar.js';
import { permitirRoles } from '../middleware/permitirRoles.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
    listarPlanes,
    crearPlan,
    actualizarPlan,
    listarMembresias,
    obtenerMembresia,
    crearMembresia,
    actualizarMembresia,
} from '../controllers/membresiasController.js';

const router = Router();

router.use(autenticar);

// Planes: ver dueno/encargado, crear y editar solo dueno.
router.get('/planes', permitirRoles('dueno', 'encargado'), asyncHandler(listarPlanes));
router.post('/planes', permitirRoles('dueno'), asyncHandler(crearPlan));
router.patch('/planes/:id', permitirRoles('dueno'), asyncHandler(actualizarPlan));

router.get('/', permitirRoles('dueno', 'encargado'), asyncHandler(listarMembresias));
router.post('/', permitirRoles('dueno', 'encargado'), asyncHandler(crearMembresia));
router.get('/:id', permitirRoles('dueno', 'encargado'), asyncHandler(obtenerMembresia));
router.patch('/:id', permitirRoles('dueno', 'encargado'), asyncHandler(actualizarMembresia));

export default router;
