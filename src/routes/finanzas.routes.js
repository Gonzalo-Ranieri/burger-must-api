import { Router } from 'express';
import { getResumen, getHistorico } from '../controllers/finanzas.controller.js';
import { requireAuth, requireRole } from '../middlewares/auth.js';

const router = Router();

router.get('/resumen',   requireAuth, requireRole('admin'), getResumen);
router.get('/historico', requireAuth, requireRole('admin'), getHistorico);

export default router;
