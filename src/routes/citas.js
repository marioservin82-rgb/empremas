import { Router } from 'express';
import { autenticar } from '../middleware/autenticar.js';
import { permitirRolesOPermiso } from '../middleware/permitirRoles.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
    listarCitas,
    obtenerCita,
    crearCita,
    actualizarEstadoCita,
    listarProfesionales,
    crearProfesional,
    actualizarProfesional,
} from '../controllers/citasController.js';

const router = Router();
router.use(autenticar);

const gestionar = permitirRolesOPermiso(['dueno', 'encargado'], 'gestionar_citas');

// /profesionales antes de /:id, mismo criterio ya usado en productos.js /
// vendedores.js para que Express no lo confunda con un id de cita.
router.get('/profesionales', asyncHandler(listarProfesionales));
router.post('/profesionales', gestionar, asyncHandler(crearProfesional));
router.patch('/profesionales/:id', gestionar, asyncHandler(actualizarProfesional));

// Reservar/ver/cobrar una cita: abierto a cualquier rol logueado, igual
// que Vender - solo el ABM de profesionales necesita gestionar_citas.
router.get('/', asyncHandler(listarCitas));
router.post('/', asyncHandler(crearCita));
router.get('/:id', asyncHandler(obtenerCita));
router.patch('/:id/estado', asyncHandler(actualizarEstadoCita));

export default router;
