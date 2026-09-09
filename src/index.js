import 'dotenv/config';
import express from 'express';
import cors from 'cors';

import authRoutes     from './routes/auth.routes.js';
import menuRoutes     from './routes/menu.routes.js';
import pedidosRoutes  from './routes/pedidos.routes.js';
import pagosRoutes    from './routes/pagos.routes.js';
import finanzasRoutes from './routes/finanzas.routes.js';

const app  = express();
const PORT = process.env.PORT || 3000;

// ── MIDDLEWARES ─────────────────────────────────────────────────────────────
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
  const { default: bistrosoft } = await import('./services/bistrosoft.js');
  const bistro = await bistrosoft.healthCheck();
  res.json({ ok: true, ts: new Date().toISOString(), bistrosoft: bistro });
});

// ── RUTAS ───────────────────────────────────────────────────────────────────
app.use('/api/auth',     authRoutes);
app.use('/api/menu',     menuRoutes);
app.use('/api/pedidos',  pedidosRoutes);
app.use('/api/pagos',    pagosRoutes);
app.use('/api/finanzas', finanzasRoutes);

// ── 404 ─────────────────────────────────────────────────────────────────────
app.use((_, res) => res.status(404).json({ error: 'Ruta no encontrada' }));

// ── ERROR HANDLER ───────────────────────────────────────────────────────────
app.use((err, _, res, __) => {
  console.error('[server]', err.message);
  res.status(500).json({ error: 'Error interno del servidor' });
});

app.listen(PORT, () => {
  console.log(`[server] Burger Must API corriendo en puerto ${PORT}`);
});
