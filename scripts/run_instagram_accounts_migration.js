/**
 * Cria instagram_accounts (um Instagram Direct por casa).
 * Uso: node scripts/run_instagram_accounts_migration.js
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const pool = require('../config/database');

async function main() {
  const file = path.join(__dirname, '..', 'migrations', '2026-10-31_instagram_accounts.sql');
  const sql = fs.readFileSync(file, 'utf8');
  await pool.query(sql);
  console.log('Migration instagram_accounts concluída com sucesso.');
}

main()
  .catch((err) => {
    console.error('Falha na migration:', err.message);
    process.exit(1);
  })
  .finally(async () => {
    await pool.end();
  });
