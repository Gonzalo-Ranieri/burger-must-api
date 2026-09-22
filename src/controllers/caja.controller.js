import pool from '../db/pool.js';

// GET /api/caja/sesion-activa
export async function getSesionActiva(req, res) {
  try {
    const { rows } = await pool.query(`
      SELECT s.*,
        COALESCE(json_agg(m ORDER BY m.created_at DESC) FILTER (WHERE m.id IS NOT NULL), '[]') AS movimientos
      FROM caja_sesiones s
      LEFT JOIN caja_movimientos m ON m.sesion_id = s.id
      WHERE s.estado = 'abierta'
      GROUP BY s.id
      ORDER BY s.abierta_at DESC
      LIMIT 1
    `);
    res.json(rows[0] || null);
  } catch (err) {
    console.error('[caja/sesionActiva]', err.message);
    res.status(500).json({ error: 'Error interno' });
  }
}

// POST /api/caja/abrir
export async function abrirCaja(req, res) {
  const { fondo_inicial = 0, notas } = req.body;
  try {
    // Verificar que no haya sesión abierta
    const { rows: activas } = await pool.query(
      "SELECT id FROM caja_sesiones WHERE estado = 'abierta' LIMIT 1"
    );
    if (activas.length) {
      return res.status(409).json({ error: 'Ya hay una sesión de caja abierta', sesion_id: activas[0].id });
    }
    const { rows } = await pool.query(`
      INSERT INTO caja_sesiones (usuario_id, fondo_inicial, notas)
      VALUES ($1, $2, $3) RETURNING *`,
      [req.user.id, fondo_inicial, notas || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('[caja/abrir]', err.message);
    res.status(500).json({ error: 'Error interno' });
  }
}

// POST /api/caja/cerrar
export async function cerrarCaja(req, res) {
  const { notas } = req.body;
  try {
    // Buscar sesión activa
    const { rows: [sesion] } = await pool.query(
      "SELECT * FROM caja_sesiones WHERE estado = 'abierta' ORDER BY abierta_at DESC LIMIT 1"
    );
    if (!sesion) return res.status(404).json({ error: 'No hay sesión de caja abierta' });

    // Calcular totales desde pedidos del período
    const { rows: [totales] } = await pool.query(`
      SELECT
        COALESCE(SUM(total) FILTER (WHERE modo_pago = 'efectivo'), 0) AS total_efectivo,
        COALESCE(SUM(total) FILTER (WHERE modo_pago = 'online'),   0) AS total_online,
        COALESCE(SUM(total), 0)                                        AS total_ventas
      FROM pedidos
      WHERE estado NOT IN ('cancelado')
        AND created_at >= $1`,
      [sesion.abierta_at]
    );

    const { rows } = await pool.query(`
      UPDATE caja_sesiones
      SET estado = 'cerrada', cerrada_at = NOW(),
          total_efectivo = $1, total_online = $2,
          total_ventas = $3, notas = COALESCE($4, notas)
      WHERE id = $5 RETURNING *`,
      [totales.total_efectivo, totales.total_online, totales.total_ventas, notas || null, sesion.id]
    );
    res.json(rows[0]);
  } catch (err) {
    console.error('[caja/cerrar]', err.message);
    res.status(500).json({ error: 'Error interno' });
  }
}

// POST /api/caja/movimiento  — ingreso o egreso manual (propina, gasto, retiro)
export async function registrarMovimiento(req, res) {
  const { tipo, concepto, monto, pedido_id } = req.body;
  if (!tipo || !concepto || !monto) {
    return res.status(400).json({ error: 'tipo, concepto y monto son requeridos' });
  }
  try {
    const { rows: [sesion] } = await pool.query(
      "SELECT id FROM caja_sesiones WHERE estado = 'abierta' LIMIT 1"
    );
    if (!sesion) return res.status(404).json({ error: 'No hay sesión de caja abierta' });

    const { rows } = await pool.query(`
      INSERT INTO caja_movimientos (sesion_id, tipo, concepto, monto, pedido_id)
      VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [sesion.id, tipo, concepto, monto, pedido_id || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('[caja/movimiento]', err.message);
    res.status(500).json({ error: 'Error interno' });
  }
}

// GET /api/caja/historial?limite=30
export async function getHistorial(req, res) {
  const limite = Math.min(parseInt(req.query.limite) || 30, 90);
  try {
    const { rows } = await pool.query(`
      SELECT s.*,
        u.nombre AS abierta_por,
        COALESCE(json_agg(m ORDER BY m.created_at) FILTER (WHERE m.id IS NOT NULL), '[]') AS movimientos
      FROM caja_sesiones s
      JOIN usuarios u ON u.id = s.usuario_id
      LEFT JOIN caja_movimientos m ON m.sesion_id = s.id
      GROUP BY s.id, u.nombre
      ORDER BY s.abierta_at DESC
      LIMIT $1`,
      [limite]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Error interno' });
  }
}
