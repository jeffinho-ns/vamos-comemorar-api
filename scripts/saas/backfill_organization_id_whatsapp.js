'use strict';

/**
 * Backfill organization_id — WhatsApp, cardápio auxiliar, FAQ.
 *
 * DRY-RUN:
 *   node scripts/saas/backfill_organization_id_whatsapp.js
 *
 * Aplicar:
 *   SAAS_BACKFILL_CONFIRM=apply node scripts/saas/backfill_organization_id_whatsapp.js
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
    name: 'whatsapp_conversations (via establishment_id)',
    sql: `
      UPDATE whatsapp_conversations wc
         SET organization_id = est.organization_id
        FROM establishments est
       WHERE wc.organization_id IS NULL
         AND wc.establishment_id IS NOT NULL
         AND (est.legacy_place_id = wc.establishment_id OR est.legacy_bar_id = wc.establishment_id)
    `,
  },
  {
    name: 'whatsapp_contacts (via last_establishment_id)',
    sql: `
      UPDATE whatsapp_contacts wc
         SET organization_id = est.organization_id
        FROM establishments est
       WHERE wc.organization_id IS NULL
         AND wc.last_establishment_id IS NOT NULL
         AND (est.legacy_place_id = wc.last_establishment_id OR est.legacy_bar_id = wc.last_establishment_id)
    `,
  },
  {
    name: 'whatsapp_messages (via conversation.organization_id)',
    sql: `
      UPDATE whatsapp_messages wm
         SET organization_id = wc.organization_id
        FROM whatsapp_conversations wc
       WHERE wm.organization_id IS NULL
         AND wm.conversation_id = wc.id
         AND wc.organization_id IS NOT NULL
    `,
  },
  {
    name: 'whatsapp_campaigns (via establishment_id)',
    sql: `
      UPDATE whatsapp_campaigns c
         SET organization_id = est.organization_id
        FROM establishments est
       WHERE c.organization_id IS NULL
         AND c.establishment_id IS NOT NULL
         AND (est.legacy_place_id = c.establishment_id OR est.legacy_bar_id = c.establishment_id)
    `,
  },
  {
    name: 'establishment_faq (via establishment_id → places)',
    sql: `
      UPDATE establishment_faq ef
         SET organization_id = est.organization_id
        FROM establishments est
       WHERE ef.organization_id IS NULL
         AND ef.establishment_id IS NOT NULL
         AND est.legacy_place_id = ef.establishment_id
    `,
  },
  {
    name: 'menu_pause_schedules (via bar_id)',
    sql: `
      UPDATE menu_pause_schedules mps
         SET organization_id = est.organization_id
        FROM establishments est
       WHERE mps.organization_id IS NULL
         AND mps.bar_id IS NOT NULL
         AND est.legacy_bar_id = mps.bar_id
    `,
  },
  {
    name: 'whatsapp_conversations órfãos → org piloto',
    sql: `
      UPDATE whatsapp_conversations wc
         SET organization_id = o.id
        FROM organizations o
       WHERE wc.organization_id IS NULL AND o.slug = 'grupo-ideia-um'
    `,
  },
  {
    name: 'whatsapp_contacts órfãos → org piloto',
    sql: `
      UPDATE whatsapp_contacts wc
         SET organization_id = o.id
        FROM organizations o
       WHERE wc.organization_id IS NULL AND o.slug = 'grupo-ideia-um'
    `,
  },
  {
    name: 'whatsapp_messages órfãos → org piloto',
    sql: `
      UPDATE whatsapp_messages wm
         SET organization_id = o.id
        FROM organizations o
       WHERE wm.organization_id IS NULL AND o.slug = 'grupo-ideia-um'
    `,
  },
  {
    name: 'whatsapp_campaigns órfãos → org piloto',
    sql: `
      UPDATE whatsapp_campaigns c
         SET organization_id = o.id
        FROM organizations o
       WHERE c.organization_id IS NULL AND o.slug = 'grupo-ideia-um'
    `,
  },
  {
    name: 'establishment_faq órfãos → org piloto',
    sql: `
      UPDATE establishment_faq ef
         SET organization_id = o.id
        FROM organizations o
       WHERE ef.organization_id IS NULL AND o.slug = 'grupo-ideia-um'
    `,
  },
  {
    name: 'menu_pause_schedules órfãos → org piloto',
    sql: `
      UPDATE menu_pause_schedules mps
         SET organization_id = o.id
        FROM organizations o
       WHERE mps.organization_id IS NULL AND o.slug = 'grupo-ideia-um'
    `,
  },
];

const COUNT_TABLES = [
  'whatsapp_contacts',
  'whatsapp_conversations',
  'whatsapp_messages',
  'whatsapp_campaigns',
  'establishment_faq',
  'menu_pause_schedules',
  'menu_items',
  'cardapio_images',
];

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

  console.log('=== organization_id NULL whatsapp/cardápio (antes) ===');
  console.log(await countNulls());

  if (!apply) {
    console.log('\nPassos:');
    STEPS.forEach((s, i) => console.log(`  ${i + 1}. ${s.name}`));
    console.log('\nDRY-RUN. Para aplicar:');
    console.log('  SAAS_BACKFILL_CONFIRM=apply node scripts/saas/backfill_organization_id_whatsapp.js');
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
