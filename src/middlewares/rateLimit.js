import rateLimit from 'express-rate-limit';

// Login: pocos intentos por IP para frenar fuerza bruta de credenciales.
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos de inicio de sesión. Intentá de nuevo en unos minutos.' },
});

// Webhooks públicos (MercadoPago / integraciones de delivery): limita el
// abuso sin bloquear el tráfico legítimo de reintentos de las plataformas.
export const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
});
