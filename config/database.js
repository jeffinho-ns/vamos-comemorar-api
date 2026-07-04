'use strict';

const { Pool } = require('pg');

/**
 * Pool PostgreSQL — exige DATABASE_URL (sem credenciais no código).
 * Local: export DATABASE_URL=postgresql://...
 * Render/prod: variável injetada pelo painel.
 */
function requireDatabaseUrl() {
  const url = process.env.DATABASE_URL;
  if (!url || !String(url).trim()) {
    throw new Error(
      'DATABASE_URL não definida. Configure no Render ou export DATABASE_URL antes de iniciar a API.',
    );
  }
  return url;
}

const connectionString = requireDatabaseUrl();
const isLocalDatabase = /localhost|127\.0\.0\.1/i.test(connectionString);

const pool = new Pool({
  connectionString,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 15000,
  ssl: !isLocalDatabase ? { rejectUnauthorized: false } : false,
  options:
    '-c search_path=meu_backup_db,public -c timezone=America/Sao_Paulo',
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle pool client:', err.message);
});

const { wrapPoolWithTenantRls } = require('../tenancy/poolRlsWrap');
wrapPoolWithTenantRls(pool);

module.exports = pool;
