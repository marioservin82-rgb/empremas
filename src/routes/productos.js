import { Router } from 'express';
import multer from 'multer';
import { autenticar } from '../middleware/autenticar.js';
import { permitirRolesOPermiso } from '../middleware/permitirRoles.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
    listarProductos,
    obtenerProducto,
    crearProducto,
    actualizarProducto,
    eliminarProducto,
    importarProductos,
    ajustarInventario,
    historialAjustes,
    inventarioValorizado,
    listarAsociados,
    agregarAsociacion,
    quitarAsociacion,
    sugerenciasAsociaciones,
    resolverSugerencia,
    generarCodigoInterno,
    subirFotoServicio,
    eliminarFotoServicio,
} from '../controllers/productosController.js';
import { obtenerRecomendacionMargen } from '../controllers/margenController.js';

const router = Router();
// En memoria (no a disco): el buffer se reenvia directo a Cloudinary, nunca
// se guarda un archivo propio en el servidor. Limite generoso para una
// foto de celular sin comprimir a mano.
const subidaFoto = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });

router.use(autenticar);

// inventario-valorizado, importar y sugerencias-asociaciones antes de :id
// para que Express no las confunda con un id de producto.
router.get('/inventario-valorizado', permitirRolesOPermiso(['dueno', 'encargado'], 'ver_reportes'), asyncHandler(inventarioValorizado));
router.post('/importar', permitirRolesOPermiso(['dueno', 'encargado'], 'gestionar_inventario'), asyncHandler(importarProductos));
router.get('/sugerencias-asociaciones', permitirRolesOPermiso(['dueno', 'encargado'], 'gestionar_inventario'), asyncHandler(sugerenciasAsociaciones));
router.post('/sugerencias-asociaciones/resolver', permitirRolesOPermiso(['dueno', 'encargado'], 'gestionar_inventario'), asyncHandler(resolverSugerencia));
router.post('/generar-codigo', permitirRolesOPermiso(['dueno', 'encargado'], 'gestionar_inventario'), asyncHandler(generarCodigoInterno));

router.get('/', asyncHandler(listarProductos));
router.post('/', permitirRolesOPermiso(['dueno', 'encargado'], 'gestionar_inventario'), asyncHandler(crearProducto));
router.get('/:id', asyncHandler(obtenerProducto));
router.patch('/:id', permitirRolesOPermiso(['dueno', 'encargado'], 'gestionar_inventario'), asyncHandler(actualizarProducto));
router.delete('/:id', permitirRolesOPermiso(['dueno', 'encargado'], 'gestionar_inventario'), asyncHandler(eliminarProducto));
router.get('/:id/ajustes', permitirRolesOPermiso(['dueno', 'encargado'], 'gestionar_inventario'), asyncHandler(historialAjustes));
router.post('/:id/ajustes', permitirRolesOPermiso(['dueno', 'encargado'], 'gestionar_inventario'), asyncHandler(ajustarInventario));
router.get('/:id/recomendacion-margen', permitirRolesOPermiso(['dueno', 'encargado'], 'gestionar_inventario'), asyncHandler(obtenerRecomendacionMargen));
router.get('/:id/asociados', asyncHandler(listarAsociados));
router.post('/:id/asociados', permitirRolesOPermiso(['dueno', 'encargado'], 'gestionar_inventario'), asyncHandler(agregarAsociacion));
router.delete('/:id/asociados/:asociadoId', permitirRolesOPermiso(['dueno', 'encargado'], 'gestionar_inventario'), asyncHandler(quitarAsociacion));
router.post('/:id/fotos', permitirRolesOPermiso(['dueno', 'encargado'], 'gestionar_inventario'), subidaFoto.single('foto'), asyncHandler(subirFotoServicio));
router.delete('/fotos/:fotoId', permitirRolesOPermiso(['dueno', 'encargado'], 'gestionar_inventario'), asyncHandler(eliminarFotoServicio));

export default router;
