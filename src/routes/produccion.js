import { Router } from 'express';
import { autenticar } from '../middleware/autenticar.js';
import { permitirRolesOPermiso } from '../middleware/permitirRoles.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
    listarLineas,
    crearLinea,
    actualizarLinea,
    obtenerLinea,
    agregarRecetaItem,
    quitarRecetaItem,
    crearCategoriaCalidad,
    actualizarCategoriaCalidad,
    listarOrdenes,
    obtenerOrden,
    crearOrden,
    clasificarOrden,
    listarPlanificacion,
    crearPlanificacion,
    eliminarPlanificacion,
} from '../controllers/produccionController.js';

const router = Router();

router.use(autenticar);

// Lectura abierta a cualquier rol logueado (igual que stock/clientes) -
// la escritura (crear/editar lineas, recetas, categorias, ordenes,
// planificacion) requiere dueno/encargado o el permiso extra
// gestionar_produccion (mismo mecanismo que gestionar_inventario).
const puedeGestionar = permitirRolesOPermiso(['dueno', 'encargado'], 'gestionar_produccion');

router.get('/lineas', asyncHandler(listarLineas));
router.post('/lineas', puedeGestionar, asyncHandler(crearLinea));
router.get('/lineas/:id', asyncHandler(obtenerLinea));
router.patch('/lineas/:id', puedeGestionar, asyncHandler(actualizarLinea));
router.post('/lineas/:id/receta', puedeGestionar, asyncHandler(agregarRecetaItem));
router.delete('/receta/:itemId', puedeGestionar, asyncHandler(quitarRecetaItem));
router.post('/lineas/:id/categorias', puedeGestionar, asyncHandler(crearCategoriaCalidad));
router.patch('/categorias/:id', puedeGestionar, asyncHandler(actualizarCategoriaCalidad));

router.get('/ordenes', asyncHandler(listarOrdenes));
router.get('/ordenes/:id', asyncHandler(obtenerOrden));
router.post('/ordenes', puedeGestionar, asyncHandler(crearOrden));
router.post('/ordenes/:id/clasificar', puedeGestionar, asyncHandler(clasificarOrden));

router.get('/planificacion', asyncHandler(listarPlanificacion));
router.post('/planificacion', puedeGestionar, asyncHandler(crearPlanificacion));
router.delete('/planificacion/:id', puedeGestionar, asyncHandler(eliminarPlanificacion));

export default router;
