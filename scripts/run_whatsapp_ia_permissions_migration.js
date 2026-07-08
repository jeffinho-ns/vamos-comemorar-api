/**
 * Aplica migration de permissões WhatsApp/IA em user_establishment_permissions.
 * Uso: node scripts/run_whatsapp_ia_permissions_migration.js
 */
const fs = require('fs');
const path = require('path');
const pool = require('../config/database');

async function run() {
  const sqlPath = path.join(
    __dirname,
    '../migrations/add_whatsapp_ia_permissions_postgresql.sql',
  );
  const sql = fs.readFileSync(sqlPath, 'utf8');
  const client = await pool.connect();
  try {
    await client.query(sql);
    console.log('Migration add_whatsapp_ia_permissions aplicada com sucesso.');
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
