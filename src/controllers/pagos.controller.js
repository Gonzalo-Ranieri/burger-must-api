import { MercadoPagoConfig, Preference, Payment } from 'mercadopago';
import pool from '../db/pool.js';

function getMP() {
  return new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN });
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
    console.error('[pagos/preference]', err.message);
    res.status(500).json({ error: 'Error al crear preference en MercadoPago' });
  }
}

// POST /api/pagos/webhook
// Recibe notificaciones de MP para pagos online Y cobros con Point.
export async function webhook(req, res) {
  res.sendStatus(200);  // responder inmediatamente para que MP no reintente

  const { type, data, action } = req.body;

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
      console.error('[webhook/payment]', err.message);
    }
    return;
  }

  // ── Point Plus: resultado de un intent ─────────────────────────────────
  // MP envía action = "point_integration_api" o type = "point_integration_wh"
  if (type === 'point_integration_wh' || action === 'point_integration_api') {
    try {
      const intentData = data ?? req.body;

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
               ${nuevoEstado ? "estado = '" + nuevoEstado + "'," : ""}
               mp_point_intent_id = NULL
           WHERE id = $3`,
          [String(paymentId), mp_status, pedido.id]
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
      console.error('[webhook/point]', err.message);
    }
  }
}
