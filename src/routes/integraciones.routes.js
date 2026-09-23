import { Router } from 'express';
import { recibirWebhook, getIntegraciones } from '../controllers/integraciones.controller.js';
import { requireAuth, requireRole } from '../middlewares/auth.js';

const router = Router();

// Webhooks públicos — cada plataforma hace POST a su endpoint propio
// La validación de firma se hace dentro del controller por plataforma
router.post('/:origen/webhook', recibirWebhook);

// Panel de integraciones — solo admin
router.get('/', requireAuth, requireRole('admin'), getIntegraciones);

export default router;
