#!/usr/bin/env node
/**
 * Troca UNIQUE(event_date) global por UNIQUE(event_date, establishment_id)
 * em operational_details — permite OS na mesma data em casas diferentes.
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const pool = require('../config/database');

async function main() {
  const sqlPath = path.join(
    __dirname,
    '../migrations/2026-08-28_operational_details_unique_per_establishment.sql',
  );
  const sql = fs.readFileSync(sqlPath, 'utf8');
  await pool.query(sql);

  const idx = await pool.query(
    `SELECT indexname, indexdef
       FROM pg_indexes
      WHERE tablename = 'operational_details'
        AND (indexdef ILIKE '%event_date%' OR indexname ILIKE '%event_date%')`,
  );
  console.log('[migration] índices event_date em operational_details:');
  idx.rows.forEach((r) => console.log('  -', r.indexname, '::', r.indexdef));
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
