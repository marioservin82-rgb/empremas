import { Router } from 'express';
import { autenticar } from '../middleware/autenticar.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
    listarReparaciones,
    obtenerReparacion,
    crearReparacion,
    actualizarEstadoReparacion,
    actualizarReparacion,
} from '../controllers/reparacionesController.js';

const router = Router();

router.use(autenticar);

// Igual de abierto que Vender/Citas: no hay un sub-recurso restringido (no
// hay un padron de "tecnicos" que gestionar, a diferencia de /profesionales
// en Citas), asi que no hace falta ningun permiso_extra nuevo - crear/ver/
// cambiar estado esta disponible para cualquier rol logueado.
router.get('/', asyncHandler(listarReparaciones));
router.post('/', asyncHandler(crearReparacion));
router.get('/:id', asyncHandler(obtenerReparacion));
router.patch('/:id', asyncHandler(actualizarReparacion));
router.patch('/:id/estado', asyncHandler(actualizarEstadoReparacion));

export default router;
