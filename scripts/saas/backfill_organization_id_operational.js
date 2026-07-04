'use strict';

/**
 * Backfill organization_id em linhas operacionais com NULL (pós-RLS 014).
 *
 * DRY-RUN por padrão:
 *   node scripts/saas/backfill_organization_id_operational.js
 *
 * Aplicar:
 *   SAAS_BACKFILL_CONFIRM=apply node scripts/saas/backfill_organization_id_operational.js
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
    name: 'restaurant_reservations',
    sql: `
      UPDATE restaurant_reservations rr
         SET organization_id = est.organization_id
        FROM establishments est
       WHERE rr.organization_id IS NULL
         AND rr.establishment_id IS NOT NULL
         AND (est.legacy_place_id = rr.establishment_id OR est.legacy_bar_id = rr.establishment_id)
    `,
  },
  {
    name: 'waitlist',
    sql: `
      UPDATE waitlist w
         SET organization_id = est.organization_id
        FROM establishments est
       WHERE w.organization_id IS NULL
         AND w.establishment_id IS NOT NULL
         AND (est.legacy_place_id = w.establishment_id OR est.legacy_bar_id = w.establishment_id)
    `,
  },
  {
    name: 'restaurant_reservation_blocks',
    sql: `
      UPDATE restaurant_reservation_blocks b
         SET organization_id = est.organization_id
        FROM establishments est
       WHERE b.organization_id IS NULL
         AND b.establishment_id IS NOT NULL
         AND (est.legacy_place_id = b.establishment_id OR est.legacy_bar_id = b.establishment_id)
    `,
  },
  {
    name: 'guest_lists (via restaurant_reservations)',
    sql: `
      UPDATE guest_lists gl
         SET organization_id = est.organization_id,
             establishment_id = COALESCE(gl.establishment_id, rr.establishment_id)
        FROM restaurant_reservations rr
        JOIN establishments est
          ON est.legacy_place_id = rr.establishment_id OR est.legacy_bar_id = rr.establishment_id
       WHERE gl.organization_id IS NULL
         AND gl.reservation_type = 'restaurant'
         AND gl.reservation_id = rr.id
    `,
  },
  {
    name: 'guest_lists (via large_reservations)',
    sql: `
      UPDATE guest_lists gl
         SET organization_id = est.organization_id,
             establishment_id = COALESCE(gl.establishment_id, lr.establishment_id)
        FROM large_reservations lr
        JOIN establishments est
          ON est.legacy_place_id = lr.establishment_id OR est.legacy_bar_id = lr.establishment_id
       WHERE gl.organization_id IS NULL
         AND gl.reservation_type = 'large'
         AND gl.reservation_id = lr.id
    `,
  },
  {
    name: 'guests (via guest_lists)',
    sql: `
      UPDATE guests g
         SET organization_id = gl.organization_id
        FROM guest_lists gl
       WHERE g.organization_id IS NULL
         AND g.guest_list_id = gl.id
         AND gl.organization_id IS NOT NULL
    `,
  },
  {
    name: 'guest_lists órfãs (reserva inexistente → org piloto)',
    sql: `
      UPDATE guest_lists gl
         SET organization_id = o.id
        FROM organizations o
       WHERE gl.organization_id IS NULL
         AND o.slug = 'grupo-ideia-um'
         AND NOT EXISTS (
           SELECT 1 FROM restaurant_reservations rr
            WHERE gl.reservation_type = 'restaurant' AND rr.id = gl.reservation_id
         )
         AND NOT EXISTS (
           SELECT 1 FROM large_reservations lr
            WHERE gl.reservation_type = 'large' AND lr.id = gl.reservation_id
         )
    `,
  },
  {
    name: 'guests órfãos (restantes → org piloto)',
    sql: `
      UPDATE guests g
         SET organization_id = o.id
        FROM organizations o
       WHERE g.organization_id IS NULL
         AND o.slug = 'grupo-ideia-um'
    `,
  },
  {
    name: 'promoter_eventos (via promoters)',
    sql: `
      UPDATE promoter_eventos pe
         SET organization_id = p.organization_id
        FROM promoters p
       WHERE pe.organization_id IS NULL
         AND pe.promoter_id = p.promoter_id
         AND p.organization_id IS NOT NULL
    `,
  },
  {
    name: 'promoter_convidados (via promoters)',
    sql: `
      UPDATE promoter_convidados pc
         SET organization_id = p.organization_id
        FROM promoters p
       WHERE pc.organization_id IS NULL
         AND pc.promoter_id = p.promoter_id
         AND p.organization_id IS NOT NULL
    `,
  },
  {
    name: 'promoter_eventos órfãos → org piloto',
    sql: `
      UPDATE promoter_eventos pe
         SET organization_id = o.id
        FROM organizations o
       WHERE pe.organization_id IS NULL AND o.slug = 'grupo-ideia-um'
    `,
  },
  {
    name: 'promoter_convidados órfãos → org piloto',
    sql: `
      UPDATE promoter_convidados pc
         SET organization_id = o.id
        FROM organizations o
       WHERE pc.organization_id IS NULL AND o.slug = 'grupo-ideia-um'
    `,
  },
];

async function countNulls() {
  const tables = [
    'restaurant_reservations',
    'waitlist',
    'restaurant_reservation_blocks',
    'guest_lists',
    'guests',
    'promoter_eventos',
    'promoter_convidados',
    'reservas',
    'promoters',
  ];
  const counts = {};
  for (const t of tables) {
    const { rows } = await pool.query(
      `SELECT count(*)::int AS c FROM ${t} WHERE organization_id IS NULL`,
    );
    counts[t] = rows[0].c;
  }
  return counts;
}

async function main() {
  const apply = String(process.env.SAAS_BACKFILL_CONFIRM || '').toLowerCase() === 'apply';

  console.log('=== organization_id NULL (antes) ===');
  console.log(await countNulls());

  if (!apply) {
    console.log('\nPassos que serão executados:');
    STEPS.forEach((s, i) => console.log(`  ${i + 1}. ${s.name}`));
    console.log('\nDRY-RUN. Para aplicar:');
    console.log('  SAAS_BACKFILL_CONFIRM=apply node scripts/saas/backfill_organization_id_operational.js');
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
