import { MercadoPagoConfig, Preference, Payment } from 'mercadopago';
import pool from '../db/pool.js';

function getMP() {
  return new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN });
}

// POST /api/pagos/preference
// Recibe un pedido_id, crea la preference en MP y devuelve el init_point
export async function createPreference(req, res) {
  const { pedido_id } = req.body;
  if (!pedido_id) return res.status(400).json({ error: 'pedido_id requerido' });

  try {
    // Traer pedido con items
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
        auto_return:        'approved',
        notification_url:   `${process.env.API_URL}/api/pagos/webhook`,
        statement_descriptor: 'BURGER MUST',
      },
    });

    // Guardar preference_id en el pedido
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
// MercadoPago notifica acá cuando cambia el estado de un pago
export async function webhook(req, res) {
  // Responder 200 inmediatamente para que MP no reintente
  res.sendStatus(200);

  const { type, data } = req.body;
  if (type !== 'payment') return;

  try {
    const paymentClient = new Payment(getMP());
    const payment = await paymentClient.get({ id: data.id });

    const pedido_id = Number(payment.external_reference);
    if (!pedido_id) return;

    const mp_status = payment.status; // approved | pending | rejected

    const nuevoEstado = mp_status === 'approved'
      ? 'nuevo'           // pago aprobado → pasa a cocina
      : mp_status === 'rejected'
        ? 'cancelado'
        : null;           // pending: no tocar

    if (nuevoEstado) {
      await pool.query(
        'UPDATE pedidos SET mp_payment_id = $1, mp_status = $2, estado = $3 WHERE id = $4',
        [String(payment.id), mp_status, nuevoEstado, pedido_id]
      );
    } else {
      await pool.query(
        'UPDATE pedidos SET mp_payment_id = $1, mp_status = $2 WHERE id = $3',
        [String(payment.id), mp_status, pedido_id]
      );
    }
  } catch (err) {
    console.error('[pagos/webhook]', err.message);
  }
}
