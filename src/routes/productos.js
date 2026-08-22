import { Router } from 'express';
import { autenticar } from '../middleware/autenticar.js';
import { permitirRolesOPermiso } from '../middleware/permitirRoles.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
    listarProductos,
    obtenerProducto,
    crearProducto,
    actualizarProducto,
    importarProductos,
    ajustarInventario,
    historialAjustes,
    inventarioValorizado,
    listarAsociados,
    agregarAsociacion,
    quitarAsociacion,
    sugerenciasAsociaciones,
    resolverSugerencia,
} from '../controllers/productosController.js';

const router = Router();

router.use(autenticar);

// inventario-valorizado, importar y sugerencias-asociaciones antes de :id
// para que Express no las confunda con un id de producto.
router.get('/inventario-valorizado', permitirRolesOPermiso(['dueno', 'encargado'], 'ver_reportes'), asyncHandler(inventarioValorizado));
router.post('/importar', permitirRolesOPermiso(['dueno', 'encargado'], 'gestionar_inventario'), asyncHandler(importarProductos));
router.get('/sugerencias-asociaciones', permitirRolesOPermiso(['dueno', 'encargado'], 'gestionar_inventario'), asyncHandler(sugerenciasAsociaciones));
router.post('/sugerencias-asociaciones/resolver', permitirRolesOPermiso(['dueno', 'encargado'], 'gestionar_inventario'), asyncHandler(resolverSugerencia));

router.get('/', asyncHandler(listarProductos));
router.post('/', permitirRolesOPermiso(['dueno', 'encargado'], 'gestionar_inventario'), asyncHandler(crearProducto));
router.get('/:id', asyncHandler(obtenerProducto));
router.patch('/:id', permitirRolesOPermiso(['dueno', 'encargado'], 'gestionar_inventario'), asyncHandler(actualizarProducto));
router.get('/:id/ajustes', permitirRolesOPermiso(['dueno', 'encargado'], 'gestionar_inventario'), asyncHandler(historialAjustes));
router.post('/:id/ajustes', permitirRolesOPermiso(['dueno', 'encargado'], 'gestionar_inventario'), asyncHandler(ajustarInventario));
router.get('/:id/asociados', asyncHandler(listarAsociados));
router.post('/:id/asociados', permitirRolesOPermiso(['dueno', 'encargado'], 'gestionar_inventario'), asyncHandler(agregarAsociacion));
router.delete('/:id/asociados/:asociadoId', permitirRolesOPermiso(['dueno', 'encargado'], 'gestionar_inventario'), asyncHandler(quitarAsociacion));

export default router;
