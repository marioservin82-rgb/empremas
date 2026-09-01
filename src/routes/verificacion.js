import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { verificarRecibo } from '../controllers/cobrosController.js';

const router = Router();

// Sin autenticar a proposito: a esto apunta el QR impreso en el recibo de
// cobro, y tiene que poder escanearse y verificarse sin que quien
// escanea (cliente, un tercero) tenga o necesite una sesion de EMPREMAS.
router.get('/', asyncHandler(verificarRecibo));

export default router;
