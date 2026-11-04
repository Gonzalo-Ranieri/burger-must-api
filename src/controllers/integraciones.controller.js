/**
 * integraciones.controller.js
 *
 * Endpoint único para todas las plataformas de delivery:
 *   POST /api/integraciones/:origen/webhook
 *
 * Flujo:
 *   1. Recibe el webhook de Rappi / PedidosYa / ML / iFood / etc.
 *   2. Valida la firma HMAC si la plataforma la usa (TODO por plataforma)
 *   3. Normaliza el payload al modelo interno
 *   4. Busca los productos por nombre en nuestra DB (match fuzzy)
 *   5. Crea el pedido usando la misma lógica que createPedidoInterno
 *   6. Guarda el payload original en pedido_integraciones para auditoría
 *   7. Responde 200 inmediatamente (las apps delivery necesitan ACK rápido)
 */

import crypto from 'crypto';
import logger from '../logger.js';
import pool from '../db/pool.js';
import { normalizar, ORIGENES_SOPORTADOS } from '../integraciones/normalizador.js';

function generarNumero() {
  return `#${String(Math.floor(Math.random() * 9000) + 1000)}`;
}

// Cada plataforma de delivery se habilita seteando INTEGRACION_SECRET_<ORIGEN>
// (ej: INTEGRACION_SECRET_RAPPI) y enviando ese valor en el header
// x-integration-secret. Mientras no esté configurado, el webhook de ese
// origen queda deshabilitado — no se crean pedidos sin poder verificar
// que la notificación vino realmente de la plataforma.
export function verificarSecretoIntegracion(origen, req) {
  const secret = process.env[`INTEGRACION_SECRET_${origen.toUpperCase()}`];
  if (!secret) return false;

  const recibido = req.headers['x-integration-secret'];
  if (!recibido) return false;

  const a = Buffer.from(String(secret), 'utf8');
  const b = Buffer.from(String(recibido), 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// POST /api/integraciones/:origen/webhook
export async function recibirWebhook(req, res) {
  const { origen } = req.params;

  // Verificar que el origen está soportado
  if (!ORIGENES_SOPORTADOS.includes(origen)) {
    logger.warn(`[integraciones] Origen no soportado: ${origen}`);
    return res.sendStatus(404);
  }

  if (!verificarSecretoIntegracion(origen, req)) {
    logger.warn(`[integraciones/${origen}] Secreto ausente o inválido — webhook rechazado`);
    return res.sendStatus(401);
  }

  // Responder 200 de inmediato — las plataformas reenvían si no reciben ACK rápido
  res.sendStatus(200);

  const payload = req.body;
  logger.info(`[integraciones/${origen}] Webhook recibido`);

  try {
    // Normalizar al modelo interno
    const pedidoNorm = normalizar(origen, payload);

    // Verificar duplicado por origen_id
    const { rows: dup } = await pool.query(
      'SELECT id FROM pedidos WHERE origen = $1 AND origen_id = $2',
      [origen, pedidoNorm.origen_id]
    );
    if (dup.length) {
      logger.info(`[integraciones/${origen}] Pedido duplicado ignorado: ${pedidoNorm.origen_id}`);
      return;
    }

    // Resolver productos: buscar por nombre exacto primero, luego fuzzy
    const itemsResueltos = [];
    let total = 0;

    for (const item of pedidoNorm.items) {
      // Intentar match exacto primero
      let { rows } = await pool.query(
        `SELECT id, nombre, precio FROM productos
         WHERE activo = true AND LOWER(nombre) = LOWER($1)
         LIMIT 1`,
        [item.nombre]
      );

      // Si no hay match exacto, buscar por similitud
      if (!rows.length) {
        const res2 = await pool.query(
          `SELECT id, nombre, precio FROM productos
           WHERE activo = true AND LOWER(nombre) LIKE LOWER($1)
           LIMIT 1`,
          [`%${item.nombre.split(' ')[0]}%`]
        );
        rows = res2.rows;
      }

      // Si tampoco hay match, usar los datos de la plataforma sin producto_id
      const prod = rows[0];
      const precio_unit = prod?.precio ?? item.precio_unit ?? 0;
      const subtotal    = precio_unit * item.cantidad;
      total += subtotal;

      itemsResueltos.push({
        producto_id: prod?.id ?? null,
        nombre:      prod?.nombre ?? item.nombre,
        precio_unit,
        cantidad:    item.cantidad,
        subtotal,
      });
    }

    // Usar el total de la plataforma si es mayor (incluye delivery fees etc.)
    if (pedidoNorm.total > total) total = pedidoNorm.total;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Crear pedido — ya cobrado por la plataforma → estado "nuevo" directo
      const numero = generarNumero();
      const { rows: [pedido] } = await client.query(`
        INSERT INTO pedidos
          (numero, nombre_cliente, modo_entrega, modo_pago, total, notas,
           estado, mp_status, origen, origen_id)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        RETURNING *`,
        [
          numero,
          pedidoNorm.nombre_cliente,
          pedidoNorm.modo_entrega,
          pedidoNorm.modo_pago,
          total,
          pedidoNorm.notas,
          'nuevo',          // las plataformas ya cobraron → va directo a cocina
          pedidoNorm.mp_status,
          origen,
          pedidoNorm.origen_id,
        ]
      );

      // Insertar items
      for (const item of itemsResueltos) {
        await client.query(`
          INSERT INTO pedido_items
            (pedido_id, producto_id, nombre, precio_unit, cantidad, subtotal)
          VALUES ($1,$2,$3,$4,$5,$6)`,
          [pedido.id, item.producto_id, item.nombre, item.precio_unit, item.cantidad, item.subtotal]
        );
      }

      // Guardar payload original para auditoría
      await client.query(`
        INSERT INTO pedido_integraciones (pedido_id, origen, origen_id, payload_raw)
        VALUES ($1,$2,$3,$4)`,
        [pedido.id, origen, pedidoNorm.origen_id, JSON.stringify(payload)]
      );

      await client.query('COMMIT');
      logger.info(`[integraciones/${origen}] Pedido creado: ${numero} (id ${pedido.id})`);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    logger.error(`[integraciones/${origen}] Error:`, err.message);
    // Guardar el error para debugging — no queremos perder el pedido
    try {
      await pool.query(`
        INSERT INTO pedido_integraciones (pedido_id, origen, origen_id, payload_raw)
        VALUES (NULL, $1, NULL, $2)`,
        [origen, JSON.stringify({ error: err.message, payload })]
      );
    } catch {}
  }
}

// GET /api/integraciones — lista las integraciones activas y su estado
export async function getIntegraciones(req, res) {
  try {
    const { rows } = await pool.query(`
      SELECT
        origen,
        COUNT(*)                    AS pedidos_totales,
        COUNT(*) FILTER (WHERE DATE(created_at AT TIME ZONE 'America/Argentina/Buenos_Aires') = CURRENT_DATE) AS pedidos_hoy,
        MAX(created_at)             AS ultimo_pedido
      FROM pedidos
      WHERE origen != 'web' AND origen != 'caja'
      GROUP BY origen
      ORDER BY pedidos_totales DESC
    `);

    const integraciones = ORIGENES_SOPORTADOS.map(origen => ({
      origen,
      endpoint:        `/api/integraciones/${origen}/webhook`,
      estado:          'pendiente_configuracion',  // se actualiza cuando llegue el primer pedido
      ...( rows.find(r => r.origen === origen) ?? {} ),
    }));

    res.json(integraciones);
  } catch (err) {
    res.status(500).json({ error: 'Error interno' });
  }
}
