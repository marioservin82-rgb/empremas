import { Router } from 'express';
import { autenticar } from '../middleware/autenticar.js';
import { permitirRolesOPermiso } from '../middleware/permitirRoles.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { obtenerTurnoActual, abrirTurno, cerrarTurno, listarTurnos } from '../controllers/turnosController.js';
import { crearRetiro, listarRetirosDeTurno } from '../controllers/retirosCajaController.js';

const router = Router();

router.use(autenticar);

router.get('/actual', asyncHandler(obtenerTurnoActual));
// El historial de TODOS los turnos (con la diferencia de caja de cada
// cajero) es informacion de supervision, no algo que un cajero deba ver
// de sus compañeros — salvo que se le conceda ver_reportes puntualmente.
router.get('/', permitirRolesOPermiso(['dueno', 'encargado'], 'ver_reportes'), asyncHandler(listarTurnos));
router.post('/abrir', asyncHandler(abrirTurno));
router.post('/:id/cerrar', asyncHandler(cerrarTurno));
// Sin permitirRoles a nivel ruta a proposito: el filtro dueno/encargado
// directo vs. cajero-con-PIN vive adentro del controller, mismo patron
// que /ventas/:id/anular.
router.post('/:id/retiro', asyncHandler(crearRetiro));
router.get('/:id/retiros', asyncHandler(listarRetirosDeTurno));

export default router;
