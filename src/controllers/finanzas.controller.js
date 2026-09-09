import pool from '../db/pool.js';

// GET /api/finanzas/resumen?fecha=2026-09-08
export async function getResumen(req, res) {
  const fecha = req.query.fecha || new Date().toISOString().slice(0, 10);
  try {
    const [kpis, porCategoria, porHora] = await Promise.all([
      // KPIs del día
      pool.query(`
        SELECT
          COUNT(*)                           AS pedidos,
          COALESCE(SUM(total), 0)            AS ventas_total,
          COALESCE(ROUND(AVG(total)), 0)     AS ticket_promedio,
          COUNT(*) FILTER (WHERE modo_pago = 'online')   AS pedidos_online,
          COUNT(*) FILTER (WHERE modo_pago = 'efectivo') AS pedidos_efectivo,
          COUNT(*) FILTER (WHERE estado = 'cancelado')   AS cancelados
        FROM pedidos
        WHERE DATE(created_at AT TIME ZONE 'America/Argentina/Buenos_Aires') = $1
          AND estado != 'cancelado'`,
        [fecha]
      ),
      // Ventas por categoría
      pool.query(`
        SELECT c.nombre AS categoria, SUM(pi.subtotal) AS total
        FROM pedido_items pi
        JOIN productos p  ON p.id = pi.producto_id
        JOIN categorias c ON c.id = p.categoria_id
        JOIN pedidos ped  ON ped.id = pi.pedido_id
        WHERE DATE(ped.created_at AT TIME ZONE 'America/Argentina/Buenos_Aires') = $1
          AND ped.estado != 'cancelado'
        GROUP BY c.nombre
        ORDER BY total DESC`,
        [fecha]
      ),
      // Pedidos por hora
      pool.query(`
        SELECT
          EXTRACT(HOUR FROM created_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::INT AS hora,
          COUNT(*) AS pedidos, SUM(total) AS ventas
        FROM pedidos
        WHERE DATE(created_at AT TIME ZONE 'America/Argentina/Buenos_Aires') = $1
          AND estado != 'cancelado'
        GROUP BY hora
        ORDER BY hora`,
        [fecha]
      ),
    ]);

    res.json({
      fecha,
      kpis:          kpis.rows[0],
      por_categoria: porCategoria.rows,
      por_hora:      porHora.rows,
    });
  } catch (err) {
    console.error('[finanzas/resumen]', err.message);
    res.status(500).json({ error: 'Error interno' });
  }
}

// GET /api/finanzas/historico?dias=30
export async function getHistorico(req, res) {
  const dias = Math.min(parseInt(req.query.dias) || 30, 365);
  try {
    const { rows } = await pool.query(
      'SELECT * FROM v_ventas_diarias LIMIT $1',
      [dias]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Error interno' });
  }
}
