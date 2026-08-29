import { Router } from 'express';
import { autenticar } from '../middleware/autenticar.js';
import { permitirRolesOPermiso } from '../middleware/permitirRoles.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
    crearAutofactura,
    listarAutofacturas,
    obtenerAutofactura,
    reintentarAutofactura,
    descargarKudeAutofactura,
    buscarCiudades,
} from '../controllers/autofacturasController.js';

const router = Router();

router.use(autenticar);

const puede = permitirRolesOPermiso(['dueno', 'encargado'], 'gestionar_compras');

router.get('/ciudades', asyncHandler(buscarCiudades));
router.get('/', asyncHandler(listarAutofacturas));
router.get('/:id', asyncHandler(obtenerAutofactura));
router.get('/:id/kude', asyncHandler(descargarKudeAutofactura));
router.post('/', puede, asyncHandler(crearAutofactura));
router.post('/:id/reintentar', puede, asyncHandler(reintentarAutofactura));

export default router;
