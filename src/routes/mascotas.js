import { Router } from 'express';
import { autenticar } from '../middleware/autenticar.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
    listarMascotas,
    obtenerMascota,
    crearMascota,
    actualizarMascota,
    crearVacuna,
    vacunasPorVencer,
} from '../controllers/mascotasController.js';

const router = Router();
router.use(autenticar);

// /vacunas-por-vencer antes de /:id, mismo criterio ya usado en productos.js
// / vendedores.js para que Express no lo confunda con un id de mascota.
router.get('/vacunas-por-vencer', asyncHandler(vacunasPorVencer));

// Abierto a cualquier rol logueado, igual que Vender/Reparaciones: no hace
// falta ningun permiso extra para registrar o consultar una mascota.
router.get('/', asyncHandler(listarMascotas));
router.post('/', asyncHandler(crearMascota));
router.get('/:id', asyncHandler(obtenerMascota));
router.patch('/:id', asyncHandler(actualizarMascota));
router.post('/:id/vacunas', asyncHandler(crearVacuna));

export default router;
