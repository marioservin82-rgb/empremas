import { Router } from 'express';
import { autenticar } from '../middleware/autenticar.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
    listarInternaciones,
    obtenerInternacion,
    crearInternacion,
    actualizarEstadoInternacion,
} from '../controllers/internacionesController.js';

const router = Router();
router.use(autenticar);

router.get('/', asyncHandler(listarInternaciones));
router.post('/', asyncHandler(crearInternacion));
router.get('/:id', asyncHandler(obtenerInternacion));
router.patch('/:id/estado', asyncHandler(actualizarEstadoInternacion));

export default router;
