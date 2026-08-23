import { Router } from 'express';
import { loginAdmin } from '../controllers/authAdminController.js';
import { autenticarAdmin } from '../middleware/autenticarAdmin.js';
import {
    yo,
    cambiarPassword,
    listarEmpresas,
    obtenerEmpresa,
    actualizarEmpresa,
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

const router = Router();

router.post('/login', loginAdmin);

router.use(autenticarAdmin);

router.get('/yo', yo);
router.patch('/mi-password', cambiarPassword);
router.get('/empresas', listarEmpresas);
router.get('/empresas/:id', obtenerEmpresa);
router.patch('/empresas/:id', actualizarEmpresa);
router.post('/empresas/:id/pagos', registrarPago);
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
