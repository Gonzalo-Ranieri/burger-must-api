import { Router } from 'express';
import { getMenu, getAllProductos, createProducto, updateProducto, deleteProducto } from '../controllers/menu.controller.js';
import { requireAuth, requireRole } from '../middlewares/auth.js';

const router = Router();

router.get ('/',     getMenu);                                                        // público
router.get ('/all',  requireAuth, requireRole('admin'), getAllProductos);
router.post('/',     requireAuth, requireRole('admin'), createProducto);
router.patch('/:id', requireAuth, requireRole('admin'), updateProducto);
router.delete('/:id',requireAuth, requireRole('admin'), deleteProducto);

export default router;
