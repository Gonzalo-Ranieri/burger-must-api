import pool from '../db/pool.js';

function generarNumero() {
  return `#${String(Math.floor(Math.random() * 9000) + 1000)}`;
}

// POST /api/pedidos  — cliente o público
export async function createPedido(req, res) {
  const { items, modo_entrega, modo_pago, nombre_cliente, notas } = req.body;

  if (!items?.length) {
    return res.status(400).json({ error: 'El pedido debe tener al menos un item' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Validar y calcular total con precios reales de la DB
    const ids = items.map(i => i.producto_id);
    const { rows: prods } = await client.query(
      'SELECT id, nombre, precio, activo FROM productos WHERE id = ANY($1)',
      [ids]
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

    // Insertar pedido
    const numero = generarNumero();
    const { rows: [pedido] } = await client.query(`
      INSERT INTO pedidos (numero, usuario_id, nombre_cliente, modo_entrega, modo_pago, total, notas)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *`,
      [
        numero,
        req.user?.id || null,
        nombre_cliente || null,
        modo_entrega || 'takeaway',
        modo_pago || 'efectivo',
        total,
        notas || null,
      ]
    );

    // Insertar items
    for (const item of itemsValidos) {
      await client.query(`
        INSERT INTO pedido_items (pedido_id, producto_id, nombre, precio_unit, cantidad, subtotal)
        VALUES ($1, $2, $3, $4, $5, $6)`,
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

// GET /api/pedidos  — admin y cocina
export async function getPedidos(req, res) {
  try {
    const { estado, fecha } = req.query;
    const conds = [];
    const vals  = [];

    if (estado) { conds.push(`p.estado = $${vals.length + 1}`); vals.push(estado); }
    if (fecha)  { conds.push(`DATE(p.created_at AT TIME ZONE 'America/Argentina/Buenos_Aires') = $${vals.length + 1}`); vals.push(fecha); }

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
      GROUP BY p.id`,
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Pedido no encontrado' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Error interno' });
  }
}

// PATCH /api/pedidos/:id/estado  — admin y cocina
export async function updateEstado(req, res) {
  const { estado } = req.body;
  const validos = ['nuevo','en preparación','listo','entregado','cancelado'];
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
