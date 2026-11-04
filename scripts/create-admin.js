#!/usr/bin/env node
// Crea (o actualiza la password de) un usuario admin/cocina/cliente.
// Uso: npm run create-admin -- email@dominio.com "password larga" admin
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import pool from '../src/db/pool.js';
import logger from '../src/logger.js';

const [, , email, password, rol = 'admin'] = process.argv;

if (!email || !password) {
  logger.error('Uso: npm run create-admin -- email@dominio.com "password" [admin|cocina|cliente]');
  process.exit(1);
}
if (password.length < 8) {
  logger.error('La password debe tener al menos 8 caracteres');
  process.exit(1);
}
if (!['admin', 'cocina', 'cliente'].includes(rol)) {
  logger.error('Rol inválido. Usar admin, cocina o cliente.');
  process.exit(1);
}

const hash = await bcrypt.hash(password, 10);

try {
  const { rows } = await pool.query(
    `INSERT INTO usuarios (nombre, email, password, rol)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (email) DO UPDATE SET password = EXCLUDED.password, rol = EXCLUDED.rol
     RETURNING id, email, rol`,
    [rol === 'admin' ? 'Administrador' : rol === 'cocina' ? 'Cocina' : 'Cliente', email.toLowerCase().trim(), hash, rol]
  );
  logger.info('Usuario listo:', rows[0]);
} catch (err) {
  logger.error('Error creando usuario:', err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
