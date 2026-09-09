import { Router } from 'express';
import { createPreference, webhook } from '../controllers/pagos.controller.js';
import { requireAuth } from '../middlewares/auth.js';

const router = Router();

router.post('/preference', createPreference);   // llamado desde el frontend al confirmar pago online
router.post('/webhook',    webhook);            // llamado por MercadoPago (sin auth)

export default router;
