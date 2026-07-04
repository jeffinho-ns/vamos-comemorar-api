'use strict';

/**
 * Provisiona org demo B para smoke test de isolamento (Org A vs Org B).
 *
 * Uso:
 *   DATABASE_URL=... node scripts/saas/provision_org_demo_b.js
 *   ORG_DEMO_B_ADMIN_EMAIL=demo-b@example.com ORG_DEMO_B_ADMIN_PASSWORD='***' ...
 *
 * Idempotente: se slug org-demo-b já existir, apenas imprime os IDs.
 */

require('dotenv').config();

const pool = require('../../config/database');
const { provisionOrganization } = require('../../billing/billingService');

const DEMO_SLUG = process.env.ORG_DEMO_B_SLUG || 'org-demo-b';
const DEMO_NAME = process.env.ORG_DEMO_B_NAME || 'Org Demo B (Smoke Test)';

async function fetchOrgBySlug(slug) {
  const { rows } = await pool.query(
    `SELECT id, slug, name, status, saas_enabled
       FROM meu_backup_db.organizations
      WHERE slug = $1
      LIMIT 1`,
    [slug],
  );
  return rows[0] || null;
}

async function fetchOrgSummary(orgId) {
  const [est, users, subs] = await Promise.all([
    pool.query(
      `SELECT id, name, legacy_place_id, legacy_bar_id
         FROM meu_backup_db.establishments
        WHERE organization_id = $1
        ORDER BY id`,
      [orgId],
    ),
    pool.query(
      `SELECT id, email, name, role FROM users WHERE organization_id = $1 ORDER BY id`,
      [orgId],
    ),
    pool.query(
      `SELECT s.status, p.key AS plan_key
         FROM meu_backup_db.subscriptions s
         JOIN meu_backup_db.plans p ON p.id = s.plan_id
        WHERE s.organization_id = $1
        ORDER BY s.id DESC LIMIT 1`,
      [orgId],
    ),
  ]);
  return {
    establishments: est.rows,
    users: users.rows,
    subscription: subs.rows[0] || null,
  };
}

async function main() {
  const existing = await fetchOrgBySlug(DEMO_SLUG);
  if (existing) {
    const summary = await fetchOrgSummary(existing.id);
    console.log('\n✅ Org demo B já existe — nada a fazer.\n');
    console.log(JSON.stringify({ organization: existing, ...summary }, null, 2));
    await pool.end();
    return;
  }

  const adminEmail = process.env.ORG_DEMO_B_ADMIN_EMAIL || 'demo-b-admin@agilizaiapp.test';
  const adminPassword = process.env.ORG_DEMO_B_ADMIN_PASSWORD || 'DemoB@123Mudar!';

  console.log(`\nProvisionando org demo B (slug=${DEMO_SLUG})...\n`);

  const result = await provisionOrganization(
    pool,
    {
      name: DEMO_NAME,
      slug: DEMO_SLUG,
      planKey: process.env.ORG_DEMO_B_PLAN || 'full',
      adminEmail,
      adminName: process.env.ORG_DEMO_B_ADMIN_NAME || 'Admin Demo B',
      adminPassword,
      establishmentName: process.env.ORG_DEMO_B_ESTABLISHMENT || 'Bar Demo B',
    },
    null,
  );

  const summary = await fetchOrgSummary(result.organization.id);
  console.log('\n✅ Org demo B provisionada.\n');
  console.log(
    JSON.stringify(
      {
        organization: result.organization,
        adminUser: result.adminUser,
        establishment: result.establishment,
        ...summary,
      },
      null,
      2,
    ),
  );
  console.log('\nPróximo: SAAS_SMOKE_DB_ONLY=1 node scripts/saas/smoke_test_saas.js\n');

  await pool.end();
}

main().catch(async (err) => {
  console.error('❌ provision_org_demo_b falhou:', err.message);
  await pool.end().catch(() => {});
  process.exit(1);
});
