import { Router } from 'express';
import { autenticar } from '../middleware/autenticar.js';
import { permitirRolesOPermiso } from '../middleware/permitirRoles.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
    listarFlota,
    crearVehiculo,
    actualizarVehiculo,
    crearChofer,
    actualizarChofer,
    crearTransportista,
    actualizarTransportista,
} from '../controllers/flotaController.js';

const router = Router();
router.use(autenticar);

const puede = permitirRolesOPermiso(['dueno', 'encargado'], 'gestionar_compras');

router.get('/', asyncHandler(listarFlota));
router.post('/vehiculos', puede, asyncHandler(crearVehiculo));
router.patch('/vehiculos/:id', puede, asyncHandler(actualizarVehiculo));
router.post('/choferes', puede, asyncHandler(crearChofer));
router.patch('/choferes/:id', puede, asyncHandler(actualizarChofer));
router.post('/transportistas', puede, asyncHandler(crearTransportista));
router.patch('/transportistas/:id', puede, asyncHandler(actualizarTransportista));

export default router;
