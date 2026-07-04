'use strict';

/**
 * Resolve PostgreSQL connection string a partir de env (sem credencial no código).
 *
 * Ordem: DATABASE_URL → POSTGRES_URL → montagem DB_* / PG*.
 */

require('dotenv').config();

function resolveDatabaseUrl() {
  const direct = [
    process.env.DATABASE_URL,
    process.env.POSTGRES_URL,
    process.env.INTERNAL_DATABASE_URL,
    process.env.RENDER_DATABASE_URL,
  ].find((v) => v && String(v).trim());

  if (direct) return String(direct).trim();

  const host = process.env.DB_HOST || process.env.PGHOST;
  const user = process.env.DB_USER || process.env.PGUSER;
  const password = process.env.DB_PASSWORD ?? process.env.PGPASSWORD;
  const database = process.env.DB_NAME || process.env.PGDATABASE;
  const port = process.env.DB_PORT || process.env.PGPORT || '5432';

  if (host && user && database && password != null && String(password).length > 0) {
    const encUser = encodeURIComponent(user);
    const encPass = encodeURIComponent(String(password));
    const needsSsl =
      process.env.DB_SSL === 'true' ||
      /render\.com|amazonaws|rds|supabase/i.test(String(host));
    const sslQuery = needsSsl ? '?sslmode=require' : '';
    return `postgresql://${encUser}:${encPass}@${host}:${port}/${database}${sslQuery}`;
  }

  return null;
}

function requireDatabaseUrl() {
  const url = resolveDatabaseUrl();
  if (!url) {
    throw new Error(
      'Conexão PostgreSQL não configurada. Defina DATABASE_URL (Render: Environment → ' +
        'Internal Database URL do Postgres) ou DB_HOST + DB_USER + DB_PASSWORD + DB_NAME.',
    );
  }
  return url;
}

module.exports = { resolveDatabaseUrl, requireDatabaseUrl };
