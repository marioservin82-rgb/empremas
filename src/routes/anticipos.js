import { Router } from 'express';
import { autenticar } from '../middleware/autenticar.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { crearAnticipo, listarAnticipos, anularAnticipo } from '../controllers/anticiposController.js';

const router = Router();

router.use(autenticar);

// Igual de abierto que Reparaciones/Internaciones: registrar o ver
// anticipos no tiene un sub-recurso restringido. Anular sí queda
// protegido, pero adentro del controller (PIN), igual que anularVenta.
router.get('/', asyncHandler(listarAnticipos));
router.post('/', asyncHandler(crearAnticipo));
router.post('/:id/anular', asyncHandler(anularAnticipo));

export default router;
