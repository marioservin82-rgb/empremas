import { Router } from 'express';
import { autenticar } from '../middleware/autenticar.js';
import { permitirRoles, permitirRolesOPermiso } from '../middleware/permitirRoles.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { obtenerTurnoActual, abrirTurno, cerrarTurno, listarTurnos } from '../controllers/turnosController.js';
import { crearRetiro, crearEntrega, listarRetirosDeTurno } from '../controllers/retirosCajaController.js';

const router = Router();

router.use(autenticar);

router.get('/actual', asyncHandler(obtenerTurnoActual));
// El historial de TODOS los turnos (con la diferencia de caja de cada
// cajero) es informacion de supervision, no algo que un cajero deba ver
// de sus compañeros — salvo que se le conceda ver_reportes puntualmente.
router.get('/', permitirRolesOPermiso(['dueno', 'encargado'], 'ver_reportes'), asyncHandler(listarTurnos));
// El mesero nunca abre/cierra/retira de su propia caja (vende contra el
// turno compartido que ya abrio el cajero/encargado/dueno, ver
// turnoCompartidoDeSucursal en el modulo de Lomiteria) - excluido a
// proposito de estas tres.
router.post('/abrir', permitirRoles('dueno', 'encargado', 'cajero'), asyncHandler(abrirTurno));
router.post('/:id/cerrar', permitirRoles('dueno', 'encargado', 'cajero'), asyncHandler(cerrarTurno));
// Sin permitirRoles mas alla de excluir mesero: el filtro dueno/encargado
// directo vs. cajero-con-PIN vive adentro del controller, mismo patron
// que /ventas/:id/anular.
router.post('/:id/retiro', permitirRoles('dueno', 'encargado', 'cajero'), asyncHandler(crearRetiro));
// A diferencia de /retiro, esta SI lleva permitirRoles: el mesero cobra en
// la mesa pero nunca tiene acceso a la caja - siempre es el cajero (o
// encargado/dueno) quien registra que recibió ese efectivo (ver Contexto
// del modulo de Lomiteria en el plan).
router.post('/:id/entrega', permitirRoles('dueno', 'encargado', 'cajero'), asyncHandler(crearEntrega));
router.get('/:id/retiros', asyncHandler(listarRetirosDeTurno));

export default router;
