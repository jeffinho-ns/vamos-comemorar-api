'use strict';

/**
 * Corrige organization_id de cardápio (menu_items etc.) via establishments.legacy_bar_id.
 * Usado pelo endpoint superadmin e pelo script CLI.
 */

async function runWithRlsBypass(pool, sql, params = []) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SELECT set_config('app.bypass_rls', 'on', true)`);
    const result = await client.query(sql, params);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

async function resolveOrganizationIdForBar(db, barId, fallbackOrgId = null) {
  const bid = Number(barId);
  if (!Number.isFinite(bid) || bid <= 0) {
    return fallbackOrgId != null ? Number(fallbackOrgId) : null;
  }
  const { rows } = await db.query(
    `SELECT organization_id
       FROM establishments
      WHERE legacy_bar_id = $1
        AND organization_id IS NOT NULL
      ORDER BY id
      LIMIT 1`,
    [bid],
  );
  if (rows[0]?.organization_id != null) {
    return Number(rows[0].organization_id);
  }
  const fb = Number(fallbackOrgId);
  return Number.isFinite(fb) && fb > 0 ? fb : null;
}

async function repairMenuOrganizationIds(pool) {
  const steps = [];

  const items = await runWithRlsBypass(
    pool,
    `
      UPDATE menu_items mi
         SET organization_id = est.organization_id
        FROM establishments est
       WHERE est.legacy_bar_id = mi.barid
         AND est.organization_id IS NOT NULL
         AND (mi.organization_id IS NULL OR mi.organization_id IS DISTINCT FROM est.organization_id)
    `,
  );
  steps.push({ table: 'menu_items', updated: items.rowCount ?? 0 });

  try {
    const cats = await runWithRlsBypass(
      pool,
      `
        UPDATE menu_categories mc
           SET organization_id = est.organization_id
          FROM establishments est
         WHERE est.legacy_bar_id = mc.barid
           AND est.organization_id IS NOT NULL
           AND (mc.organization_id IS NULL OR mc.organization_id IS DISTINCT FROM est.organization_id)
      `,
    );
    steps.push({ table: 'menu_categories', updated: cats.rowCount ?? 0 });
  } catch (err) {
    steps.push({ table: 'menu_categories', updated: 0, skipped: err.message });
  }

  try {
    const images = await runWithRlsBypass(
      pool,
      `
        UPDATE cardapio_images ci
           SET organization_id = est.organization_id
          FROM establishments est
         WHERE ci.organization_id IS NULL
           AND ci.bar_id IS NOT NULL
           AND est.legacy_bar_id = ci.bar_id
           AND est.organization_id IS NOT NULL
      `,
    );
    steps.push({ table: 'cardapio_images', updated: images.rowCount ?? 0 });
  } catch (err) {
    // Schema legado pode não ter bar_id / organization_id.
    steps.push({ table: 'cardapio_images', updated: 0, skipped: err.message });
  }

  try {
    const pauses = await runWithRlsBypass(
      pool,
      `
        UPDATE menu_pause_schedules mps
           SET organization_id = est.organization_id
          FROM establishments est
         WHERE mps.organization_id IS NULL
           AND mps.bar_id IS NOT NULL
           AND est.legacy_bar_id = mps.bar_id
           AND est.organization_id IS NOT NULL
      `,
    );
    steps.push({ table: 'menu_pause_schedules', updated: pauses.rowCount ?? 0 });
  } catch (err) {
    steps.push({ table: 'menu_pause_schedules', updated: 0, skipped: err.message });
  }

  const { rows: bar15 } = await runWithRlsBypass(
    pool,
    `
      SELECT organization_id, count(*)::int AS c
        FROM menu_items
       WHERE barid = 15 AND deleted_at IS NULL
       GROUP BY organization_id
       ORDER BY c DESC
    `,
  );

  return { steps, bar15Breakdown: bar15 };
}

module.exports = {
  resolveOrganizationIdForBar,
  repairMenuOrganizationIds,
  runWithRlsBypass,
};
