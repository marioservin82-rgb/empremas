import { Router } from 'express';
import { autenticar } from '../middleware/autenticar.js';
import { permitirRolesOPermiso } from '../middleware/permitirRoles.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
    listarClientes,
    obtenerCliente,
    crearCliente,
    actualizarCliente,
    extractoCliente,
    ajustarSaldo,
    historialAjustesSaldo,
} from '../controllers/clientesController.js';
import { facturasPendientes, crearCobro, listarCobros } from '../controllers/cobrosController.js';

const router = Router();

router.use(autenticar);

// Lectura abierta a cualquier rol logueado: el cajero necesita poder
// consultar el credito disponible de un cliente antes de vender (regla de
// oro del POS), aunque no pueda tocar el limite.
router.get('/', asyncHandler(listarClientes));
router.get('/:id', asyncHandler(obtenerCliente));
router.get('/:id/facturas-pendientes', asyncHandler(facturasPendientes));
router.get('/:id/cobros', asyncHandler(listarCobros));
router.get('/:id/extracto', asyncHandler(extractoCliente));
router.get('/:id/ajustes-saldo', permitirRolesOPermiso(['dueno', 'encargado'], 'gestionar_clientes'), asyncHandler(historialAjustesSaldo));

router.post('/', permitirRolesOPermiso(['dueno', 'encargado'], 'gestionar_clientes'), asyncHandler(crearCliente));
router.patch('/:id', permitirRolesOPermiso(['dueno', 'encargado'], 'gestionar_clientes'), asyncHandler(actualizarCliente));
router.post('/:id/ajustes-saldo', permitirRolesOPermiso(['dueno', 'encargado'], 'gestionar_clientes'), asyncHandler(ajustarSaldo));
// Cobrar es una tarea de caja diaria: cualquier rol logueado puede
// registrar un cobro, igual que puede vender.
router.post('/:id/cobros', asyncHandler(crearCobro));

export default router;
