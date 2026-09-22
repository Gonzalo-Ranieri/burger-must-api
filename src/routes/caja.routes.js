import { Router } from 'express';
import { getSesionActiva, abrirCaja, cerrarCaja, registrarMovimiento, getHistorial } from '../controllers/caja.controller.js';
import { requireAuth, requireRole } from '../middlewares/auth.js';

const router = Router();

router.use(requireAuth, requireRole('admin'));

router.get ('/',               getSesionActiva);
router.post('/abrir',          abrirCaja);
router.post('/cerrar',         cerrarCaja);
router.post('/movimiento',     registrarMovimiento);
router.get ('/historial',      getHistorial);

export default router;
