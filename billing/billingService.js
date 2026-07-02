'use strict';

const bcrypt = require('bcryptjs');
const ManualPaymentProvider = require('./ManualPaymentProvider');
const {
  seedOrganizationTrainingMaterials,
  seedEstablishmentConfig,
} = require('./onboardingTemplates');

const ACTIVE_SUB_STATUSES = ['active', 'trialing'];
let hasMonthlyAmountColumnCache = null;

async function hasSubscriptionMonthlyAmountColumn(pool) {
  if (hasMonthlyAmountColumnCache !== null) return hasMonthlyAmountColumnCache;
  try {
    const { rows } = await pool.query(
      `SELECT 1
         FROM information_schema.columns
        WHERE table_schema = 'meu_backup_db'
          AND table_name = 'subscriptions'
          AND column_name = 'monthly_amount_cents'
        LIMIT 1`,
    );
    hasMonthlyAmountColumnCache = rows.length > 0;
  } catch (_) {
    hasMonthlyAmountColumnCache = false;
  }
  return hasMonthlyAmountColumnCache;
}

async function subscriptionAmountSql(pool, subscriptionAlias = 's', planAlias = 'p') {
  const hasMonthly = await hasSubscriptionMonthlyAmountColumn(pool);
  if (hasMonthly) {
    return `COALESCE(${subscriptionAlias}.monthly_amount_cents, ${planAlias}.price_cents, 0)`;
  }
  return `COALESCE(${planAlias}.price_cents, 0)`;
}

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
  const amountSql = await subscriptionAmountSql(pool);
  const { rows } = await pool.query(
    `SELECT COALESCE(SUM(${amountSql}), 0)::int AS mrr_cents
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
  const amountSql = await subscriptionAmountSql(pool);
  const { rows } = await pool.query(
    `SELECT
       o.id, o.slug, o.name, o.status, o.saas_enabled, o.created_at,
       s.id AS subscription_id, s.status AS subscription_status,
       p.key AS plan_key, p.name AS plan_name, p.price_cents AS plan_price_cents,
       ${amountSql} AS monthly_amount_cents,
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
  const amountSql = await subscriptionAmountSql(pool);
  const orgResult = await pool.query(
    `SELECT o.*, s.id AS subscription_id, s.status AS subscription_status,
            s.plan_id, p.key AS plan_key, p.name AS plan_name, p.price_cents,
            ${amountSql} AS monthly_amount_cents
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
         (SELECT COALESCE(SUM(amount_cents), 0) FROM meu_backup_db.payments pay WHERE pay.invoice_id = i.id) AS paid_cents,
         COALESCE(
           (
             SELECT json_agg(
               json_build_object(
                 'id', pay.id,
                 'amount_cents', pay.amount_cents,
                 'paid_at', pay.paid_at,
                 'method', pay.method,
                 'receipt_url', pay.receipt_url,
                 'created_at', pay.created_at
               )
               ORDER BY pay.created_at DESC
             )
             FROM meu_backup_db.payments pay
             WHERE pay.invoice_id = i.id
           ),
           '[]'::json
         ) AS payments
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

async function updateSubscriptionBilling(pool, organizationId, patch, actorUserId) {
  const hasMonthly = await hasSubscriptionMonthlyAmountColumn(pool);
  const fields = [];
  const params = [];
  let i = 1;

  if (patch.status !== undefined) {
    fields.push(`status = $${i++}`);
    params.push(patch.status);
  }
  if (patch.currentPeriodStart !== undefined) {
    fields.push(`current_period_start = $${i++}`);
    params.push(patch.currentPeriodStart || null);
  }
  if (patch.currentPeriodEnd !== undefined) {
    fields.push(`current_period_end = $${i++}`);
    params.push(patch.currentPeriodEnd || null);
  }
  if (patch.monthlyAmountCents !== undefined) {
    if (!hasMonthly) {
      throw new Error(
        'A migration 009 ainda não foi aplicada. Rode as migrations SaaS para habilitar mensalidade por empresa.',
      );
    }
    fields.push(`monthly_amount_cents = $${i++}`);
    params.push(patch.monthlyAmountCents);
  }

  if (!fields.length) {
    throw new Error('Nenhum campo de billing informado.');
  }

  params.push(organizationId);
  const { rows } = await pool.query(
    `UPDATE meu_backup_db.subscriptions
        SET ${fields.join(', ')}, updated_at = now()
      WHERE organization_id = $${i}
      RETURNING *`,
    params,
  );
  if (!rows.length) {
    throw new Error('Assinatura não encontrada.');
  }

  await logBillingEvent(pool, organizationId, 'subscription.billing_updated', {
    actorUserId,
    patch,
  });
  return rows[0];
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
    monthlyAmountCents,
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

    const hasMonthly = await hasSubscriptionMonthlyAmountColumn(pool);
    const planRes = await client.query(
      `SELECT id FROM meu_backup_db.plans WHERE key = $1 AND is_active = TRUE`,
      [planKey],
    );
    if (!planRes.rows.length) throw new Error(`Plano '${planKey}' não encontrado`);

    if (hasMonthly) {
      await client.query(
        `INSERT INTO meu_backup_db.subscriptions (organization_id, plan_id, status, monthly_amount_cents)
         VALUES ($1, $2, 'active', $3)`,
        [org.id, planRes.rows[0].id, monthlyAmountCents ?? null],
      );
    } else {
      await client.query(
        `INSERT INTO meu_backup_db.subscriptions (organization_id, plan_id, status)
         VALUES ($1, $2, 'active')`,
        [org.id, planRes.rows[0].id],
      );
    }

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
      const estIns = await client.query(
        `INSERT INTO meu_backup_db.establishments (organization_id, slug, name, status)
         VALUES ($1, $2, $3, 'active') RETURNING id`,
        [org.id, slug, establishmentName],
      );
      await seedEstablishmentConfig(client, estIns.rows[0].id, slug);
    }

    await seedOrganizationTrainingMaterials(client, org.id, planKey);

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

function parseYearMonth(yearMonth) {
  const m = String(yearMonth || '').match(/^(\d{4})-(\d{2})$/);
  if (!m) {
    const now = new Date();
    return {
      year: now.getFullYear(),
      month: now.getMonth() + 1,
      label: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`,
    };
  }
  return { year: Number(m[1]), month: Number(m[2]), label: yearMonth };
}

async function getBillingSummaryByMonth(pool, yearMonth) {
  const { year, month, label } = parseYearMonth(yearMonth);
  const start = `${label}-01`;
  const endDate = new Date(year, month, 0);
  const end = `${label}-${String(endDate.getDate()).padStart(2, '0')}`;

  const hasMonthly = await hasSubscriptionMonthlyAmountColumn(pool);
  const monthlyExpr = hasMonthly
    ? `COALESCE(s.monthly_amount_cents, p.price_cents, 0)`
    : `COALESCE(p.price_cents, 0)`;

  const { rows: orgRows } = await pool.query(
    `SELECT o.id, o.name, o.slug, o.status,
            s.status AS subscription_status,
            p.key AS plan_key, p.name AS plan_name,
            ${monthlyExpr} AS monthly_amount_cents
       FROM meu_backup_db.organizations o
       LEFT JOIN meu_backup_db.subscriptions s ON s.organization_id = o.id
       LEFT JOIN meu_backup_db.plans p ON p.id = s.plan_id
      WHERE o.saas_enabled = TRUE
      ORDER BY o.name`,
  );

  const { rows: paymentRows } = await pool.query(
    `SELECT i.organization_id,
            COALESCE(SUM(p.amount_cents), 0)::bigint AS paid_cents,
            COUNT(p.id)::int AS payment_count
       FROM meu_backup_db.payments p
       JOIN meu_backup_db.invoices i ON i.id = p.invoice_id
      WHERE p.paid_at >= $1::date
        AND p.paid_at < ($2::date + INTERVAL '1 day')
      GROUP BY i.organization_id`,
    [start, end],
  );

  const paidMap = new Map(paymentRows.map((r) => [r.organization_id, r]));

  const { rows: openRows } = await pool.query(
    `SELECT organization_id,
            COALESCE(SUM(amount_cents), 0)::bigint AS open_cents,
            COUNT(*)::int AS open_count
       FROM meu_backup_db.invoices
      WHERE status IN ('pending', 'overdue')
      GROUP BY organization_id`,
  );
  const openMap = new Map(openRows.map((r) => [r.organization_id, r]));

  const clients = orgRows.map((o) => {
    const paid = paidMap.get(o.id) || { paid_cents: 0, payment_count: 0 };
    const open = openMap.get(o.id) || { open_cents: 0, open_count: 0 };
    const monthly = Number(o.monthly_amount_cents) || 0;
    const paidCents = Number(paid.paid_cents) || 0;
    return {
      organizationId: o.id,
      name: o.name,
      slug: o.slug,
      status: o.status,
      subscriptionStatus: o.subscription_status,
      planKey: o.plan_key,
      planName: o.plan_name,
      monthlyAmountCents: monthly,
      paidThisMonthCents: paidCents,
      paymentCountThisMonth: paid.payment_count,
      openInvoicesCents: Number(open.open_cents) || 0,
      openInvoicesCount: open.open_count,
      collectionStatus:
        paidCents >= monthly && monthly > 0
          ? 'paid'
          : paidCents > 0
            ? 'partial'
            : monthly > 0
              ? 'pending'
              : 'no_billing',
    };
  });

  const totals = clients.reduce(
    (acc, c) => {
      acc.expectedMrrCents += c.monthlyAmountCents;
      acc.collectedCents += c.paidThisMonthCents;
      acc.openCents += c.openInvoicesCents;
      if (c.collectionStatus === 'pending' || c.collectionStatus === 'partial') {
        acc.pendingClients += 1;
      }
      if (c.subscriptionStatus === 'past_due') acc.pastDueClients += 1;
      return acc;
    },
    {
      expectedMrrCents: 0,
      collectedCents: 0,
      openCents: 0,
      pendingClients: 0,
      pastDueClients: 0,
    },
  );

  return {
    month: label,
    periodStart: start,
    periodEnd: end,
    totals,
    clients,
  };
}

async function listOrganizationUsers(pool, organizationId) {
  const { rows } = await pool.query(
    `SELECT DISTINCT u.id, u.name, u.email, u.role
       FROM users u
       LEFT JOIN meu_backup_db.memberships m
         ON m.user_id = u.id AND m.organization_id = $1 AND m.is_active = TRUE
       LEFT JOIN user_establishment_permissions uep ON uep.user_id = u.id
       LEFT JOIN meu_backup_db.establishments e
         ON (e.legacy_place_id = uep.establishment_id OR e.legacy_bar_id = uep.establishment_id)
        AND e.organization_id = $1
      WHERE COALESCE(u.is_super_admin, FALSE) = FALSE
        AND (m.id IS NOT NULL OR e.id IS NOT NULL)
      ORDER BY u.name`,
    [organizationId],
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
  updateSubscriptionBilling,
  createInvoice,
  recordManualPayment,
  markSubscriptionPastDue,
  provisionOrganization,
  listPlans,
  getBillingSummaryByMonth,
  listOrganizationUsers,
};
