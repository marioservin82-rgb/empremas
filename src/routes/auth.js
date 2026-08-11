import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { registrarEmpresa, login } from '../controllers/authController.js';

const router = Router();

router.post('/registro', asyncHandler(registrarEmpresa));
router.post('/login', asyncHandler(login));

export default router;
