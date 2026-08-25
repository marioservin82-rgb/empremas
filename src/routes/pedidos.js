import { Router } from 'express';
import { autenticar } from '../middleware/autenticar.js';
import { permitirRoles } from '../middleware/permitirRoles.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
    crearPedido,
    obtenerPedido,
    agregarItem,
    marcarItemListo,
    comanda,
    actualizarPedido,
    cerrarCuentaPedido,
} from '../controllers/pedidosController.js';

const router = Router();

router.use(autenticar);

// Este modulo es, por diseño, el unico lugar de la app donde un mesero
// opera - de ahi que la escritura incluya 'mesero' ademas de los 3 roles
// de siempre (ver permitirRoles). La lectura queda abierta a cualquier
// rol logueado (comanda de cocina, ver un pedido).
const ESCRITURA = permitirRoles('dueno', 'encargado', 'cajero', 'mesero');

router.get('/comanda', asyncHandler(comanda));
router.post('/', ESCRITURA, asyncHandler(crearPedido));
router.get('/:id', asyncHandler(obtenerPedido));
router.post('/:id/items', ESCRITURA, asyncHandler(agregarItem));
router.patch('/items/:id', ESCRITURA, asyncHandler(marcarItemListo));
router.patch('/:id', ESCRITURA, asyncHandler(actualizarPedido));
router.post('/:id/cerrar-cuenta', ESCRITURA, asyncHandler(cerrarCuentaPedido));

export default router;
