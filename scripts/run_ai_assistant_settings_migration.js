/**
 * Executa migrations/2026-06-18_ai_assistant_settings.sql usando o pool da API.
 * Cria a tabela ai_assistant_settings (identidade/comportamento da IA por casa)
 * e adiciona a coluna category em establishment_faq (aba "Informações").
 * Uso: node scripts/run_ai_assistant_settings_migration.js
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
  const file = path.join(__dirname, '..', 'migrations', '2026-06-18_ai_assistant_settings.sql');
  const sql = fs.readFileSync(file, 'utf8');
  const statements = splitStatements(sql);
  const client = await pool.connect();
  try {
    for (const st of statements) {
      await client.query(`${st};`);
    }
    console.log('Migration ai_assistant_settings concluída com sucesso.');
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Falha na migration:', err.message);
  process.exit(1);
});
