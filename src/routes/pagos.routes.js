import { Router } from 'express';
import { createPreference, webhook } from '../controllers/pagos.controller.js';
import { requireAuth } from '../middlewares/auth.js';
import { webhookLimiter } from '../middlewares/rateLimit.js';

const router = Router();

router.post('/preference', createPreference);   // llamado desde el frontend al confirmar pago online
router.post('/webhook', webhookLimiter, webhook); // llamado por MercadoPago (firma verificada en el controller)

export default router;
