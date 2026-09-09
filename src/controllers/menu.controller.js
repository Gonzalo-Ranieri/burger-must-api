import pool from '../db/pool.js';

// GET /api/menu  — público
export async function getMenu(req, res) {
  try {
    const { rows } = await pool.query(`
      SELECT p.id, p.nombre, p.descripcion, p.precio, p.badge,
             p.imagen_url, p.activo,
             c.nombre AS categoria, c.orden AS categoria_orden
      FROM productos p
      JOIN categorias c ON c.id = p.categoria_id
      WHERE p.activo = true
      ORDER BY c.orden, p.id
    `);
    res.json(rows);
  } catch (err) {
    console.error('[menu/getMenu]', err.message);
    res.status(500).json({ error: 'Error interno' });
  }
}

// GET /api/menu/all  — admin: incluye inactivos
export async function getAllProductos(req, res) {
  try {
    const { rows } = await pool.query(`
      SELECT p.*, c.nombre AS categoria
      FROM productos p
      JOIN categorias c ON c.id = p.categoria_id
      ORDER BY c.orden, p.id
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Error interno' });
  }
}

// POST /api/menu  — admin
export async function createProducto(req, res) {
  const { nombre, descripcion, precio, categoria, badge, imagen_url } = req.body;
  if (!nombre || !precio || !categoria) {
    return res.status(400).json({ error: 'nombre, precio y categoria son requeridos' });
  }
  try {
    const cat = await pool.query('SELECT id FROM categorias WHERE nombre = $1', [categoria]);
    if (!cat.rows[0]) return res.status(400).json({ error: 'Categoría inválida' });

    const { rows } = await pool.query(`
      INSERT INTO productos (nombre, descripcion, precio, categoria_id, badge, imagen_url)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *`,
      [nombre, descripcion || null, precio, cat.rows[0].id, badge || null, imagen_url || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('[menu/create]', err.message);
    res.status(500).json({ error: 'Error interno' });
  }
}

// PATCH /api/menu/:id  — admin
export async function updateProducto(req, res) {
  const { id } = req.params;
  const { nombre, descripcion, precio, categoria, badge, imagen_url, activo } = req.body;
  try {
    let categoria_id;
    if (categoria) {
      const cat = await pool.query('SELECT id FROM categorias WHERE nombre = $1', [categoria]);
      if (!cat.rows[0]) return res.status(400).json({ error: 'Categoría inválida' });
      categoria_id = cat.rows[0].id;
    }

    const fields = [];
    const vals   = [];
    let   idx    = 1;
    const add = (col, val) => { if (val !== undefined) { fields.push(`${col} = $${idx++}`); vals.push(val); } };

    add('nombre',       nombre);
    add('descripcion',  descripcion);
    add('precio',       precio);
    add('categoria_id', categoria_id);
    add('badge',        badge);
    add('imagen_url',   imagen_url);
    add('activo',       activo);

    if (!fields.length) return res.status(400).json({ error: 'Sin campos para actualizar' });

    vals.push(id);
    const { rows } = await pool.query(
      `UPDATE productos SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      vals
    );
    if (!rows[0]) return res.status(404).json({ error: 'Producto no encontrado' });
    res.json(rows[0]);
  } catch (err) {
    console.error('[menu/update]', err.message);
    res.status(500).json({ error: 'Error interno' });
  }
}

// DELETE /api/menu/:id  — admin (soft delete)
export async function deleteProducto(req, res) {
  try {
    const { rows } = await pool.query(
      'UPDATE productos SET activo = false WHERE id = $1 RETURNING id',
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Producto no encontrado' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Error interno' });
  }
}
