import { Router } from 'express';
import { getStock, getStockCritico, createInsumo, registrarMovimiento, getHistorialInsumo } from '../controllers/stock.controller.js';
import { requireAuth, requireRole } from '../middlewares/auth.js';

const router = Router();

router.use(requireAuth, requireRole('admin'));

router.get ('/',                getStock);
router.get ('/critico',         getStockCritico);
router.post('/',                createInsumo);
router.post('/:id/movimiento',  registrarMovimiento);
router.get ('/:id/historial',   getHistorialInsumo);

export default router;
