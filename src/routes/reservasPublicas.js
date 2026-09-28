import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
    obtenerSalonPublico,
    listarServiciosPublico,
    listarProfesionalesPublico,
    disponibilidadPublica,
    crearCitaPublica,
} from '../controllers/reservasPublicasController.js';

const router = Router();

// Sin autenticar a proposito: a esto apunta la pagina publica de reservas,
// la clienta nunca tiene una sesion de EMPREMAS - mismo criterio que
// verificacion.js (el QR del recibo de cobro).
router.get('/salon/:slug', asyncHandler(obtenerSalonPublico));
router.get('/salon/:slug/servicios', asyncHandler(listarServiciosPublico));
router.get('/salon/:slug/profesionales', asyncHandler(listarProfesionalesPublico));
router.get('/salon/:slug/disponibilidad', asyncHandler(disponibilidadPublica));
router.post('/salon/:slug/citas', asyncHandler(crearCitaPublica));

export default router;
