import { Router } from 'express';
import { login, register, me } from '../controllers/auth.controller.js';
import { requireAuth, requireRole } from '../middlewares/auth.js';
import { loginLimiter } from '../middlewares/rateLimit.js';

const router = Router();

router.post('/login',    loginLimiter, login);
router.post('/register', requireAuth, requireRole('admin'), register);
router.get ('/me',       requireAuth, me);

export default router;
