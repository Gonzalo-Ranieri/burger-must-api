import { Router } from 'express';
import { getDispositivos, cobrarConPoint, cancelarIntent, getEstadoCobro } from '../controllers/point.controller.js';
import { requireAuth, requireRole } from '../middlewares/auth.js';

const router = Router();

// Solo el cajero (admin) puede operar el posnet
router.use(requireAuth, requireRole('admin'));

router.get ('/dispositivos',          getDispositivos);   // listar Point vinculados
router.post('/cobrar',                cobrarConPoint);    // iniciar cobro en el Point
router.delete('/cobrar/:pedidoId',    cancelarIntent);    // cancelar cobro activo
router.get ('/estado/:pedidoId',      getEstadoCobro);   // consultar estado del cobro

export default router;
