'use strict';

/**
 * Smoke test SaaS — valida endpoints críticos com token superadmin ou credenciais.
 *
 * Uso:
 *   SAAS_SMOKE_TOKEN=<jwt> node scripts/saas/smoke_test_saas.js
 *   SAAS_SMOKE_EMAIL=x SAAS_SMOKE_PASSWORD=y node scripts/saas/smoke_test_saas.js
 *
 * Opcional: API_URL=https://api.agilizaiapp.com.br (default)
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

async function login(email, password) {
  const { status, json } = await request('/api/users/login', {
    method: 'POST',
    body: { email, password },
  });
  if (status !== 200 || !json?.token) {
    throw new Error(json?.error || json?.message || `login HTTP ${status}`);
  }
  return json.token;
}

async function main() {
  console.log(`\n=== Smoke test SaaS — ${API_URL} ===\n`);

  let token = process.env.SAAS_SMOKE_TOKEN || '';
  if (!token) {
    const email = process.env.SAAS_SMOKE_EMAIL;
    const password = process.env.SAAS_SMOKE_PASSWORD;
    if (!email || !password) {
      console.error('Defina SAAS_SMOKE_TOKEN ou SAAS_SMOKE_EMAIL + SAAS_SMOKE_PASSWORD');
      process.exit(1);
    }
    try {
      token = await login(email, password);
      pass('Login', email);
    } catch (err) {
      fail('Login', err.message);
      process.exit(1);
    }
  } else {
    pass('Token fornecido via env');
  }

  const publicPlaces = await request('/api/places');
  if (publicPlaces.status === 200) {
    const count = Array.isArray(publicPlaces.json?.data) ? publicPlaces.json.data.length : '?';
    pass('GET /api/places (público)', `${count} casas`);
  } else {
    fail('GET /api/places (público)', `HTTP ${publicPlaces.status}`);
  }

  const publicBars = await request('/api/bars');
  if (publicBars.status === 200) pass('GET /api/bars (público)');
  else fail('GET /api/bars (público)', `HTTP ${publicBars.status}`);

  const ent = await request('/api/me/entitlements', { token });
  if (ent.status === 200 && ent.json?.success) {
    const d = ent.json.data || {};
    pass(
      'GET /api/me/entitlements',
      `allowAll=${d.allowAll} org=${d.organizationId ?? 'null'} accountAdmin=${d.isAccountAdmin ?? false}`,
    );
  } else {
    fail('GET /api/me/entitlements', `HTTP ${ent.status}`);
  }

  const orgs = await request('/api/superadmin/organizations', { token });
  if (orgs.status === 200) {
    const count = Array.isArray(orgs.json?.data) ? orgs.json.data.length : 0;
    pass('GET /api/superadmin/organizations', `${count} org(s)`);

    const firstOrg = orgs.json?.data?.[0];
    if (firstOrg?.id) {
      const memb = await request(`/api/superadmin/organizations/${firstOrg.id}/memberships`, { token });
      if (memb.status === 200) {
        pass('GET memberships superadmin', `${memb.json?.data?.length ?? 0} membro(s)`);
      } else {
        fail('GET memberships superadmin', `HTTP ${memb.status}`);
      }
    }
  } else if (orgs.status === 403) {
    pass('GET /api/superadmin/organizations', '403 (não superadmin — esperado para org-admin)');
  } else {
    fail('GET /api/superadmin/organizations', `HTTP ${orgs.status}`);
  }

  const team = await request('/api/org/memberships', { token });
  if (team.status === 200) {
    pass('GET /api/org/memberships', `${team.json?.data?.length ?? 0} membro(s)`);
  } else if (team.status === 403) {
    pass('GET /api/org/memberships', '403 (sem account_admin — ok se não for org-admin)');
  } else {
    fail('GET /api/org/memberships', `HTTP ${team.status}`);
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n=== ${results.length - failed.length}/${results.length} passou ===\n`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
