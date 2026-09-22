/**
 * point.controller.js
 * Integración con MercadoPago Point Plus (lector físico).
 *
 * Flujo:
 *   1. POST /api/point/cobrar      → crea un payment intent en el Point
 *   2. El dispositivo muestra el monto y espera tarjeta/NFC del cliente
 *   3. POST /api/pagos/webhook     → MP notifica el resultado (aprobado/rechazado)
 *   4. DELETE /api/point/cobrar/:pedidoId → cancela el intent si el cajero lo necesita
 *   5. GET /api/point/dispositivos → lista los Point vinculados a la cuenta
 *
 * Variables de entorno necesarias:
 *   MP_ACCESS_TOKEN   — ya existente
 *   MP_POINT_DEVICE_ID — ID del dispositivo Point Plus (se obtiene con GET /dispositivos)
 */

import pool from '../db/pool.js';

const MP_BASE = 'https://api.mercadopago.com';

function mpHeaders() {
  return {
    'Authorization': `Bearer ${process.env.MP_ACCESS_TOKEN}`,
    'Content-Type':  'application/json',
    'X-Idempotency-Key': `bm-${Date.now()}`,
  };
}

// GET /api/point/dispositivos
// Lista los Point vinculados. Usar una vez para obtener el MP_POINT_DEVICE_ID.
export async function getDispositivos(req, res) {
  try {
    const r = await fetch(`${MP_BASE}/point/integration-api/devices`, {
      headers: mpHeaders(),
    });
    const data = await r.json();
    if (!r.ok) return res.status(r.status).json({ error: data.message ?? 'Error MP' });
    res.json(data);
  } catch (err) {
    console.error('[point/dispositivos]', err.message);
    res.status(500).json({ error: 'Error interno' });
  }
}

// POST /api/point/cobrar
// Body: { pedido_id }
// Envía la orden al Point Plus para que el cliente pague con tarjeta o NFC.
export async function cobrarConPoint(req, res) {
  const { pedido_id } = req.body;
  if (!pedido_id) return res.status(400).json({ error: 'pedido_id requerido' });

  const deviceId = process.env.MP_POINT_DEVICE_ID;
  if (!deviceId) {
    return res.status(503).json({
      error: 'Dispositivo Point no configurado. Agregá MP_POINT_DEVICE_ID en las variables de entorno.',
    });
  }

  try {
    // Traer pedido
    const { rows } = await pool.query(
      'SELECT * FROM pedidos WHERE id = $1', [pedido_id]
    );
    const pedido = rows[0];
    if (!pedido) return res.status(404).json({ error: 'Pedido no encontrado' });
    if (pedido.modo_pago !== 'posnet') {
      return res.status(400).json({ error: 'El pedido no está marcado como pago posnet' });
    }
    if (pedido.mp_status === 'approved') {
      return res.status(409).json({ error: 'El pedido ya fue cobrado' });
    }

    // Crear payment intent en el Point
    const body = {
      amount:             pedido.total,
      description:        `Burger Must · Pedido ${pedido.numero}`,
      payment: {
        installments:        1,
        type:               'credit_card',    // acepta débito y crédito igual
        installments_cost:  'seller',
      },
      additional_info: {
        external_reference: String(pedido.id),
        print_on_terminal:  true,             // imprime ticket en el Point Smart si aplica
      },
    };

    const r = await fetch(
      `${MP_BASE}/point/integration-api/devices/${deviceId}/payment-intents`,
      { method: 'POST', headers: mpHeaders(), body: JSON.stringify(body) }
    );
    const data = await r.json();
    if (!r.ok) {
      console.error('[point/cobrar] MP error:', JSON.stringify(data));
      return res.status(r.status).json({ error: data.message ?? 'Error al crear intent en Point' });
    }

    // Guardar intent_id para poder cancelarlo si es necesario
    await pool.query(
      'UPDATE pedidos SET mp_point_intent_id = $1, mp_status = $2 WHERE id = $3',
      [data.id, 'pending', pedido_id]
    );

    res.json({
      intent_id:  data.id,
      estado:     'pendiente',
      mensaje:    'El monto fue enviado al Point Plus. Esperando pago del cliente.',
    });
  } catch (err) {
    console.error('[point/cobrar]', err.message);
    res.status(500).json({ error: 'Error interno' });
  }
}

// DELETE /api/point/cobrar/:pedidoId
// Cancela el intent activo si el cajero necesita anularlo.
export async function cancelarIntent(req, res) {
  const deviceId = process.env.MP_POINT_DEVICE_ID;
  if (!deviceId) return res.status(503).json({ error: 'Dispositivo no configurado' });

  try {
    const { rows } = await pool.query(
      'SELECT mp_point_intent_id FROM pedidos WHERE id = $1', [req.params.pedidoId]
    );
    const pedido = rows[0];
    if (!pedido?.mp_point_intent_id) {
      return res.status(404).json({ error: 'No hay intent activo para este pedido' });
    }

    const r = await fetch(
      `${MP_BASE}/point/integration-api/devices/${deviceId}/payment-intents/${pedido.mp_point_intent_id}`,
      { method: 'DELETE', headers: mpHeaders() }
    );
    if (!r.ok) {
      const data = await r.json();
      return res.status(r.status).json({ error: data.message ?? 'Error al cancelar en MP' });
    }

    await pool.query(
      'UPDATE pedidos SET mp_point_intent_id = NULL, mp_status = NULL WHERE id = $1',
      [req.params.pedidoId]
    );
    res.json({ ok: true, mensaje: 'Intent cancelado en el Point' });
  } catch (err) {
    console.error('[point/cancelar]', err.message);
    res.status(500).json({ error: 'Error interno' });
  }
}

// GET /api/point/estado/:pedidoId
// Consulta el estado actual del cobro (útil para polling desde el frontend).
export async function getEstadoCobro(req, res) {
  try {
    const { rows } = await pool.query(
      'SELECT numero, total, mp_status, mp_payment_id, mp_point_intent_id FROM pedidos WHERE id = $1',
      [req.params.pedidoId]
    );
    const pedido = rows[0];
    if (!pedido) return res.status(404).json({ error: 'Pedido no encontrado' });

    res.json({
      pedido_id:   req.params.pedidoId,
      numero:      pedido.numero,
      total:       pedido.total,
      mp_status:   pedido.mp_status,           // null | pending | approved | rejected
      intent_id:   pedido.mp_point_intent_id,
      payment_id:  pedido.mp_payment_id,
    });
  } catch (err) {
    res.status(500).json({ error: 'Error interno' });
  }
}
