import pool from '../db/pool.js';

// GET /api/stock
export async function getStock(req, res) {
  try {
    const { rows } = await pool.query(`
      SELECT * FROM insumos WHERE activo = true ORDER BY nombre
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Error interno' });
  }
}

// GET /api/stock/critico
export async function getStockCritico(req, res) {
  try {
    const { rows } = await pool.query('SELECT * FROM v_stock_critico');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Error interno' });
  }
}

// POST /api/stock  — crear insumo
export async function createInsumo(req, res) {
  const { nombre, unidad, stock_actual = 0, stock_minimo = 0 } = req.body;
  if (!nombre || !unidad) {
    return res.status(400).json({ error: 'nombre y unidad son requeridos' });
  }
  try {
    const { rows } = await pool.query(`
      INSERT INTO insumos (nombre, unidad, stock_actual, stock_minimo)
      VALUES ($1, $2, $3, $4) RETURNING *`,
      [nombre, unidad, stock_actual, stock_minimo]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Ya existe un insumo con ese nombre' });
    res.status(500).json({ error: 'Error interno' });
  }
}

// POST /api/stock/:id/movimiento  — entrada, salida o ajuste
export async function registrarMovimiento(req, res) {
  const { tipo, cantidad, motivo } = req.body;
  const { id } = req.params;
  if (!tipo || !cantidad) {
    return res.status(400).json({ error: 'tipo y cantidad son requeridos' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Actualizar stock según tipo
    const delta = tipo === 'entrada' ? cantidad : tipo === 'salida' ? -cantidad : 0;
    const { rows: [insumo] } = await client.query(`
      UPDATE insumos
      SET stock_actual = ${tipo === 'ajuste' ? '$1' : 'stock_actual + $1'}
      WHERE id = $2 AND activo = true
      RETURNING *`,
      [tipo === 'ajuste' ? cantidad : delta, id]
    );
    if (!insumo) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Insumo no encontrado' });
    }

    // Registrar movimiento
    const { rows: [mov] } = await client.query(`
      INSERT INTO stock_movimientos (insumo_id, tipo, cantidad, motivo, usuario_id)
      VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [id, tipo, cantidad, motivo || null, req.user.id]
    );

    await client.query('COMMIT');
    res.status(201).json({ insumo, movimiento: mov });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[stock/movimiento]', err.message);
    res.status(500).json({ error: 'Error interno' });
  } finally {
    client.release();
  }
}

// GET /api/stock/:id/historial
export async function getHistorialInsumo(req, res) {
  try {
    const { rows } = await pool.query(`
      SELECT m.*, u.nombre AS usuario
      FROM stock_movimientos m
      LEFT JOIN usuarios u ON u.id = m.usuario_id
      WHERE m.insumo_id = $1
      ORDER BY m.created_at DESC
      LIMIT 50`,
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Error interno' });
  }
}
