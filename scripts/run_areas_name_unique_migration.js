#!/usr/bin/env node
/**
 * Aplica a migração que troca o UNIQUE global de restaurant_areas.name
 * por UNIQUE por estabelecimento (name, establishment_id).
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const pool = require('../config/database');

async function main() {
  const sqlPath = path.join(
    __dirname,
    '../migrations/2026-07-17_areas_name_unique_per_establishment.sql',
  );
  const sql = fs.readFileSync(sqlPath, 'utf8');
  await pool.query(sql);

  const idx = await pool.query(
    `SELECT indexname, indexdef
       FROM pg_indexes
      WHERE tablename = 'restaurant_areas'
        AND indexdef ILIKE '%name%'`,
  );
  console.log('[migration] índices de nome em restaurant_areas:');
  idx.rows.forEach((r) => console.log('  -', r.indexname));
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
