import { Router } from 'express';
import { autenticar } from '../middleware/autenticar.js';
import { permitirRolesOPermiso } from '../middleware/permitirRoles.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
    listarVendedores,
    crearVendedor,
    actualizarVendedor,
    listarProductosComisionFija,
    agregarProductoComisionFija,
    quitarProductoComisionFija,
    comisionesDelVendedor,
    marcarPagado,
} from '../controllers/vendedoresController.js';

const router = Router();

router.use(autenticar);

const gestionar = permitirRolesOPermiso(['dueno', 'encargado'], 'gestionar_comisiones');

// productos-comision-fija antes de /:id para que Express no lo confunda
// con un id de vendedor (mismo criterio ya usado en productos.js).
router.get('/productos-comision-fija', gestionar, asyncHandler(listarProductosComisionFija));
router.post('/productos-comision-fija', gestionar, asyncHandler(agregarProductoComisionFija));
router.delete('/productos-comision-fija/:id', gestionar, asyncHandler(quitarProductoComisionFija));

// Lectura abierta a cualquier rol logueado: el cajero necesita la lista
// de vendedores activos para atribuir una venta en Vender.
router.get('/', asyncHandler(listarVendedores));
router.post('/', gestionar, asyncHandler(crearVendedor));
router.patch('/:id', gestionar, asyncHandler(actualizarVendedor));
router.get('/:id/comisiones', gestionar, asyncHandler(comisionesDelVendedor));
router.post('/:id/comisiones/marcar-pagado', gestionar, asyncHandler(marcarPagado));

export default router;
