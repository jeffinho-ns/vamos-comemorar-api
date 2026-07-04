'use strict';

/**
 * Backfill organization_id — eventos, listas, users.
 *
 * DRY-RUN:
 *   node scripts/saas/backfill_organization_id_events_users.js
 *
 * Aplicar:
 *   SAAS_BACKFILL_CONFIRM=apply node scripts/saas/backfill_organization_id_events_users.js
 */

const pool = require('../../config/database');

async function runWithRlsBypass(sql) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SELECT set_config('app.bypass_rls', 'on', true)`);
    const result = await client.query(sql);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

const STEPS = [
  {
    name: 'eventos (via id_place → establishments)',
    sql: `
      UPDATE eventos e
         SET organization_id = est.organization_id
        FROM establishments est
       WHERE e.organization_id IS NULL
         AND e.id_place IS NOT NULL
         AND (est.legacy_place_id = e.id_place OR est.legacy_bar_id = e.id_place)
    `,
  },
  {
    name: 'listas (via eventos.organization_id)',
    sql: `
      UPDATE listas l
         SET organization_id = e.organization_id
        FROM eventos e
       WHERE l.organization_id IS NULL
         AND l.evento_id = e.id
         AND e.organization_id IS NOT NULL
    `,
  },
  {
    name: 'users (via memberships ativa)',
    sql: `
      UPDATE users u
         SET organization_id = m.organization_id
        FROM meu_backup_db.memberships m
       WHERE u.organization_id IS NULL
         AND m.user_id = u.id
         AND m.is_active = TRUE
         AND m.organization_id IS NOT NULL
    `,
  },
  {
    name: 'eventos órfãos → org piloto',
    sql: `
      UPDATE eventos e
         SET organization_id = o.id
        FROM organizations o
       WHERE e.organization_id IS NULL AND o.slug = 'grupo-ideia-um'
    `,
  },
  {
    name: 'listas órfãs → org piloto',
    sql: `
      UPDATE listas l
         SET organization_id = o.id
        FROM organizations o
       WHERE l.organization_id IS NULL AND o.slug = 'grupo-ideia-um'
    `,
  },
  {
    name: 'users órfãos (clientes/consumidores) → org piloto',
    sql: `
      UPDATE users u
         SET organization_id = o.id
        FROM organizations o
       WHERE u.organization_id IS NULL
         AND COALESCE(u.is_super_admin, FALSE) = FALSE
         AND o.slug = 'grupo-ideia-um'
    `,
  },
];

const COUNT_TABLES = ['eventos', 'listas', 'listas_convidados', 'users'];

async function countNulls() {
  const counts = {};
  for (const t of COUNT_TABLES) {
    const { rows } = await pool.query(
      `SELECT count(*)::int AS c FROM ${t} WHERE organization_id IS NULL`,
    );
    counts[t] = rows[0].c;
  }
  return counts;
}

async function main() {
  const apply = String(process.env.SAAS_BACKFILL_CONFIRM || '').toLowerCase() === 'apply';

  console.log('=== organization_id NULL eventos/users (antes) ===');
  console.log(await countNulls());

  if (!apply) {
    console.log('\nPassos:');
    STEPS.forEach((s, i) => console.log(`  ${i + 1}. ${s.name}`));
    console.log('\nDRY-RUN. Para aplicar:');
    console.log('  SAAS_BACKFILL_CONFIRM=apply node scripts/saas/backfill_organization_id_events_users.js');
    await pool.end();
    return;
  }

  for (const step of STEPS) {
    const result = await runWithRlsBypass(step.sql);
    console.log(`✅ ${step.name}: ${result.rowCount} linha(s)`);
  }

  console.log('\n=== organization_id NULL (depois) ===');
  console.log(await countNulls());
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
