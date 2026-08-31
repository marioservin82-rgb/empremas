import { Router } from 'express';
import { loginAdmin } from '../controllers/authAdminController.js';
import { autenticarAdmin } from '../middleware/autenticarAdmin.js';
import {
    yo,
    cambiarPassword,
    listarEmpresas,
    obtenerEmpresa,
    actualizarEmpresa,
    eliminarEmpresa,
    resetearPasswordDueno,
    registrarPago,
    obtenerConfiguracion,
    actualizarConfiguracion,
    listarNovedades,
    crearNovedad,
} from '../controllers/adminController.js';
import {
    listarContadores,
    crearContador,
    obtenerContador,
    actualizarContador,
    comisionesDelPeriodo,
    marcarPagado,
} from '../controllers/contadoresController.js';
import {
    obtenerEstado as obtenerEstadoSifen,
    darDeAlta as darDeAltaSifen,
    correrHomologacion as correrHomologacionSifen,
    pasarAProduccion as pasarAProduccionSifen,
    actualizarEmisor as actualizarEmisorSifen,
    actualizarDocumentosHabilitados as actualizarDocsHabilitados,
    ajustarNumeracion as ajustarNumeracionSifen,
    reiniciarNumeracion as reiniciarNumeracionSifen,
    inutilizarRango as inutilizarRangoSifen,
} from '../controllers/facturacionElectronicaController.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();

router.post('/login', loginAdmin);

router.use(autenticarAdmin);

router.get('/yo', yo);
router.patch('/mi-password', cambiarPassword);
router.get('/empresas', listarEmpresas);
router.get('/empresas/:id', obtenerEmpresa);
router.patch('/empresas/:id', actualizarEmpresa);
router.delete('/empresas/:id', asyncHandler(eliminarEmpresa));
router.post('/empresas/:id/resetear-password-dueno', asyncHandler(resetearPasswordDueno));
router.post('/empresas/:id/pagos', registrarPago);
router.get('/empresas/:id/facturacion-electronica', asyncHandler(obtenerEstadoSifen));
router.post('/empresas/:id/facturacion-electronica', asyncHandler(darDeAltaSifen));
router.post('/empresas/:id/facturacion-electronica/homologacion', asyncHandler(correrHomologacionSifen));
router.patch('/empresas/:id/facturacion-electronica', asyncHandler(pasarAProduccionSifen));
router.patch('/empresas/:id/facturacion-electronica/emisor', asyncHandler(actualizarEmisorSifen));
router.put('/empresas/:id/documentos-habilitados', asyncHandler(actualizarDocsHabilitados));
router.post('/empresas/:id/facturacion-electronica/numeracion', asyncHandler(ajustarNumeracionSifen));
router.post('/empresas/:id/facturacion-electronica/reiniciar-numeracion', asyncHandler(reiniciarNumeracionSifen));
router.post('/empresas/:id/facturacion-electronica/inutilizar', asyncHandler(inutilizarRangoSifen));
router.get('/configuracion', obtenerConfiguracion);
router.patch('/configuracion', actualizarConfiguracion);
router.get('/novedades', listarNovedades);
router.post('/novedades', crearNovedad);
router.get('/contadores', listarContadores);
router.post('/contadores', crearContador);
router.get('/contadores/:id', obtenerContador);
router.patch('/contadores/:id', actualizarContador);
router.get('/contadores/:id/comisiones', comisionesDelPeriodo);
router.post('/contadores/:id/comisiones/marcar-pagado', marcarPagado);

export default router;
