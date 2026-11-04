import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';

import logger from './logger.js';
import pool from './db/pool.js';
import authRoutes     from './routes/auth.routes.js';
import menuRoutes     from './routes/menu.routes.js';
import pedidosRoutes  from './routes/pedidos.routes.js';
import pagosRoutes    from './routes/pagos.routes.js';
import finanzasRoutes from './routes/finanzas.routes.js';
import cajaRoutes          from './routes/caja.routes.js';
import stockRoutes         from './routes/stock.routes.js';
import pointRoutes         from './routes/point.routes.js';
import integracionesRoutes from './routes/integraciones.routes.js';

// ── VALIDACIÓN DE VARIABLES DE ENTORNO ──────────────────────────────────────
const REQUERIDAS = ['DATABASE_URL', 'JWT_SECRET', 'MP_ACCESS_TOKEN', 'FRONTEND_URL'];
const faltantes = REQUERIDAS.filter(v => !process.env[v]);
if (faltantes.length) {
  logger.error(`[server] Faltan variables de entorno requeridas: ${faltantes.join(', ')}`);
  process.exit(1);
}
if (!process.env.MP_WEBHOOK_SECRET && process.env.NODE_ENV === 'production') {
  logger.error('[server] MP_WEBHOOK_SECRET no configurado — requerido en producción para validar webhooks de MercadoPago');
  process.exit(1);
}

const app  = express();
const PORT = process.env.PORT || 3000;

// ── MIDDLEWARES ─────────────────────────────────────────────────────────────
app.use(helmet());
app.use(cors({
  origin: [
    process.env.FRONTEND_URL,
    'http://localhost:5173',     // dev local
  ].filter(Boolean),
  credentials: true,
}));

// MercadoPago webhook necesita el body raw; el resto usa JSON
app.use('/api/pagos/webhook', express.raw({ type: 'application/json' }));
app.use(express.json());

// ── HEALTH CHECK ────────────────────────────────────────────────────────────
app.get('/health', async (_, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true, db: 'up', ts: new Date().toISOString() });
  } catch (err) {
    logger.error('[health]', err.message);
    res.status(503).json({ ok: false, db: 'down', ts: new Date().toISOString() });
  }
});

// ── RUTAS ───────────────────────────────────────────────────────────────────
app.use('/api/auth',     authRoutes);
app.use('/api/menu',     menuRoutes);
app.use('/api/pedidos',  pedidosRoutes);
app.use('/api/pagos',    pagosRoutes);
app.use('/api/finanzas', finanzasRoutes);
app.use('/api/caja',          cajaRoutes);
app.use('/api/stock',         stockRoutes);
app.use('/api/point',         pointRoutes);
app.use('/api/integraciones', integracionesRoutes);

// ── 404 ─────────────────────────────────────────────────────────────────────
app.use((_, res) => res.status(404).json({ error: 'Ruta no encontrada' }));

// ── ERROR HANDLER ───────────────────────────────────────────────────────────
app.use((err, _, res, __) => {
  logger.error('[server]', err.message);
  res.status(500).json({ error: 'Error interno del servidor' });
});

app.listen(PORT, '0.0.0.0', () => {
  logger.info(`[server] Burger Must API corriendo en puerto ${PORT}`);
});
