import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const { Pool } = pg;

// Soporte para connection string completa O variables separadas
// Las variables separadas evitan problemas con caracteres especiales en la contraseña
const pool = process.env.DATABASE_URL && process.env.DATABASE_URL.startsWith('postgresql')
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      max: 10,
      idleTimeoutMillis: 30000,
    })
  : new Pool({
      host:     process.env.DB_HOST,
      port:     Number(process.env.DB_PORT) || 6543,
      database: process.env.DB_NAME,
      user:     process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      ssl:      { rejectUnauthorized: false },
      max:      10,
      idleTimeoutMillis: 30000,
    });

pool.on('error', (err) => {
  console.error('[DB] Error inesperado en el pool:', err.message);
});

export default pool;
