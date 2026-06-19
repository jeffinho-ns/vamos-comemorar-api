/**
 * Executa migrations/2026-06-19_flyers_and_inbound_media.sql.
 * - Adiciona media_public_id em whatsapp_messages (expurgo de 24h).
 * - Cria ai_flyers e ai_flyer_sends (flyers automáticos por evento de reserva).
 * Uso: node scripts/run_flyers_and_inbound_media_migration.js
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
  return stripLineComments(sql)
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);
}

async function main() {
  const file = path.join(__dirname, '..', 'migrations', '2026-06-19_flyers_and_inbound_media.sql');
  const sql = fs.readFileSync(file, 'utf8');
  const statements = splitStatements(sql);
  const client = await pool.connect();
  try {
    for (const st of statements) {
      await client.query(`${st};`);
    }
    console.log('Migration flyers_and_inbound_media concluída com sucesso.');
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Falha na migration:', err.message);
  process.exit(1);
});
