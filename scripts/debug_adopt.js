#!/usr/bin/env node
/* Debug da adoção (BEGIN/ROLLBACK — não persiste). */
require('dotenv').config();
const pool = require('../config/database');
const {
  getEstablishmentRules,
  buildAreasNameFilterSql,
} = require('../services/establishmentRules');

async function main() {
  const id = 8; // Pracinha

  // RLS status
  const rls = await pool.query(
    `SELECT relname, relrowsecurity, relforcerowsecurity
       FROM pg_class
      WHERE relname IN ('restaurant_areas','restaurant_tables')`,
  );
  console.log('RLS status:', rls.rows);

  const pol = await pool.query(
    `SELECT schemaname, tablename, policyname, cmd
       FROM pg_policies
      WHERE tablename IN ('restaurant_areas','restaurant_tables')`,
  );
  console.log('Policies:', pol.rows);

  const rules = await getEstablishmentRules(pool, id);
  const nameFilter = buildAreasNameFilterSql(rules, 'name');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const insertedAreas = await client.query(
      `INSERT INTO restaurant_areas
         (name, description, capacity_lunch, capacity_dinner, is_active, establishment_id)
       SELECT name, description, capacity_lunch, capacity_dinner, TRUE, $1
         FROM restaurant_areas
        WHERE is_active = TRUE AND establishment_id IS NULL AND (${nameFilter})
       RETURNING id`,
      [id],
    );
    console.log('Áreas inseridas (rollback):', insertedAreas.rows.length);

    const insTables = await client.query(
      `INSERT INTO restaurant_tables
         (area_id, table_number, capacity, table_type, description, is_active, establishment_id)
       SELECT na.id, t.table_number, t.capacity, t.table_type, t.description, TRUE, $1
         FROM restaurant_tables t
         JOIN restaurant_areas oa ON oa.id = t.area_id AND oa.establishment_id IS NULL
         JOIN restaurant_areas na ON na.establishment_id = $1 AND na.name = oa.name AND na.is_active = TRUE
        WHERE t.is_active = TRUE AND oa.is_active = TRUE AND (${buildAreasNameFilterSql(rules, 'oa.name')})`,
      [id],
    );
    console.log('Mesas inseridas (rollback):', insTables.rowCount);

    await client.query('ROLLBACK');
    console.log('OK — rollback feito, nada persistido.');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('ERRO NA ADOÇÃO:', e.message);
    console.error('CODE:', e.code, '| DETAIL:', e.detail, '| WHERE:', e.where);
  } finally {
    client.release();
  }
  await pool.end();
}

main().catch(async (e) => {
  console.error('FATAL:', e.message);
  try { await pool.end(); } catch (_) {}
  process.exit(1);
});
