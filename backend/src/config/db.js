require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' && process.env.DB_SSL !== 'false'
    ? { rejectUnauthorized: false }
    : false,
  max: parseInt(process.env.DB_POOL_MAX || '10', 10),
  idleTimeoutMillis: parseInt(process.env.DB_POOL_IDLE_TIMEOUT_MS || '10000', 10),
  connectionTimeoutMillis: parseInt(process.env.DB_POOL_CONNECTION_TIMEOUT_MS || '2000', 10),
});

pool.on('error', (err) => {
  // Lazy require evita ciclo di dipendenze (logger non dipende da db, ma per
  // sicurezza richiediamolo solo qui dentro all'errore)
  const logger = require('../lib/logger');
  logger.error({ err }, 'Unexpected DB pool error');
});

module.exports = pool;
