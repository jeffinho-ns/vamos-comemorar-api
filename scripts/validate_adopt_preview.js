#!/usr/bin/env node
/* Read-only: pré-visualiza o que a adoção de áreas clonaria para um estabelecimento. */
require('dotenv').config();
const pool = require('../config/database');
const {
  getEstablishmentRules,
  buildAreasNameFilterSql,
  areasManagementFrozen,
} = require('../services/establishmentRules');

async function preview(establishmentId) {
  const rules = await getEstablishmentRules(pool, establishmentId);
  const nameFilter = buildAreasNameFilterSql(rules, 'name');
  const areas = await pool.query(
    `SELECT id, name FROM restaurant_areas
      WHERE is_active = TRUE AND establishment_id IS NULL AND (${nameFilter})
      ORDER BY id`,
  );
  const tables = await pool.query(
    `SELECT COUNT(*)::int AS c
       FROM restaurant_tables t
       JOIN restaurant_areas oa ON oa.id = t.area_id AND oa.establishment_id IS NULL
      WHERE t.is_active = TRUE AND oa.is_active = TRUE AND (${buildAreasNameFilterSql(rules, 'oa.name')})`,
  );
  console.log(
    `est ${establishmentId} | profile=${rules.profile} | frozen=${areasManagementFrozen(rules)} | ` +
      `áreas a clonar=${areas.rows.length} | mesas a clonar=${tables.rows[0].c}`,
  );
  console.log('  áreas:', areas.rows.map((a) => `${a.id}:${a.name}`).join(' | '));
}

async function main() {
  for (const id of [8, 1, 7, 4, 9]) {
    await preview(id);
  }
  await pool.end();
}

main().catch(async (e) => {
  console.error('ERRO:', e.message);
  try { await pool.end(); } catch (_) {}
  process.exit(1);
});
