import pool from '../db/pool.js';

function generarNumero() {
  return `#${String(Math.floor(Math.random() * 9000) + 1000)}`;
}

/**
 * Estado inicial según modo de pago:
 *   efectivo  → "pendiente_caja"  (cajero confirma al cobrar)
 *   posnet    → "pendiente_caja"  (cajero confirma al pasar tarjeta)
 *   online    → "pendiente_caja"  (webhook de MP lo pasa a "nuevo" al aprobar)
 *
 * El pedido solo pasa a "nuevo" (visible en cocina) cuando el pago está confirmado.
 */
function estadoInicial() {
  return 'pendiente_caja';
}

// POST /api/pedidos
export async function createPedido(req, res) {
  const { items, modo_entrega, modo_pago, nombre_cliente, notas } = req.body;

  if (!items?.length) {
    return res.status(400).json({ error: 'El pedido debe tener al menos un item' });
  }
  if (!['efectivo','posnet','online'].includes(modo_pago)) {
    return res.status(400).json({ error: 'modo_pago inválido' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Validar precios desde la DB
    const ids = items.map(i => i.producto_id);
    const { rows: prods } = await client.query(
      'SELECT id, nombre, precio, activo FROM productos WHERE id = ANY($1)', [ids]
    );
    const prodMap = Object.fromEntries(prods.map(p => [p.id, p]));

    let total = 0;
    const itemsValidos = [];
    for (const item of items) {
      const prod = prodMap[item.producto_id];
      if (!prod || !prod.activo) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: `Producto ${item.producto_id} no disponible` });
      }
      const subtotal = prod.precio * item.cantidad;
      total += subtotal;
      itemsValidos.push({ ...item, nombre: prod.nombre, precio_unit: prod.precio, subtotal });
    }

    const numero = generarNumero();
    const { rows: [pedido] } = await client.query(`
      INSERT INTO pedidos
        (numero, usuario_id, nombre_cliente, modo_entrega, modo_pago, total, notas, estado)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      RETURNING *`,
      [
        numero,
        req.user?.id ?? null,
        nombre_cliente ?? null,
        modo_entrega ?? 'takeaway',
        modo_pago,
        total,
        notas ?? null,
        estadoInicial(),
      ]
    );

    for (const item of itemsValidos) {
      await client.query(`
        INSERT INTO pedido_items
          (pedido_id, producto_id, nombre, precio_unit, cantidad, subtotal)
        VALUES ($1,$2,$3,$4,$5,$6)`,
        [pedido.id, item.producto_id, item.nombre, item.precio_unit, item.cantidad, item.subtotal]
      );
    }

    await client.query('COMMIT');
    res.status(201).json({ ...pedido, items: itemsValidos });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[pedidos/create]', err.message);
    res.status(500).json({ error: 'Error interno' });
  } finally {
    client.release();
  }
}

// GET /api/pedidos
export async function getPedidos(req, res) {
  try {
    const { estado, fecha } = req.query;
    const conds = [];
    const vals  = [];

    if (estado) {
      // Soporte para múltiples estados separados por coma: ?estado=nuevo,en preparación
      const estados = estado.split(',').map(s => s.trim());
      conds.push(`p.estado = ANY($${vals.length + 1})`);
      vals.push(estados);
    }
    if (fecha) {
      conds.push(`DATE(p.created_at AT TIME ZONE 'America/Argentina/Buenos_Aires') = $${vals.length + 1}`);
      vals.push(fecha);
    }

    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

    const { rows } = await pool.query(`
      SELECT p.*,
        json_agg(json_build_object(
          'nombre', pi.nombre, 'cantidad', pi.cantidad,
          'precio_unit', pi.precio_unit, 'subtotal', pi.subtotal
        ) ORDER BY pi.id) AS items
      FROM pedidos p
      LEFT JOIN pedido_items pi ON pi.pedido_id = p.id
      ${where}
      GROUP BY p.id
      ORDER BY p.created_at DESC
    `, vals);

    res.json(rows);
  } catch (err) {
    console.error('[pedidos/get]', err.message);
    res.status(500).json({ error: 'Error interno' });
  }
}

// GET /api/pedidos/:id
export async function getPedidoById(req, res) {
  try {
    const { rows } = await pool.query(`
      SELECT p.*,
        json_agg(json_build_object(
          'nombre', pi.nombre, 'cantidad', pi.cantidad,
          'precio_unit', pi.precio_unit, 'subtotal', pi.subtotal
        ) ORDER BY pi.id) AS items
      FROM pedidos p
      LEFT JOIN pedido_items pi ON pi.pedido_id = p.id
      WHERE p.id = $1
      GROUP BY p.id`, [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Pedido no encontrado' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Error interno' });
  }
}

// PATCH /api/pedidos/:id/estado
export async function updateEstado(req, res) {
  const { estado } = req.body;
  const validos = ['pendiente_caja','nuevo','en preparación','listo','entregado','cancelado'];
  if (!validos.includes(estado)) {
    return res.status(400).json({ error: 'Estado inválido' });
  }
  try {
    const { rows } = await pool.query(
      'UPDATE pedidos SET estado = $1 WHERE id = $2 RETURNING *',
      [estado, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Pedido no encontrado' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Error interno' });
  }
}

// POST /api/pedidos/:id/confirmar-caja
// El cajero usa este endpoint al cobrar efectivo o posnet físicamente.
// Pasa el pedido de "pendiente_caja" → "nuevo" (entra a cocina).
export async function confirmarPagoCaja(req, res) {
  try {
    const { rows: [pedido] } = await pool.query(
      'SELECT * FROM pedidos WHERE id = $1', [req.params.id]
    );
    if (!pedido) return res.status(404).json({ error: 'Pedido no encontrado' });

    if (pedido.estado !== 'pendiente_caja') {
      return res.status(409).json({
        error: `El pedido ya está en estado "${pedido.estado}", no se puede confirmar`,
      });
    }
    if (!['efectivo','posnet'].includes(pedido.modo_pago)) {
      return res.status(400).json({
        error: 'Solo se puede confirmar manualmente un pago en efectivo o posnet',
      });
    }

    const { rows: [actualizado] } = await pool.query(
      `UPDATE pedidos
       SET estado = 'nuevo', mp_status = 'approved'
       WHERE id = $1 RETURNING *`,
      [pedido.id]
    );
    res.json(actualizado);
  } catch (err) {
    console.error('[pedidos/confirmarCaja]', err.message);
    res.status(500).json({ error: 'Error interno' });
  }
}
