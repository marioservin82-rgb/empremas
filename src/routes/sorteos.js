import { Router } from 'express';
import { autenticar } from '../middleware/autenticar.js';
import { permitirRoles } from '../middleware/permitirRoles.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
    sorteoActual,
    listarSorteos,
    crearSorteo,
    actualizarSorteo,
    resumenSorteo,
    listarCupones,
    verificarCupon,
} from '../controllers/sorteosController.js';

const router = Router();

router.use(autenticar);

// Cualquier rol: Vender necesita saber si hay un sorteo activo.
router.get('/actual', asyncHandler(sorteoActual));

router.get('/', permitirRoles('dueno', 'encargado'), asyncHandler(listarSorteos));
router.post('/', permitirRoles('dueno'), asyncHandler(crearSorteo));
router.patch('/:id', permitirRoles('dueno'), asyncHandler(actualizarSorteo));
router.get('/:id/resumen', permitirRoles('dueno', 'encargado'), asyncHandler(resumenSorteo));
router.get('/:id/cupones', permitirRoles('dueno', 'encargado'), asyncHandler(listarCupones));
router.get('/:id/cupones/:numero', permitirRoles('dueno', 'encargado'), asyncHandler(verificarCupon));

export default router;
