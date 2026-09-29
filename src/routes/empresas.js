import { Router } from 'express';
import multer from 'multer';
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
    actualizarFotoPortada,
    eliminarFotoPortada,
    obtenerPresetRemision,
    actualizarPresetRemision,
} from '../controllers/empresasController.js';

const subidaFotoPortada = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });

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
router.post('/foto-portada', permitirRoles('dueno'), subidaFotoPortada.single('foto'), asyncHandler(actualizarFotoPortada));
router.delete('/foto-portada', permitirRoles('dueno'), asyncHandler(eliminarFotoPortada));
router.get('/preset-remision', asyncHandler(obtenerPresetRemision));
router.put('/preset-remision', permitirRolesOPermiso(['dueno', 'encargado'], 'gestionar_compras'), asyncHandler(actualizarPresetRemision));

export default router;
