// Migração: criar tabelas camarotes, reservas_camarote, camarote_convidados
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

    // Usar mesmo search_path que a aplicação
    await pool.query(`SET search_path TO meu_backup_db, public`);
    console.log('search_path definido.');

    const migrationPath = path.join(__dirname, '../migrations/create_camarotes_tables_postgresql.sql');
    if (!fs.existsSync(migrationPath)) throw new Error('Migração não encontrada: ' + migrationPath);
    const sql = fs.readFileSync(migrationPath, 'utf8');
    await pool.query(sql);
    console.log('Migração create_camarotes_tables_postgresql executada com sucesso.');
  } catch (err) {
    console.error('Erro:', err.message);
    process.exit(1);
  } finally {
    if (pool) await pool.end();
  }
}

runMigration();
