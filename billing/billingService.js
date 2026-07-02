'use strict';

const bcrypt = require('bcryptjs');
const ManualPaymentProvider = require('./ManualPaymentProvider');

const ACTIVE_SUB_STATUSES = ['active', 'trialing'];

function centsToBrl(cents) {
  return (Number(cents || 0) / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}

async function logBillingEvent(pool, organizationId, eventType, payload = {}) {
  await pool.query(
    `INSERT INTO meu_backup_db.billing_events (organization_id, event_type, payload)
     VALUES ($1, $2, $3::jsonb)`,
    [organizationId, eventType, JSON.stringify(payload || {})],
  );
}

async function computeMrrCents(pool) {
  const { rows } = await pool.query(
    `SELECT COALESCE(SUM(p.price_cents), 0)::int AS mrr_cents
       FROM meu_backup_db.subscriptions s
       JOIN meu_backup_db.plans p ON p.id = s.plan_id
      WHERE s.status = ANY($1::text[])
        AND p.is_active = TRUE`,
    [ACTIVE_SUB_STATUSES],
  );
  return rows[0]?.mrr_cents || 0;
}

async function getDashboardMetrics(pool) {
  const [mrrCents, orgs, subs, invoices, paymentsMonth] = await Promise.all([
    computeMrrCents(pool),
    pool.query(`SELECT COUNT(*)::int AS c FROM meu_backup_db.organizations`),
    pool.query(
      `SELECT COUNT(*)::int AS c FROM meu_backup_db.subscriptions WHERE status = ANY($1::text[])`,
      [ACTIVE_SUB_STATUSES],
    ),
    pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'pending')::int AS pending,
         COUNT(*) FILTER (WHERE status = 'overdue')::int AS overdue,
         COUNT(*) FILTER (WHERE status = 'paid')::int AS paid
       FROM meu_backup_db.invoices`,
    ),
    pool.query(
      `SELECT COALESCE(SUM(amount_cents), 0)::int AS total
         FROM meu_backup_db.payments
        WHERE paid_at >= date_trunc('month', CURRENT_DATE)`,
    ),
  ]);

  return {
    mrrCents,
    mrrFormatted: centsToBrl(mrrCents),
    organizationsCount: orgs.rows[0]?.c || 0,
    activeSubscriptions: subs.rows[0]?.c || 0,
    invoicesPending: invoices.rows[0]?.pending || 0,
    invoicesOverdue: invoices.rows[0]?.overdue || 0,
    invoicesPaid: invoices.rows[0]?.paid || 0,
    revenueThisMonthCents: paymentsMonth.rows[0]?.total || 0,
    revenueThisMonthFormatted: centsToBrl(paymentsMonth.rows[0]?.total || 0),
  };
}

async function listOrganizations(pool) {
  const { rows } = await pool.query(
    `SELECT
       o.id, o.slug, o.name, o.status, o.saas_enabled, o.created_at,
       s.id AS subscription_id, s.status AS subscription_status,
       p.key AS plan_key, p.name AS plan_name, p.price_cents AS plan_price_cents,
       (SELECT COUNT(*)::int FROM meu_backup_db.establishments e WHERE e.organization_id = o.id) AS establishments_count,
       (SELECT COUNT(*)::int FROM meu_backup_db.invoices i
         WHERE i.organization_id = o.id AND i.status IN ('pending', 'overdue')) AS open_invoices
     FROM meu_backup_db.organizations o
     LEFT JOIN LATERAL (
       SELECT * FROM meu_backup_db.subscriptions
        WHERE organization_id = o.id
        ORDER BY id DESC LIMIT 1
     ) s ON TRUE
     LEFT JOIN meu_backup_db.plans p ON p.id = s.plan_id
     ORDER BY o.name`,
  );
  return rows;
}

async function getOrganizationDetail(pool, organizationId) {
  const orgResult = await pool.query(
    `SELECT o.*, s.id AS subscription_id, s.status AS subscription_status,
            s.plan_id, p.key AS plan_key, p.name AS plan_name, p.price_cents
       FROM meu_backup_db.organizations o
       LEFT JOIN LATERAL (
         SELECT * FROM meu_backup_db.subscriptions
          WHERE organization_id = o.id ORDER BY id DESC LIMIT 1
       ) s ON TRUE
       LEFT JOIN meu_backup_db.plans p ON p.id = s.plan_id
      WHERE o.id = $1`,
    [organizationId],
  );
  if (!orgResult.rows.length) return null;

  const [establishments, modules, invoices, events] = await Promise.all([
    pool.query(
      `SELECT id, slug, name, status, legacy_place_id, legacy_bar_id
         FROM meu_backup_db.establishments WHERE organization_id = $1 ORDER BY name`,
      [organizationId],
    ),
    pool.query(
      `SELECT m.key, m.name, COALESCE(om.is_enabled, FALSE) AS is_enabled
         FROM meu_backup_db.modules m
         LEFT JOIN meu_backup_db.organization_modules om
           ON om.module_id = m.id AND om.organization_id = $1
        WHERE m.is_active = TRUE
        ORDER BY m.key`,
      [organizationId],
    ),
    pool.query(
      `SELECT i.*,
         (SELECT COALESCE(SUM(amount_cents), 0) FROM meu_backup_db.payments pay WHERE pay.invoice_id = i.id) AS paid_cents
       FROM meu_backup_db.invoices i
       WHERE i.organization_id = $1
       ORDER BY i.created_at DESC
       LIMIT 24`,
      [organizationId],
    ),
    pool.query(
      `SELECT id, event_type, payload, created_at
         FROM meu_backup_db.billing_events
        WHERE organization_id = $1
        ORDER BY created_at DESC LIMIT 20`,
      [organizationId],
    ),
  ]);

  return {
    organization: orgResult.rows[0],
    establishments: establishments.rows,
    modules: modules.rows,
    invoices: invoices.rows,
    billingEvents: events.rows,
  };
}

async function updateOrganization(pool, organizationId, patch, actorUserId) {
  const fields = [];
  const params = [];
  let i = 1;

  if (patch.status !== undefined) {
    fields.push(`status = $${i++}`);
    params.push(patch.status);
  }
  if (patch.saas_enabled !== undefined) {
    fields.push(`saas_enabled = $${i++}`);
    params.push(!!patch.saas_enabled);
  }
  if (patch.name !== undefined) {
    fields.push(`name = $${i++}`);
    params.push(patch.name);
  }

  if (!fields.length) return null;

  fields.push(`updated_at = now()`);
  params.push(organizationId);

  const { rows } = await pool.query(
    `UPDATE meu_backup_db.organizations SET ${fields.join(', ')} WHERE id = $${i} RETURNING *`,
    params,
  );

  await logBillingEvent(pool, organizationId, 'organization.updated', {
    patch,
    actorUserId,
  });

  return rows[0] || null;
}

async function setOrganizationModule(pool, organizationId, moduleKey, isEnabled, actorUserId) {
  const mod = await pool.query(
    `SELECT id FROM meu_backup_db.modules WHERE key = $1 AND is_active = TRUE`,
    [moduleKey],
  );
  if (!mod.rows.length) throw new Error(`Módulo '${moduleKey}' não encontrado`);

  await pool.query(
    `INSERT INTO meu_backup_db.organization_modules (organization_id, module_id, is_enabled)
     VALUES ($1, $2, $3)
     ON CONFLICT (organization_id, module_id) DO UPDATE SET is_enabled = EXCLUDED.is_enabled`,
    [organizationId, mod.rows[0].id, !!isEnabled],
  );

  await logBillingEvent(pool, organizationId, 'module.toggled', {
    moduleKey,
    isEnabled: !!isEnabled,
    actorUserId,
  });
}

async function changePlan(pool, organizationId, planKey, actorUserId) {
  const planRes = await pool.query(
    `SELECT id, key, price_cents FROM meu_backup_db.plans WHERE key = $1 AND is_active = TRUE`,
    [planKey],
  );
  if (!planRes.rows.length) throw new Error(`Plano '${planKey}' não encontrado`);
  const plan = planRes.rows[0];

  const subRes = await pool.query(
    `SELECT id FROM meu_backup_db.subscriptions
      WHERE organization_id = $1 ORDER BY id DESC LIMIT 1`,
    [organizationId],
  );

  let subscription;
  if (subRes.rows.length) {
    const upd = await pool.query(
      `UPDATE meu_backup_db.subscriptions
          SET plan_id = $1, updated_at = now()
        WHERE id = $2 RETURNING *`,
      [plan.id, subRes.rows[0].id],
    );
    subscription = upd.rows[0];
  } else {
    const ins = await pool.query(
      `INSERT INTO meu_backup_db.subscriptions (organization_id, plan_id, status)
       VALUES ($1, $2, 'active') RETURNING *`,
      [organizationId, plan.id],
    );
    subscription = ins.rows[0];
  }

  await pool.query(
    `INSERT INTO meu_backup_db.organization_modules (organization_id, module_id, is_enabled)
     SELECT $1, pm.module_id, TRUE
       FROM meu_backup_db.plan_modules pm
      WHERE pm.plan_id = $2
     ON CONFLICT (organization_id, module_id) DO UPDATE SET is_enabled = TRUE`,
    [organizationId, plan.id],
  );

  await logBillingEvent(pool, organizationId, 'plan.changed', {
    planKey,
    planId: plan.id,
    actorUserId,
  });

  return { subscription, plan };
}

async function createInvoice(pool, data, actorUserId) {
  const { organizationId, periodStart, periodEnd, amountCents, dueDate, currency = 'BRL' } = data;
  const { rows } = await pool.query(
    `INSERT INTO meu_backup_db.invoices
       (organization_id, period_start, period_end, amount_cents, currency, status, due_date)
     VALUES ($1, $2, $3, $4, $5, 'pending', $6)
     RETURNING *`,
    [organizationId, periodStart || null, periodEnd || null, amountCents, currency, dueDate || null],
  );

  await logBillingEvent(pool, organizationId, 'invoice.created', {
    invoiceId: rows[0].id,
    amountCents,
    actorUserId,
  });

  return rows[0];
}

async function recordManualPayment(pool, invoiceId, data, actorUserId) {
  const provider = new ManualPaymentProvider();
  const invoiceRes = await pool.query(
    `SELECT * FROM meu_backup_db.invoices WHERE id = $1`,
    [invoiceId],
  );
  if (!invoiceRes.rows.length) throw new Error('Fatura não encontrada');
  const invoice = invoiceRes.rows[0];

  const amountCents = data.amountCents ?? invoice.amount_cents;
  const paidAt = data.paidAt ? new Date(data.paidAt) : new Date();
  const method = data.method || provider.key;

  await provider.createCharge({ invoiceId, amountCents });

  const payRes = await pool.query(
    `INSERT INTO meu_backup_db.payments (invoice_id, amount_cents, paid_at, method, receipt_url)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [invoiceId, amountCents, paidAt, method, data.receiptUrl || null],
  );

  const totalPaid = await pool.query(
    `SELECT COALESCE(SUM(amount_cents), 0)::int AS total FROM meu_backup_db.payments WHERE invoice_id = $1`,
    [invoiceId],
  );
  const paidTotal = totalPaid.rows[0]?.total || 0;
  const newStatus = paidTotal >= invoice.amount_cents ? 'paid' : invoice.status;

  await pool.query(`UPDATE meu_backup_db.invoices SET status = $1 WHERE id = $2`, [
    newStatus,
    invoiceId,
  ]);

  if (newStatus === 'paid') {
    await pool.query(
      `UPDATE meu_backup_db.subscriptions SET status = 'active', updated_at = now()
        WHERE organization_id = $1 AND status = 'past_due'`,
      [invoice.organization_id],
    );
  }

  await logBillingEvent(pool, invoice.organization_id, 'payment.recorded', {
    invoiceId,
    paymentId: payRes.rows[0].id,
    amountCents,
    method,
    actorUserId,
  });

  return { payment: payRes.rows[0], invoiceStatus: newStatus };
}

async function markSubscriptionPastDue(pool, organizationId, actorUserId) {
  await pool.query(
    `UPDATE meu_backup_db.subscriptions SET status = 'past_due', updated_at = now()
      WHERE organization_id = $1`,
    [organizationId],
  );
  await logBillingEvent(pool, organizationId, 'subscription.past_due', { actorUserId });
}

async function provisionOrganization(pool, input, actorUserId) {
  const {
    name,
    slug,
    planKey = 'full',
    adminEmail,
    adminName,
    adminPassword,
    establishmentName,
  } = input;

  if (!name || !slug) throw new Error('name e slug são obrigatórios');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const orgIns = await client.query(
      `INSERT INTO meu_backup_db.organizations (slug, name, status, saas_enabled)
       VALUES ($1, $2, 'active', TRUE) RETURNING *`,
      [slug, name],
    );
    const org = orgIns.rows[0];

    const planRes = await client.query(
      `SELECT id FROM meu_backup_db.plans WHERE key = $1 AND is_active = TRUE`,
      [planKey],
    );
    if (!planRes.rows.length) throw new Error(`Plano '${planKey}' não encontrado`);

    await client.query(
      `INSERT INTO meu_backup_db.subscriptions (organization_id, plan_id, status)
       VALUES ($1, $2, 'active')`,
      [org.id, planRes.rows[0].id],
    );

    await client.query(
      `INSERT INTO meu_backup_db.organization_modules (organization_id, module_id, is_enabled)
       SELECT $1, pm.module_id, TRUE FROM meu_backup_db.plan_modules pm WHERE pm.plan_id = $2
       ON CONFLICT DO NOTHING`,
      [org.id, planRes.rows[0].id],
    );

    await client.query(
      `INSERT INTO meu_backup_db.roles (organization_id, key, name, is_system) VALUES
         ($1, 'account_admin', 'Account Admin', TRUE),
         ($1, 'gerente_bar', 'Gerente do Bar', TRUE),
         ($1, 'recepcao', 'Recepção', TRUE)
       ON CONFLICT (organization_id, key) DO NOTHING`,
      [org.id],
    );

    if (establishmentName) {
      await client.query(
        `INSERT INTO meu_backup_db.establishments (organization_id, slug, name, status)
         VALUES ($1, $2, $3, 'active')`,
        [org.id, slug, establishmentName],
      );
    }

    let adminUser = null;
    if (adminEmail) {
      const emailNorm = String(adminEmail).trim().toLowerCase();
      const existing = await client.query(`SELECT id FROM users WHERE LOWER(email) = $1`, [emailNorm]);
      let userId;
      if (existing.rows.length) {
        userId = existing.rows[0].id;
      } else {
        const hash = await bcrypt.hash(adminPassword || '@123Mudar', 10);
        const userIns = await client.query(
          `INSERT INTO users (name, email, password, role) VALUES ($1, $2, $3, 'admin') RETURNING id, email, name`,
          [adminName || emailNorm, emailNorm, hash],
        );
        userId = userIns.rows[0].id;
        adminUser = userIns.rows[0];
      }

      const roleRes = await client.query(
        `SELECT id FROM meu_backup_db.roles WHERE organization_id = $1 AND key = 'account_admin' LIMIT 1`,
        [org.id],
      );
      if (roleRes.rows.length) {
        await client.query(
          `INSERT INTO meu_backup_db.memberships (user_id, organization_id, establishment_id, role_id, is_active)
           VALUES ($1, $2, NULL, $3, TRUE)
           ON CONFLICT (user_id, organization_id, establishment_id) DO NOTHING`,
          [userId, org.id, roleRes.rows[0].id],
        );
      }
    }

    await client.query(
      `INSERT INTO meu_backup_db.billing_events (organization_id, event_type, payload)
       VALUES ($1, 'organization.provisioned', $2::jsonb)`,
      [org.id, JSON.stringify({ actorUserId, planKey, adminEmail: adminEmail || null })],
    );

    await client.query('COMMIT');
    return { organization: org, adminUser };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function listPlans(pool) {
  const { rows } = await pool.query(
    `SELECT p.*,
       COALESCE(
         (SELECT json_agg(m.key ORDER BY m.key)
            FROM meu_backup_db.plan_modules pm
            JOIN meu_backup_db.modules m ON m.id = pm.module_id
           WHERE pm.plan_id = p.id),
         '[]'::json
       ) AS module_keys
     FROM meu_backup_db.plans p
     WHERE p.is_active = TRUE
     ORDER BY p.id`,
  );
  return rows;
}

module.exports = {
  centsToBrl,
  logBillingEvent,
  computeMrrCents,
  getDashboardMetrics,
  listOrganizations,
  getOrganizationDetail,
  updateOrganization,
  setOrganizationModule,
  changePlan,
  createInvoice,
  recordManualPayment,
  markSubscriptionPastDue,
  provisionOrganization,
  listPlans,
};
