import { Router } from 'express';
import { autenticar } from '../middleware/autenticar.js';
import { permitirRoles } from '../middleware/permitirRoles.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
    fijarMiPin,
    miEstadoPin,
    yo,
    listarUsuarios,
    listarMeseros,
    crearUsuario,
    actualizarUsuario,
    listarPermisos,
    actualizarPermisos,
} from '../controllers/usuariosController.js';

const router = Router();

router.use(autenticar);

router.get('/yo', asyncHandler(yo));

// Solo dueno/encargado pueden tener PIN: son los unicos que pueden
// autorizar una anulacion.
router.patch('/mi-pin', permitirRoles('dueno', 'encargado'), asyncHandler(fijarMiPin));
router.get('/mi-pin', permitirRoles('dueno', 'encargado'), asyncHandler(miEstadoPin));
// Selector de "Entrega de efectivo" en Caja - dueño/encargado/cajero,
// nunca el propio mesero (no tiene acceso a la caja).
router.get('/meseros', permitirRoles('dueno', 'encargado', 'cajero'), asyncHandler(listarMeseros));

// Gestion de empleados: solo el dueno da de alta/edita cajeros y
// encargados (evita que un encargado pueda crearse mas permisos a si
// mismo o a otros).
router.get('/', permitirRoles('dueno'), asyncHandler(listarUsuarios));
router.post('/', permitirRoles('dueno'), asyncHandler(crearUsuario));
router.patch('/:id', permitirRoles('dueno'), asyncHandler(actualizarUsuario));
router.get('/:id/permisos', permitirRoles('dueno'), asyncHandler(listarPermisos));
router.put('/:id/permisos', permitirRoles('dueno'), asyncHandler(actualizarPermisos));

export default router;
