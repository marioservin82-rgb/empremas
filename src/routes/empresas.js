import { Router } from 'express';
import { autenticar } from '../middleware/autenticar.js';
import { permitirRoles, permitirRolesOPermiso } from '../middleware/permitirRoles.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
    obtenerEmpresaActual,
    actualizarConfiguracion,
    saludFinanciera,
    reporteCuentasPorCobrarYPagar,
    obtenerConfigSifen,
    actualizarConfigSifen,
    obtenerLogo,
    actualizarLogo,
    obtenerPresetRemision,
    actualizarPresetRemision,
} from '../controllers/empresasController.js';

const router = Router();

router.use(autenticar);

router.get('/actual', asyncHandler(obtenerEmpresaActual));
router.patch('/actual', permitirRoles('dueno'), asyncHandler(actualizarConfiguracion));
router.get('/salud-financiera', permitirRolesOPermiso(['dueno', 'encargado'], 'ver_reportes'), asyncHandler(saludFinanciera));
router.get('/reporte-saldos', permitirRolesOPermiso(['dueno', 'encargado'], 'ver_reportes'), asyncHandler(reporteCuentasPorCobrarYPagar));
router.get('/sifen', asyncHandler(obtenerConfigSifen));
router.patch('/sifen', permitirRoles('dueno'), asyncHandler(actualizarConfigSifen));
router.get('/logo', asyncHandler(obtenerLogo));
router.patch('/logo', permitirRoles('dueno'), asyncHandler(actualizarLogo));
router.get('/preset-remision', asyncHandler(obtenerPresetRemision));
router.put('/preset-remision', permitirRolesOPermiso(['dueno', 'encargado'], 'gestionar_compras'), asyncHandler(actualizarPresetRemision));

export default router;
