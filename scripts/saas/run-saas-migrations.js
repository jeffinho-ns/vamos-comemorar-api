'use strict';

/**
 * Runner idempotente das migrations SaaS (migrations/saas/*.sql).
 *
 * Diferente dos scripts pontuais legados, este mantém uma tabela de controle
 * (meu_backup_db.saas_schema_migrations) e aplica cada arquivo .sql UMA vez,
 * em ordem alfabética (001_, 002_, ...), dentro de uma transação.
 *
 * TRAVA DE SEGURANÇA: por padrão roda em DRY-RUN (só lista o que faria).
 * Para aplicar de fato é preciso passar SAAS_MIGRATE_CONFIRM=apply.
 * NUNCA rode apontando para o banco de produção sem backup + staging antes.
 *
 * Uso:
 *   node scripts/saas/run-saas-migrations.js                 # dry-run (lista pendentes)
 *   SAAS_MIGRATE_CONFIRM=apply node scripts/saas/run-saas-migrations.js   # aplica
 */

const fs = require('fs');
const path = require('path');
const pool = require('../../config/database');

const MIGRATIONS_DIR = path.join(__dirname, '..', '..', 'migrations', 'saas');
const CONTROL_TABLE = 'meu_backup_db.saas_schema_migrations';

async function ensureControlTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${CONTROL_TABLE} (
      filename   varchar(255) PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);
}

async function getApplied() {
  const { rows } = await pool.query(`SELECT filename FROM ${CONTROL_TABLE}`);
  return new Set(rows.map((r) => r.filename));
}

function listMigrationFiles() {
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();
}

async function applyMigration(filename) {
  const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, filename), 'utf8');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(sql);
    await client.query(
      `INSERT INTO ${CONTROL_TABLE} (filename) VALUES ($1) ON CONFLICT (filename) DO NOTHING`,
      [filename],
    );
    await client.query('COMMIT');
    console.log(`✅ aplicada: ${filename}`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(`❌ falhou: ${filename} — ${err.message}`);
    throw err;
  } finally {
    client.release();
  }
}

async function main() {
  const confirm = String(process.env.SAAS_MIGRATE_CONFIRM || '').toLowerCase();
  const apply = confirm === 'apply';

  await ensureControlTable();
  const applied = await getApplied();
  const pending = listMigrationFiles().filter((f) => !applied.has(f));

  if (pending.length === 0) {
    console.log('Nenhuma migration SaaS pendente. Banco já está em dia.');
    await pool.end();
    return;
  }

  console.log(`Migrations SaaS pendentes (${pending.length}):`);
  pending.forEach((f) => console.log(`  - ${f}`));

  if (!apply) {
    console.log('\nDRY-RUN: nada foi aplicado.');
    console.log('Para aplicar: SAAS_MIGRATE_CONFIRM=apply node scripts/saas/run-saas-migrations.js');
    await pool.end();
    return;
  }

  console.log('\nAplicando migrations...');
  for (const filename of pending) {
    await applyMigration(filename); // sequencial: a ordem importa
  }
  console.log('\nConcluído.');
  await pool.end();
}

main().catch((err) => {
  console.error('Erro no runner de migrations SaaS:', err);
  process.exit(1);
});
