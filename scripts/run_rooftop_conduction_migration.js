// Migração: tabela rooftop_conduction (condução Fluxo Rooftop)
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
    await pool.query('SET search_path TO meu_backup_db, public');
    console.log('Conectando ao banco...');
    await pool.query('SELECT NOW()');
    console.log('Conectado.');

    const migrationPath = path.join(__dirname, '../migrations/create_rooftop_conduction_postgresql.sql');
    if (!fs.existsSync(migrationPath)) throw new Error('Migração não encontrada: ' + migrationPath);
    const sql = fs.readFileSync(migrationPath, 'utf8');
    await pool.query(sql);
    console.log('Migração rooftop_conduction executada com sucesso.');
  } catch (err) {
    console.error('Erro:', err.message);
    process.exit(1);
  } finally {
    if (pool) await pool.end();
  }
}

runMigration();
