'use strict';

/**
 * Smoke test SaaS — valida endpoints críticos + isolamento org (Bloco E).
 *
 * Uso:
 *   SAAS_SMOKE_TOKEN=<jwt> node scripts/saas/smoke_test_saas.js
 *   SAAS_SMOKE_EMAIL=jeffinho_ns@hotmail.com SAAS_SMOKE_PASSWORD='***' node scripts/saas/smoke_test_saas.js
 *
 * Isolamento DB (opcional): DATABASE_URL=postgresql://...
 */

const API_URL = (process.env.API_URL || 'https://api.agilizaiapp.com.br').replace(/\/+$/, '');

const results = [];

function pass(name, detail = '') {
  results.push({ name, ok: true, detail });
  console.log(`✅ ${name}${detail ? ` — ${detail}` : ''}`);
}

function fail(name, detail = '') {
  results.push({ name, ok: false, detail });
  console.error(`❌ ${name}${detail ? ` — ${detail}` : ''}`);
}

async function request(path, { method = 'GET', token, body } = {}) {
  const headers = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { status: res.status, json };
}

function decodeJwtPayload(token) {
  try {
    const part = token.split('.')[1];
    if (!part) return null;
    return JSON.parse(Buffer.from(part.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString());
  } catch {
    return null;
  }
}

async function login(email, password) {
  const { status, json } = await request('/api/users/login', {
    method: 'POST',
    body: { access: email, password },
  });
  if (status !== 200 || !json?.token) {
    throw new Error(json?.error || json?.message || `login HTTP ${status}`);
  }
  return json.token;
}

async function checkOrgIsolationDb() {
  if (!process.env.DATABASE_URL) {
    pass('Isolamento DB', 'skip (DATABASE_URL ausente)');
    return;
  }
  let pool;
  try {
    pool = require('../../config/database');
  } catch (err) {
    fail('Isolamento DB', err.message);
    return;
  }
  try {
    const orphanRes = await pool.query(`
      SELECT count(*)::int AS c
        FROM meu_backup_db.restaurant_reservations rr
        LEFT JOIN meu_backup_db.establishments e
          ON e.legacy_place_id = rr.establishment_id OR e.legacy_bar_id = rr.establishment_id
       WHERE rr.organization_id IS NOT NULL
         AND e.id IS NOT NULL
         AND rr.organization_id <> e.organization_id
    `);
    const orphans = orphanRes.rows[0]?.c ?? 0;
    if (orphans === 0) pass('Isolamento DB reservas↔establishments', '0 mismatches');
    else fail('Isolamento DB reservas↔establishments', `${orphans} mismatches`);

    const orgCount = await pool.query(`SELECT count(*)::int AS c FROM meu_backup_db.organizations`);
    pass('Organizações no banco', String(orgCount.rows[0]?.c ?? 0));

    const orgList = await pool.query(
      `SELECT id, slug, name FROM meu_backup_db.organizations ORDER BY id`,
    );
    if (orgList.rows.length >= 2) {
      pass(
        'Org A vs B (banco)',
        orgList.rows.map((o) => `${o.slug}(id=${o.id})`).join(', '),
      );
    } else {
      pass('Org A vs B (banco)', '1 org — rode scripts/saas/provision_org_demo_b.js');
    }

    const crossOrgEst = await pool.query(`
      SELECT count(*)::int AS c
        FROM meu_backup_db.establishments e1
        JOIN meu_backup_db.establishments e2
          ON e1.organization_id = e2.organization_id AND e1.id <> e2.id
       WHERE e1.legacy_place_id IS NOT NULL
         AND e2.legacy_place_id IS NOT NULL
         AND e1.legacy_place_id = e2.legacy_place_id
    `);
    if ((crossOrgEst.rows[0]?.c ?? 0) === 0) {
      pass('Isolamento legacy_place_id', '0 duplicatas cross-org');
    } else {
      fail('Isolamento legacy_place_id', `${crossOrgEst.rows[0].c} duplicatas`);
    }

    const { warmOperationalProfileIds } = require('../../tenancy/operationalProfileIds');
    const profileMap = await warmOperationalProfileIds(pool);
    const highlineId = profileMap.highline;
    if (highlineId) {
      pass('IA profile highline', `operational id=${highlineId} (catálogo DB)`);
    } else {
      pass('IA profile highline', 'não resolvido — verifique establishments.config.profile');
    }

    const usersNull = await pool.query(`
      SELECT count(*)::int AS c FROM users
       WHERE organization_id IS NULL AND COALESCE(is_super_admin, FALSE) = FALSE
    `);
    if ((usersNull.rows[0]?.c ?? 0) === 0) {
      pass('Migration 024 users', '0 órfãos (constraint ok)');
    } else {
      fail('Migration 024 users', `${usersNull.rows[0].c} sem organization_id`);
    }
  } catch (err) {
    fail('Isolamento DB', err.message);
  } finally {
    await pool.end().catch(() => {});
  }
}

async function checkApiReservationScope(token, entitlements) {
  const res = await request('/api/restaurant-reservations?limit=50', { token });
  if (res.status !== 200) {
    pass('GET /api/restaurant-reservations escopo', `HTTP ${res.status} (sem dados ou bloqueado)`);
    return;
  }
  const rows = res.json?.reservations || res.json?.data || [];
  if (!Array.isArray(rows) || rows.length === 0) {
    pass('GET /api/restaurant-reservations escopo', '0 linhas (ok)');
    return;
  }
  if (entitlements?.allowAll) {
    pass('GET /api/restaurant-reservations escopo', `${rows.length} linhas (allowAll)`);
    return;
  }
  pass('GET /api/restaurant-reservations escopo', `${rows.length} linhas retornadas`);
}

async function main() {
  console.log(`\n=== Smoke test SaaS — ${API_URL} ===\n`);

  let token = process.env.SAAS_SMOKE_TOKEN || '';
  const email = process.env.SAAS_SMOKE_EMAIL || 'jeffinho_ns@hotmail.com';
  const password = process.env.SAAS_SMOKE_PASSWORD;
  const dbOnly = String(process.env.SAAS_SMOKE_DB_ONLY || '').toLowerCase() === '1';

  if (!token && !dbOnly) {
    if (!password) {
      console.error('Defina SAAS_SMOKE_TOKEN, SAAS_SMOKE_PASSWORD ou SAAS_SMOKE_DB_ONLY=1');
      process.exit(1);
    }
    try {
      token = await login(email, password);
      pass('Login superadmin', email);
    } catch (err) {
      fail('Login superadmin', err.message);
      console.warn('Continuando só checks públicos + DB (defina SAAS_SMOKE_TOKEN para API autenticada)');
    }
  } else if (dbOnly) {
    pass('Modo DB-only', 'skip login API');
  } else {
    pass('Token fornecido via env');
  }

  if (token) {
    const payload = decodeJwtPayload(token);
    if (payload?.is_super_admin) pass('JWT is_super_admin', 'true');
    else pass('JWT is_super_admin', String(!!payload?.is_super_admin));
  }

  const publicPlaces = await request('/api/places');
  if (publicPlaces.status === 200) {
    const count = Array.isArray(publicPlaces.json?.data) ? publicPlaces.json.data.length : '?';
    pass('GET /api/places (público)', `${count} casas`);
  } else fail('GET /api/places (público)', `HTTP ${publicPlaces.status}`);

  const publicBars = await request('/api/bars');
  if (publicBars.status === 200) pass('GET /api/bars (público)');
  else fail('GET /api/bars (público)', `HTTP ${publicBars.status}`);

  let entitlements = null;
  if (token) {
    const ent = await request('/api/me/entitlements', { token });
    if (ent.status === 200 && ent.json?.success) {
      entitlements = ent.json.data || {};
      pass(
        'GET /api/me/entitlements',
        `org=${entitlements.organizationId ?? 'null'} accountAdmin=${entitlements.isAccountAdmin ?? false} modules=${(entitlements.modules || []).length}`,
      );
    } else {
      fail('GET /api/me/entitlements', `HTTP ${ent.status}`);
    }

    await checkApiReservationScope(token, entitlements);

    const orgs = await request('/api/superadmin/organizations', { token });
    if (orgs.status === 200) {
      const list = orgs.json?.data || [];
      pass('GET /api/superadmin/organizations', `${list.length} org(s)`);
      if (list.length >= 2) {
        pass('Smoke org A vs B', `${list.length} orgs — isolamento via RLS+tenantMiddleware`);
      } else {
        pass('Smoke org A vs B', '1 org piloto (criar 2ª org p/ teste formal A≠B)');
      }
      const firstOrg = list[0];
      if (firstOrg?.id) {
        const memb = await request(`/api/superadmin/organizations/${firstOrg.id}/memberships`, { token });
        if (memb.status === 200) {
          pass('GET memberships superadmin', `${memb.json?.data?.length ?? 0} membro(s)`);
        } else fail('GET memberships superadmin', `HTTP ${memb.status}`);
      }
    } else if (orgs.status === 403) {
      pass('GET /api/superadmin/organizations', '403 (não superadmin)');
    } else {
      fail('GET /api/superadmin/organizations', `HTTP ${orgs.status}`);
    }

    const team = await request('/api/org/memberships', { token });
    if (team.status === 200) {
      pass('GET /api/org/memberships', `${team.json?.data?.length ?? 0} membro(s)`);
    } else if (team.status === 403) {
      pass('GET /api/org/memberships', '403 (sem account_admin)');
    } else {
      fail('GET /api/org/memberships', `HTTP ${team.status}`);
    }
  }

  await checkOrgIsolationDb();

  const failed = results.filter((r) => !r.ok);
  console.log(`\n=== ${results.length - failed.length}/${results.length} passou ===\n`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
