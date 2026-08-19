'use strict';

/**
 * Backfill organization_id em menu_items / cardapio_images / menu_pause_schedules
 * a partir de establishments.legacy_bar_id.
 *
 * DRY-RUN:
 *   node scripts/saas/backfill_menu_items_organization_id.js
 *
 * Aplicar:
 *   SAAS_BACKFILL_CONFIRM=apply node scripts/saas/backfill_menu_items_organization_id.js
 */

const pool = require('../../config/database');
const {
  repairMenuOrganizationIds,
  runWithRlsBypass,
} = require('../../services/menuOrganizationRepair');

async function countNulls() {
  const tables = ['menu_items', 'cardapio_images', 'menu_pause_schedules'];
  const counts = {};
  for (const t of tables) {
    try {
      const { rows } = await runWithRlsBypass(
        pool,
        `SELECT count(*)::int AS c FROM ${t} WHERE organization_id IS NULL`,
      );
      counts[t] = rows[0].c;
    } catch (err) {
      counts[t] = `erro: ${err.message}`;
    }
  }
  try {
    const { rows } = await runWithRlsBypass(
      pool,
      `SELECT mi.barid, mi.organization_id, count(*)::int AS c
         FROM menu_items mi
        WHERE mi.barid = 15 AND mi.deleted_at IS NULL
        GROUP BY mi.barid, mi.organization_id
        ORDER BY c DESC`,
    );
    counts.bar15_breakdown = rows;
  } catch (err) {
    counts.bar15_breakdown = err.message;
  }
  return counts;
}

async function main() {
  const apply = String(process.env.SAAS_BACKFILL_CONFIRM || '').toLowerCase() === 'apply';

  console.log('=== menu_items organization_id (antes) ===');
  console.log(JSON.stringify(await countNulls(), null, 2));

  if (!apply) {
    console.log('\nDRY-RUN. Para aplicar:');
    console.log(
      '  SAAS_BACKFILL_CONFIRM=apply node scripts/saas/backfill_menu_items_organization_id.js',
    );
    await pool.end();
    return;
  }

  const result = await repairMenuOrganizationIds(pool);
  console.log(JSON.stringify(result, null, 2));

  console.log('\n=== depois ===');
  console.log(JSON.stringify(await countNulls(), null, 2));
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});