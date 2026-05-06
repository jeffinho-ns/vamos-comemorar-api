/**
 * Executa migrations/add_partner_logos_to_bars_postgresql.sql no Postgres (search_path do pool).
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const pool = require('../config/database');

async function main() {
  const migrationPath = path.join(__dirname, '../migrations/add_partner_logos_to_bars_postgresql.sql');
  const sql = fs.readFileSync(migrationPath, 'utf8');
  const client = await pool.connect();
  try {
    console.log('Executando migration partner_logos...');
    await client.query(sql);
    console.log('Migration concluída com sucesso.');
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Erro na migration:', err);
  process.exit(1);
});
