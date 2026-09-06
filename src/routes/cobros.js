import { Router } from 'express';
import { autenticar } from '../middleware/autenticar.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { cobrosDelDia } from '../controllers/cobrosController.js';

const router = Router();

router.use(autenticar);

// Sin permitirRoles a nivel ruta: el filtro (todo vs. solo lo propio) vive
// adentro del controller, mismo criterio que /api/ventas/resumen-dia.
router.get('/resumen-dia', asyncHandler(cobrosDelDia));

export default router;
