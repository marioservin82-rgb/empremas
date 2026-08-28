import { Router } from 'express';
import { autenticar } from '../middleware/autenticar.js';
import { permitirRolesOPermiso } from '../middleware/permitirRoles.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { crearCompra, listarCompras, obtenerCompra, anularCompra, editarCompra } from '../controllers/comprasController.js';

const router = Router();

router.use(autenticar);

// Registrar una compra (afecta costo y stock) es cosa de dueno/encargado,
// igual que editar precios o linea de credito.
router.post('/', permitirRolesOPermiso(['dueno', 'encargado'], 'gestionar_compras'), asyncHandler(crearCompra));
router.get('/', asyncHandler(listarCompras));
router.get('/:id', asyncHandler(obtenerCompra));
router.patch('/:id', permitirRolesOPermiso(['dueno', 'encargado'], 'gestionar_compras'), asyncHandler(editarCompra));
router.post('/:id/anular', permitirRolesOPermiso(['dueno', 'encargado'], 'gestionar_compras'), asyncHandler(anularCompra));

export default router;
