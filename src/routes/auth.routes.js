import { Router } from 'express';
import { login, register, me } from '../controllers/auth.controller.js';
import { requireAuth, requireRole } from '../middlewares/auth.js';

const router = Router();

router.post('/login',    login);
router.post('/register', requireAuth, requireRole('admin'), register);
router.get ('/me',       requireAuth, me);

export default router;
