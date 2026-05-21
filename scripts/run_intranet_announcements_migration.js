#!/usr/bin/env node
/**
 * Cria a tabela intranet_announcements (dashboard /admin).
 * Uso: node scripts/run_intranet_announcements_migration.js
 */
const fs = require('fs');
const path = require('path');
const pool = require('../config/database');

async function main() {
  const sqlPath = path.join(
    __dirname,
    '../migrations/create_intranet_announcements_postgresql.sql',
  );
  const sql = fs.readFileSync(sqlPath, 'utf8');
  const client = await pool.connect();
  try {
    await client.query(sql);
    console.log('✅ Migration intranet_announcements aplicada.');
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('❌ Falha na migration:', err.message);
  process.exit(1);
});
