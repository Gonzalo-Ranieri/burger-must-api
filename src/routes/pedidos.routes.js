import { Router } from 'express';
import {
  createPedido, getPedidos, getPedidoById,
  updateEstado, confirmarPagoCaja,
} from '../controllers/pedidos.controller.js';
import { requireAuth, requireRole } from '../middlewares/auth.js';

const router = Router();

router.post('/',                    createPedido);                                    // público
router.get ('/',                    requireAuth, requireRole('admin','cocina'), getPedidos);
router.get ('/:id',                 requireAuth, requireRole('admin','cocina'), getPedidoById);
router.patch('/:id/estado',         requireAuth, requireRole('admin','cocina'), updateEstado);
router.post('/:id/confirmar-caja',  requireAuth, requireRole('admin'),          confirmarPagoCaja);

export default router;
