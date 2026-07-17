#!/usr/bin/env node
/**
 * Aplica a migração que adiciona establishment_id a restaurant_areas/restaurant_tables.
 * Uso: node scripts/run_areas_establishment_migration.js
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const pool = require('../config/database');

async function main() {
  const sqlPath = path.join(
    __dirname,
    '../migrations/2026-07-17_add_establishment_id_to_areas_tables.sql',
  );
  const sql = fs.readFileSync(sqlPath, 'utf8');
  await pool.query(sql);

  const check = await pool.query(
    `SELECT table_name, column_name
       FROM information_schema.columns
      WHERE column_name = 'establishment_id'
        AND table_name IN ('restaurant_areas', 'restaurant_tables')
      ORDER BY table_name`,
  );
  console.log('[migration] establishment_id aplicado em:', check.rows.map((r) => r.table_name).join(', '));
  console.log('[migration] concluída com sucesso.');
  await pool.end?.();
}

main().catch(async (err) => {
  console.error('[migration] ERRO:', err.message);
  try {
    await pool.end?.();
  } catch (_) {
    /* ignore */
  }
  process.exit(1);
});
