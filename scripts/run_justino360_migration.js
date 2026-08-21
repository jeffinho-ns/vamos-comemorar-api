/**
 * Aplica migration Justino360 (idempotente / produção-safe).
 * Uso: node scripts/run_justino360_migration.js
 *
 * Requer DATABASE_URL (ou DB_HOST+DB_USER+DB_PASSWORD+DB_NAME) no ambiente/.env
 */
'use strict';

const fs = require('fs');
const path = require('path');
const pool = require('../config/database');

async function run() {
  const sqlPath = path.join(
    __dirname,
    '../migrations/2026-08-20_justino360_module.sql',
  );
  if (!fs.existsSync(sqlPath)) {
    throw new Error(`Migration não encontrada: ${sqlPath}`);
  }
  const sql = fs.readFileSync(sqlPath, 'utf8');
  const client = await pool.connect();
  try {
    console.log('🚀 Aplicando Justino360 migration (transação)...');
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('COMMIT');
    console.log('✅ Migration Justino360 aplicada com sucesso.');

    const checks = await client.query(`
      SELECT
        (SELECT COUNT(*)::int FROM modules WHERE key = 'justino360') AS module_ok,
        (SELECT COUNT(*)::int FROM information_schema.tables
           WHERE table_schema = 'public' AND table_name LIKE 'j360_%') AS j360_tables,
        (SELECT COUNT(*)::int FROM j360_sectors WHERE establishment_id = 1) AS sectors,
        (SELECT COUNT(*)::int FROM j360_checklist_templates WHERE establishment_id = 1) AS templates
    `);
    console.log('📊 Verificação:', checks.rows[0]);
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (_) {
      /* ignore */
    }
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((err) => {
  console.error('❌ Falha na migration Justino360:', err.message);
  process.exit(1);
});
