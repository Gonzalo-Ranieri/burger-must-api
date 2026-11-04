#!/usr/bin/env node
// Runner de migraciones mínimo: aplica en orden los .sql de sql/migrations/
// que todavía no estén registrados en la tabla schema_migrations.
// Uso: npm run migrate
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pool from '../src/db/pool.js';
import logger from '../src/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(__dirname, '..', 'sql', 'migrations');

async function main() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id         TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const { rows } = await pool.query('SELECT id FROM schema_migrations');
  const aplicadas = new Set(rows.map(r => r.id));

  const archivos = fs.readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .sort();

  let corridas = 0;
  for (const archivo of archivos) {
    if (aplicadas.has(archivo)) continue;

    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, archivo), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (id) VALUES ($1)', [archivo]);
      await client.query('COMMIT');
      logger.info(`[migrate] Aplicada: ${archivo}`);
      corridas++;
    } catch (err) {
      await client.query('ROLLBACK');
      logger.error(`[migrate] Error aplicando ${archivo}:`, err.message);
      process.exitCode = 1;
      break;
    } finally {
      client.release();
    }
  }

  if (!corridas) logger.info('[migrate] Nada para aplicar, ya está todo al día.');
  await pool.end();
}

main();
