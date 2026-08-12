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
} from '../controllers/adminController.js';

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

export default router;
