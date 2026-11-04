import { Router } from 'express';
import { recibirWebhook, getIntegraciones } from '../controllers/integraciones.controller.js';
import { requireAuth, requireRole } from '../middlewares/auth.js';
import { webhookLimiter } from '../middlewares/rateLimit.js';

const router = Router();

// Webhooks públicos — cada plataforma hace POST a su endpoint propio.
// La validación del secreto compartido se hace dentro del controller.
router.post('/:origen/webhook', webhookLimiter, recibirWebhook);

// Panel de integraciones — solo admin
router.get('/', requireAuth, requireRole('admin'), getIntegraciones);

export default router;
