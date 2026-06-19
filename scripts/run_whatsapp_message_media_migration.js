/**
 * Executa migrations/2026-06-19_whatsapp_message_media.sql usando o pool da API.
 * Adiciona colunas de mídia (message_type, media_url, media_mime) em whatsapp_messages
 * para permitir o envio/recebimento de imagens na Central WhatsApp.
 * Uso: node scripts/run_whatsapp_message_media_migration.js
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
  const file = path.join(__dirname, '..', 'migrations', '2026-06-19_whatsapp_message_media.sql');
  const sql = fs.readFileSync(file, 'utf8');
  const statements = splitStatements(sql);
  const client = await pool.connect();
  try {
    for (const st of statements) {
      await client.query(`${st};`);
    }
    console.log('Migration whatsapp_message_media concluída com sucesso.');
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Falha na migration:', err.message);
  process.exit(1);
});
