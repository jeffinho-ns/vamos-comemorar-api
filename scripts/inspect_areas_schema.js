#!/usr/bin/env node
/* Read-only inspection of areas/tables schema and data. Safe to run in prod. */
require('dotenv').config();
const pool = require('../config/database');

async function cols(table) {
  const r = await pool.query(
    `SELECT column_name, data_type, is_nullable, column_default
       FROM information_schema.columns
      WHERE table_name = $1
      ORDER BY ordinal_position`,
    [table],
  );
  return r.rows;
}

async function main() {
  const out = {};
  for (const t of ['restaurant_areas', 'restaurant_tables']) {
    out[t] = await cols(t);
  }

  const areas = await pool.query(
    `SELECT id, name, is_active,
            (SELECT COUNT(*) FROM restaurant_tables rt WHERE rt.area_id = ra.id) AS tables_count
       FROM restaurant_areas ra
      ORDER BY id`,
  );

  const tablesSample = await pool.query(
    `SELECT id, area_id, table_number, capacity, is_active
       FROM restaurant_tables
      ORDER BY area_id, id
      LIMIT 40`,
  );

  const areaUsage = await pool.query(
    `SELECT area_id, COUNT(*) AS c
       FROM restaurant_reservations
      GROUP BY area_id
      ORDER BY area_id`,
  );

  // Which establishments (establishment_id) use which area_id in reservations
  const areaByEstablishment = await pool.query(
    `SELECT establishment_id, area_id, COUNT(*) AS c
       FROM restaurant_reservations
      WHERE area_id IS NOT NULL
      GROUP BY establishment_id, area_id
      ORDER BY establishment_id, area_id`,
  );

  console.log('=== COLUMNS restaurant_areas ===');
  console.table(out.restaurant_areas);
  console.log('=== COLUMNS restaurant_tables ===');
  console.table(out.restaurant_tables);
  console.log('=== AREAS ===');
  console.table(areas.rows);
  console.log('=== TABLES sample (first 40) ===');
  console.table(tablesSample.rows);
  console.log('=== reservations per area_id ===');
  console.table(areaUsage.rows);
  console.log('=== reservations per (establishment_id, area_id) ===');
  console.table(areaByEstablishment.rows);

  await pool.end();
}

main().catch(async (e) => {
  console.error('INSPECT ERROR:', e.message);
  try { await pool.end(); } catch (_) {}
  process.exit(1);
});
