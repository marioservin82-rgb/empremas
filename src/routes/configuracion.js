import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { obtenerSoporte } from '../controllers/configuracionController.js';

const router = Router();

// Sin autenticar - ver comentario en configuracionController.js.
router.get('/soporte', asyncHandler(obtenerSoporte));

export default router;
