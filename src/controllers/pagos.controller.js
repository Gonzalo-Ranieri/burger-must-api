import logger from '../logger.js';
import crypto from 'crypto';
import { MercadoPagoConfig, Preference, Payment } from 'mercadopago';
import pool from '../db/pool.js';

function getMP() {
  return new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN });
}

// Verifica la firma del webhook de MercadoPago (header x-signature).
// https://www.mercadopago.com.ar/developers/es/docs/your-integrations/notifications/webhooks#bookmark_verificar_el_origen_de_una_notificaci.C3.B3n
export function verifyMpSignature(req, dataId) {
  const secret = process.env.MP_WEBHOOK_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      logger.error('[webhook] MP_WEBHOOK_SECRET no configurado — rechazando notificación en producción');
      return false;
    }
    logger.warn('[webhook] MP_WEBHOOK_SECRET no configurado — firma sin verificar (solo permitido fuera de producción)');
    return true;
  }

  const signatureHeader = req.headers['x-signature'];
  const requestId = req.headers['x-request-id'];
  if (!signatureHeader || !dataId) return false;

  const parts = Object.fromEntries(
    signatureHeader.split(',').map(p => p.trim().split('=').map(s => s.trim()))
  );
  const { ts, v1 } = parts;
  if (!ts || !v1) return false;

  const manifest = `id:${dataId};request-id:${requestId ?? ''};ts:${ts};`;
  const expected = crypto.createHmac('sha256', secret).update(manifest).digest('hex');

  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(v1, 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// POST /api/pagos/preference  — checkout online
export async function createPreference(req, res) {
  const { pedido_id } = req.body;
  if (!pedido_id) return res.status(400).json({ error: 'pedido_id requerido' });

  try {
    const { rows } = await pool.query(`
      SELECT p.*, json_agg(json_build_object(
        'nombre', pi.nombre, 'cantidad', pi.cantidad, 'precio_unit', pi.precio_unit
      )) AS items
      FROM pedidos p
      JOIN pedido_items pi ON pi.pedido_id = p.id
      WHERE p.id = $1
      GROUP BY p.id`, [pedido_id]
    );
    const pedido = rows[0];
    if (!pedido) return res.status(404).json({ error: 'Pedido no encontrado' });
    if (pedido.modo_pago !== 'online') {
      return res.status(400).json({ error: 'El pedido no es de pago online' });
    }

    const preference = new Preference(getMP());
    const response = await preference.create({
      body: {
        external_reference: String(pedido.id),
        items: pedido.items.map(i => ({
          title:       i.nombre,
          quantity:    i.cantidad,
          unit_price:  i.precio_unit,
          currency_id: 'ARS',
        })),
        back_urls: {
          success: `${process.env.FRONTEND_URL}/pago/ok`,
          failure: `${process.env.FRONTEND_URL}/pago/error`,
          pending: `${process.env.FRONTEND_URL}/pago/pendiente`,
        },
        auto_return:          'approved',
        notification_url:     `${process.env.API_URL}/api/pagos/webhook`,
        statement_descriptor: 'BURGER MUST',
      },
    });

    await pool.query(
      'UPDATE pedidos SET mp_preference_id = $1 WHERE id = $2',
      [response.id, pedido_id]
    );

    res.json({ preference_id: response.id, init_point: response.init_point });
  } catch (err) {
    logger.error('[pagos/preference]', err.message);
    res.status(500).json({ error: 'Error al crear preference en MercadoPago' });
  }
}

// POST /api/pagos/webhook
// Recibe notificaciones de MP para pagos online Y cobros con Point.
// El body llega como Buffer crudo (ver express.raw en index.js) para poder
// verificar la firma antes de parsearlo.
export async function webhook(req, res) {
  let body;
  try {
    body = JSON.parse(req.body.toString('utf8'));
  } catch {
    return res.sendStatus(400);
  }

  const { type, data, action } = body;
  const dataId = data?.id ?? req.query['data.id'] ?? req.query.id;

  if (!verifyMpSignature(req, dataId)) {
    logger.warn('[webhook] Firma inválida o ausente — notificación descartada');
    return res.sendStatus(401);
  }

  res.sendStatus(200);  // responder inmediatamente para que MP no reintente

  // ── Pago online (Checkout Pro) ──────────────────────────────────────────
  if (type === 'payment') {
    try {
      const paymentClient = new Payment(getMP());
      const payment = await paymentClient.get({ id: data.id });
      const pedido_id = Number(payment.external_reference);
      if (!pedido_id) return;

      const mp_status = payment.status;
      // Solo mover a cocina si el pago está aprobado
      // y el pedido sigue en pendiente_caja (evitar doble procesamiento)
      const nuevoEstado =
        mp_status === 'approved' ? 'nuevo' :
        mp_status === 'rejected' ? 'cancelado' : null;

      if (nuevoEstado) {
        await pool.query(
          `UPDATE pedidos
           SET mp_payment_id = $1, mp_status = $2, estado = $3,
               mp_point_intent_id = NULL
           WHERE id = $4 AND estado = 'pendiente_caja'`,
          [String(payment.id), mp_status, nuevoEstado, pedido_id]
        );
      } else {
        await pool.query(
          'UPDATE pedidos SET mp_payment_id = $1, mp_status = $2 WHERE id = $3',
          [String(payment.id), mp_status, pedido_id]
        );
      }
    } catch (err) {
      logger.error('[webhook/payment]', err.message);
    }
    return;
  }

  // ── Point Plus: resultado de un intent ─────────────────────────────────
  // MP envía action = "point_integration_api" o type = "point_integration_wh"
  if (type === 'point_integration_wh' || action === 'point_integration_api') {
    try {
      const intentData = data ?? body;

      // El intent trae payment_id cuando está aprobado
      const paymentId  = intentData.payment_id;
      const intentId   = intentData.id;
      const status     = intentData.state;   // FINISHED | CANCELED | ERROR

      if (!intentId) return;

      // Buscar el pedido por intent_id
      const { rows } = await pool.query(
        'SELECT id FROM pedidos WHERE mp_point_intent_id = $1', [intentId]
      );
      const pedido = rows[0];
      if (!pedido) return;

      if (status === 'FINISHED' && paymentId) {
        // Verificar el pago real con la API de pagos
        const paymentClient = new Payment(getMP());
        const payment = await paymentClient.get({ id: paymentId });
        const mp_status = payment.status;

        const nuevoEstado =
          mp_status === 'approved' ? 'nuevo' :
          mp_status === 'rejected' ? 'cancelado' : null;

        await pool.query(
          `UPDATE pedidos
           SET mp_payment_id = $1, mp_status = $2,
               estado = COALESCE($3, estado),
               mp_point_intent_id = NULL
           WHERE id = $4`,
          [String(paymentId), mp_status, nuevoEstado, pedido.id]
        );
      } else if (status === 'CANCELED' || status === 'ERROR') {
        await pool.query(
          `UPDATE pedidos
           SET mp_status = $1, mp_point_intent_id = NULL
           WHERE id = $2`,
          [status.toLowerCase(), pedido.id]
        );
      }
    } catch (err) {
      logger.error('[webhook/point]', err.message);
    }
  }
}
