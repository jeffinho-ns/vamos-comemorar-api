// Migração: Áreas Deck/Salão do Reserva Pinheiros em restaurant_areas (PostgreSQL)
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
    console.log('Conectando ao banco...');
    await pool.query('SELECT NOW()');
    console.log('Conectado.');

    const migrationPath = path.join(
      __dirname,
      '../migrations/2026-08-31_reserva_pinheiros_areas_postgresql.sql',
    );
    if (!fs.existsSync(migrationPath)) {
      throw new Error('Migração não encontrada: ' + migrationPath);
    }
    const sql = fs.readFileSync(migrationPath, 'utf8');
    await pool.query(sql);
    console.log('Migração reserva_pinheiros_areas executada com sucesso.');
  } catch (err) {
    console.error('Erro:', err.message);
    process.exit(1);
  } finally {
    if (pool) await pool.end();
  }
}

runMigration();
