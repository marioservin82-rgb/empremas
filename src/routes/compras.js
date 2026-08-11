import { Router } from 'express';
import { autenticar } from '../middleware/autenticar.js';
import { permitirRolesOPermiso } from '../middleware/permitirRoles.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { crearCompra, listarCompras } from '../controllers/comprasController.js';

const router = Router();

router.use(autenticar);

// Registrar una compra (afecta costo y stock) es cosa de dueno/encargado,
// igual que editar precios o linea de credito.
router.post('/', permitirRolesOPermiso(['dueno', 'encargado'], 'gestionar_compras'), asyncHandler(crearCompra));
router.get('/', asyncHandler(listarCompras));

export default router;
