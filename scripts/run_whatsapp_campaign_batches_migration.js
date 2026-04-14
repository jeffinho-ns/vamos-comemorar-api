/**
 * Executa migrations/2026-04-14_whatsapp_campaign_batches.sql (arquivo completo — preserva blocos DO $$).
 * Uso: node scripts/run_whatsapp_campaign_batches_migration.js
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const pool = require('../config/database');

async function main() {
  const file = path.join(__dirname, '..', 'migrations', '2026-04-14_whatsapp_campaign_batches.sql');
  const sql = fs.readFileSync(file, 'utf8');
  const client = await pool.connect();
  try {
    await client.query(sql);
    console.log('Migration whatsapp_campaign_batches concluída com sucesso.');
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Falha na migration:', err.message);
  process.exit(1);
});
