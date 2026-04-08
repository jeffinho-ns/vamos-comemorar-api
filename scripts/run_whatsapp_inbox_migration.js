/**
 * Executa migrations/create_whatsapp_inbox_postgresql.sql usando o pool da API.
 * Uso: node scripts/run_whatsapp_inbox_migration.js
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
  const file = path.join(__dirname, '..', 'migrations', 'create_whatsapp_inbox_postgresql.sql');
  const sql = fs.readFileSync(file, 'utf8');
  const statements = splitStatements(sql);
  const client = await pool.connect();
  try {
    for (const st of statements) {
      await client.query(`${st};`);
    }
    console.log('Migration whatsapp_inbox concluída com sucesso.');
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Falha na migration:', err.message);
  process.exit(1);
});
