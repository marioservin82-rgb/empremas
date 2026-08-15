import { Router } from 'express';
import { autenticar } from '../middleware/autenticar.js';
import { permitirRoles } from '../middleware/permitirRoles.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
    listarGastos,
    crearGasto,
    actualizarGasto,
    eliminarGasto,
    listarRecurrentes,
    crearRecurrente,
    actualizarRecurrente,
    listarPrestamos,
    crearPrestamo,
    actualizarPrestamo,
    pagarCuotaPrestamo,
    obtenerBalanceMensual,
} from '../controllers/gastosController.js';
import { registrarSalida, historialSalidas } from '../controllers/salidasStockController.js';

const router = Router();

// Modulo dueno-only: rentabilidad es informacion mas sensible que la
// liquidez que ya ve encargado (semaforo de salud financiera).
router.use(autenticar);
router.use(permitirRoles('dueno'));

router.get('/balance', asyncHandler(obtenerBalanceMensual));

router.get('/', asyncHandler(listarGastos));
router.post('/', asyncHandler(crearGasto));
router.patch('/:id', asyncHandler(actualizarGasto));
router.delete('/:id', asyncHandler(eliminarGasto));

router.get('/recurrentes', asyncHandler(listarRecurrentes));
router.post('/recurrentes', asyncHandler(crearRecurrente));
router.patch('/recurrentes/:id', asyncHandler(actualizarRecurrente));

router.get('/prestamos', asyncHandler(listarPrestamos));
router.post('/prestamos', asyncHandler(crearPrestamo));
router.patch('/prestamos/:id', asyncHandler(actualizarPrestamo));
router.post('/prestamos/:id/pagar-cuota', asyncHandler(pagarCuotaPrestamo));

router.get('/salidas-stock', asyncHandler(historialSalidas));
router.post('/salidas-stock', asyncHandler(registrarSalida));

export default router;
