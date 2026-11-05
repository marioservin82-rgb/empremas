import { Router } from 'express';
import { autenticar } from '../middleware/autenticar.js';
import { permitirRoles } from '../middleware/permitirRoles.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { listarCuentas, crearCuenta, actualizarCuenta, movimientosDeCuentas } from '../controllers/cuentasController.js';

const router = Router();

router.use(autenticar);

// Cualquier rol: el cajero elige la cuenta al registrar una transferencia.
router.get('/', asyncHandler(listarCuentas));
router.get('/movimientos', permitirRoles('dueno', 'encargado'), asyncHandler(movimientosDeCuentas));
router.post('/', permitirRoles('dueno'), asyncHandler(crearCuenta));
router.patch('/:id', permitirRoles('dueno'), asyncHandler(actualizarCuenta));

export default router;
