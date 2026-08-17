import { Router } from 'express';
import { autenticar } from '../middleware/autenticar.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { listarNovedades, marcarLeida } from '../controllers/novedadesController.js';

const router = Router();

// Sin permitirRoles: dueño, encargado y cajero necesitan por igual ver y
// marcar como leídas las novedades de la plataforma.
router.use(autenticar);

router.get('/', asyncHandler(listarNovedades));
router.post('/:id/leer', asyncHandler(marcarLeida));

export default router;
