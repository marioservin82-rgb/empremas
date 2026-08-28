import { Router } from 'express';
import { autenticar } from '../middleware/autenticar.js';
import { permitirRolesOPermiso } from '../middleware/permitirRoles.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
    listarProveedores,
    obtenerProveedor,
    crearProveedor,
    actualizarProveedor,
    extractoProveedor,
    listaPedido,
    importarProveedores,
    pagarProveedor,
    ajustarSaldo,
    historialAjustesSaldo,
} from '../controllers/proveedoresController.js';
import { consultarRucDnit } from '../controllers/sifenConsultaController.js';

const router = Router();

router.use(autenticar);

// Autocompletar el alta de proveedor desde el padrón de la DNIT — antes de /:id.
router.get('/consultar-ruc', permitirRolesOPermiso(['dueno', 'encargado'], 'gestionar_compras'), asyncHandler(consultarRucDnit));

router.get('/', asyncHandler(listarProveedores));
router.get('/:id', asyncHandler(obtenerProveedor));
router.get('/:id/extracto', asyncHandler(extractoProveedor));
router.get('/:id/ajustes-saldo', permitirRolesOPermiso(['dueno', 'encargado'], 'gestionar_compras'), asyncHandler(historialAjustesSaldo));
router.get('/:id/lista-pedido', permitirRolesOPermiso(['dueno', 'encargado'], 'gestionar_compras'), asyncHandler(listaPedido));

router.post('/', permitirRolesOPermiso(['dueno', 'encargado'], 'gestionar_compras'), asyncHandler(crearProveedor));
router.post('/importar', permitirRolesOPermiso(['dueno', 'encargado'], 'gestionar_compras'), asyncHandler(importarProveedores));
router.patch('/:id', permitirRolesOPermiso(['dueno', 'encargado'], 'gestionar_compras'), asyncHandler(actualizarProveedor));
router.post('/:id/pagos', permitirRolesOPermiso(['dueno', 'encargado'], 'gestionar_compras'), asyncHandler(pagarProveedor));
router.post('/:id/ajustes-saldo', permitirRolesOPermiso(['dueno', 'encargado'], 'gestionar_compras'), asyncHandler(ajustarSaldo));

export default router;
