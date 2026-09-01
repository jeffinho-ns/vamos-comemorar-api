const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const { requireDatabaseUrl } = require('../config/resolveDatabaseUrl');

async function runMigration() {
  let pool;
  try {
    const connectionString = requireDatabaseUrl();
    pool = new Pool({
      connectionString,
      ssl: connectionString.includes('render.com') ? { rejectUnauthorized: false } : undefined,
    });
    const sql = fs.readFileSync(
      path.join(__dirname, '../migrations/2026-08-31_reserva_pinheiros_restaurant_profile_postgresql.sql'),
      'utf8',
    );
    await pool.query(sql);
    console.log('Migração reserva_pinheiros_restaurant_profile executada com sucesso.');
  } catch (err) {
    console.error('Erro:', err.message);
    process.exit(1);
  } finally {
    if (pool) await pool.end();
  }
}

runMigration();
