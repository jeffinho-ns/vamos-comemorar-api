/**
 * Executa migrations/2026-08-05_openai_usage_events.sql usando o pool da API.
 * Cria a tabela openai_usage_events (telemetria de tokens por turno/casa).
 * Uso: node scripts/run_openai_usage_events_migration.js
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const pool = require('../config/database');

function stripLineComments(sql) {
  return sql
    .split('\n')
    .filter((line) => !/^\s*--/.test(line))
    .join('\n');
}

function splitStatements(sql) {
  const cleaned = stripLineComments(sql);
  return cleaned
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);
}

async function main() {
  const file = path.join(__dirname, '..', 'migrations', '2026-08-05_openai_usage_events.sql');
  const sql = fs.readFileSync(file, 'utf8');
  const statements = splitStatements(sql);
  const client = await pool.connect();
  try {
    for (const st of statements) {
      await client.query(`${st};`);
    }

    const check = await client.query(
      `SELECT to_regclass('meu_backup_db.openai_usage_events') AS reg
       UNION ALL
       SELECT to_regclass('public.openai_usage_events') AS reg`
    );
    const found = (check.rows || []).some((r) => r.reg);
    if (!found) {
      throw new Error('Tabela openai_usage_events não encontrada após a migration.');
    }

    console.log('Migration openai_usage_events concluída com sucesso.');
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Falha na migration:', err.message);
  process.exit(1);
});
