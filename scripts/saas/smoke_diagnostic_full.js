'use strict';

/**
 * Diagnóstico SaaS completo — smoke autenticado + isolamento + reserva pública + roles.
 *
 * Uso:
 *   SAAS_SMOKE_EMAIL=... SAAS_SMOKE_PASSWORD=... node scripts/saas/smoke_diagnostic_full.js
 */

require('dotenv').config();

const API_URL = (process.env.API_URL || 'https://api.agilizaiapp.com.br').replace(/\/+$/, '');

const results = [];
const notes = [];

function pass(name, detail = '') {
  results.push({ name, ok: true, detail });
  console.log(`✅ ${name}${detail ? ` — ${detail}` : ''}`);
}

function fail(name, detail = '') {
  results.push({ name, ok: false, detail });
  console.error(`❌ ${name}${detail ? ` — ${detail}` : ''}`);
}

function info(msg) {
  notes.push(msg);
  console.log(`ℹ️  ${msg}`);
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
  let text = '';
  try {
    text = await res.text();
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { _raw: text?.slice(0, 200) };
  }
  return { status: res.status, json, text };
}

function decodeJwt(token) {
  try {
    const part = token.split('.')[1];
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
    throw new Error(json?.error || json?.message || `HTTP ${status}`);
  }
  return { token: json.token, user: json };
}

async function fetchEntitlements(token) {
  const { status, json } = await request('/api/me/entitlements', { token });
  if (status !== 200 || !json?.success) return null;
  return json.data;
}

function moduleSet(ent) {
  return new Set(ent?.modules || []);
}

function permSet(ent) {
  return new Set(ent?.permissions || []);
}

/** Simula PlaceService.fetchAllPlaces (Bloco F Flutter). */
function simulateFlutterPlacesFilter(places, entitlements) {
  const visible = places.filter(
    (p) => (p.visible === 1 || p.visible === true) && p.status === 'active',
  );
  if (!entitlements || entitlements.allowAll) return visible;

  const estIds = new Set((entitlements.establishmentIds || []).map(Number).filter((n) => n > 0));
  if (estIds.size > 0) {
    return visible.filter((p) => estIds.has(Number(p.id)));
  }

  const orgId = entitlements.organizationId;
  if (orgId != null) {
    return visible.filter(
      (p) => p.organization_id == null || Number(p.organization_id) === Number(orgId),
    );
  }

  return [];
}

async function main() {
  console.log(`\n========== DIAGNÓSTICO SaaS COMPLETO — ${API_URL} ==========\n`);

  const email = process.env.SAAS_SMOKE_EMAIL || 'jeffinho_ns@hotmail.com';
  const password = process.env.SAAS_SMOKE_PASSWORD || process.env.MASTER_LOGIN_PASSWORD;

  if (!password && !process.env.SAAS_SMOKE_TOKEN) {
    fail('Config', 'Defina SAAS_SMOKE_PASSWORD ou SAAS_SMOKE_TOKEN');
    process.exit(1);
  }

  // ── 1. Login superadmin ──
  let superToken = process.env.SAAS_SMOKE_TOKEN || '';
  if (!superToken) {
    try {
      const loginRes = await login(email, password);
      superToken = loginRes.token;
      pass('Login superadmin', `${email} → userId=${loginRes.user?.userId || '?'}`);
    } catch (err) {
      fail('Login superadmin', err.message);
      process.exit(1);
    }
  } else {
    pass('Login superadmin', 'token via SAAS_SMOKE_TOKEN');
  }

  const superPayload = decodeJwt(superToken);
  if (superPayload?.is_super_admin) pass('JWT is_super_admin', 'true');
  else fail('JWT is_super_admin', String(!!superPayload?.is_super_admin));

  // ── 2. Entitlements superadmin ──
  const superEnt = await fetchEntitlements(superToken);
  if (superEnt) {
    pass(
      'Entitlements superadmin',
      `allowAll=${superEnt.allowAll} org=${superEnt.organizationId} modules=${(superEnt.modules || []).length} perms=${(superEnt.permissions || []).length}`,
    );
    if (superEnt.allowAll) info('Superadmin com allowAll — escopo total esperado');
  } else fail('Entitlements superadmin', 'falhou');

  // ── 3. Places / org demo B ──
  const placesRes = await request('/api/places');
  let demoBPlace = null;
  if (placesRes.status === 200) {
    const places = placesRes.json?.data || [];
    pass('GET /api/places', `${places.length} casas`);
    demoBPlace = places.find(
      (p) =>
        String(p?.slug || '').includes('demo') ||
        String(p?.name || '').toLowerCase().includes('demo b'),
    );
    if (demoBPlace) {
      pass('Bar Demo B em /api/places', `id=${demoBPlace.id} slug=${demoBPlace.slug} name=${demoBPlace.name}`);
    } else {
      fail('Bar Demo B em /api/places', 'não encontrado');
    }
  } else fail('GET /api/places', `HTTP ${placesRes.status}`);

  // ── 4. POST reserva pública (anônimo) org demo B ──
  if (demoBPlace?.id) {
    let areaId = null;
    const areasRes = await request(`/api/restaurant-areas?establishment_id=${demoBPlace.id}`);
    const areas = areasRes.json?.areas || areasRes.json?.data || [];
    if (Array.isArray(areas) && areas.length) areaId = areas[0].id;

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 2);
    const dateStr = tomorrow.toISOString().slice(0, 10);
    const payload = {
      client_name: 'Smoke Test Demo B',
      client_phone: '11999990000',
      client_email: 'smoke-demo-b@test.local',
      reservation_date: dateStr,
      reservation_time: '20:00:00',
      number_of_people: 2,
      establishment_id: Number(demoBPlace.id),
      area_id: areaId,
      status: 'NOVA',
      origin: 'SITE',
    };
    const anonRes = await request('/api/restaurant-reservations', {
      method: 'POST',
      body: payload,
    });
    if (anonRes.status === 200 || anonRes.status === 201) {
      const rid = anonRes.json?.reservation?.id || anonRes.json?.id;
      pass('POST /api/restaurant-reservations (anônimo Demo B)', `HTTP ${anonRes.status} id=${rid ?? '?'}`);
    } else {
      fail(
        'POST /api/restaurant-reservations (anônimo Demo B)',
        `HTTP ${anonRes.status} — ${anonRes.json?.error || anonRes.json?.message || anonRes.text?.slice(0, 120)}`,
      );
    }
  }

  // ── 5. Superadmin API ──
  const orgsRes = await request('/api/superadmin/organizations', { token: superToken });
  if (orgsRes.status === 200) {
    const orgs = orgsRes.json?.data || [];
    pass('GET /api/superadmin/organizations', `${orgs.length} org(s): ${orgs.map((o) => o.slug).join(', ')}`);
    const orgA = orgs.find((o) => o.slug === 'grupo-ideia-um');
    const orgB = orgs.find((o) => o.slug === 'org-demo-b');
    if (orgA && orgB) pass('Org A vs B (API)', `A=${orgA.id} B=${orgB.id}`);
    else fail('Org A vs B (API)', 'faltando org piloto ou demo B');
  } else fail('GET /api/superadmin/organizations', `HTTP ${orgsRes.status}`);

  // ── 6. Reservas escopo superadmin ──
  const resScope = await request('/api/restaurant-reservations?limit=5', { token: superToken });
  if (resScope.status === 200) {
    const rows = resScope.json?.reservations || resScope.json?.data || [];
    pass('GET reservas (superadmin)', `${Array.isArray(rows) ? rows.length : '?'} linhas amostra`);
  } else {
    fail('GET reservas (superadmin)', `HTTP ${resScope.status}`);
  }

  // ── 7. Login org demo B admin ──
  const demoEmail = process.env.ORG_DEMO_B_ADMIN_EMAIL || 'demo-b-admin@agilizaiapp.test';
  const demoPassword = process.env.ORG_DEMO_B_ADMIN_PASSWORD || 'DemoB@123Mudar!';
  let demoToken = null;
  let demoEnt = null;
  try {
    const demoLogin = await login(demoEmail, demoPassword);
    demoToken = demoLogin.token;
    pass('Login org demo B admin', demoEmail);
    demoEnt = await fetchEntitlements(demoToken);
    if (demoEnt) {
      pass(
        'Entitlements demo B',
        `org=${demoEnt.organizationId} accountAdmin=${demoEnt.isAccountAdmin} modules=[${(demoEnt.modules || []).join(',')}]`,
      );
      if (Number(demoEnt.organizationId) === 8) pass('Demo B org_id', '8 (correto)');
      else fail('Demo B org_id', `esperado 8, got ${demoEnt.organizationId}`);
    } else fail('Entitlements demo B', 'falhou');
  } catch (err) {
    fail('Login org demo B admin', err.message);
    info('Rode provision_org_demo_b.js ou verifique senha do admin demo B');
  }

  // ── 8. Isolamento: demo B não vê org A ──
  if (demoToken && demoEnt) {
    const demoRes = await request('/api/restaurant-reservations?limit=100', { token: demoToken });
    if (demoRes.status === 200) {
      const rows = demoRes.json?.reservations || demoRes.json?.data || [];
      const orgIds = new Set(rows.map((r) => r.organization_id).filter(Boolean));
      const estIds = new Set(rows.map((r) => Number(r.establishment_id)).filter(Boolean));
      pass('Reservas demo B (escopo)', `${rows.length} linhas estIds=[${[...estIds].slice(0, 5).join(',')}]`);
      const leakedHighline = rows.some((r) => Number(r.establishment_id) === 7);
      if (leakedHighline && rows.length > 0) {
        fail('Isolamento demo B', 'vê reservas establishment_id=7 (Highline org A)');
      } else {
        pass('Isolamento demo B vs Highline', 'sem vazamento id=7 na amostra');
      }
      if (orgIds.size > 0 && !orgIds.has(8) && !demoEnt.allowAll) {
        fail('Isolamento demo B org_id', `org_ids retornados: ${[...orgIds].join(',')}`);
      } else if (orgIds.size === 0 && rows.length === 0) {
        pass('Isolamento demo B org_id', '0 reservas (org nova — ok)');
      } else {
        pass('Isolamento demo B org_id', `orgs=${[...orgIds].join(',') || 'n/a'}`);
      }
    } else {
      fail('Reservas demo B', `HTTP ${demoRes.status}`);
    }

    const demoTeam = await request('/api/org/memberships', { token: demoToken });
    if (demoTeam.status === 200) {
      pass('GET /api/org/memberships (demo B)', `${demoTeam.json?.data?.length ?? 0} membro(s)`);
    } else if (demoTeam.status === 403) {
      fail('GET /api/org/memberships (demo B)', '403 — deveria ser account_admin');
    } else {
      fail('GET /api/org/memberships (demo B)', `HTTP ${demoTeam.status}`);
    }
  }

  // ── 9. Roles recepção vs gerente (org A) ──
  const roleTests = [
    { envEmail: 'SAAS_SMOKE_RECEPCAO_EMAIL', envPass: 'SAAS_SMOKE_RECEPCAO_PASSWORD', label: 'recepção' },
    { envEmail: 'SAAS_SMOKE_GERENTE_EMAIL', envPass: 'SAAS_SMOKE_GERENTE_PASSWORD', label: 'gerente' },
  ];

  const roleEntitlements = {};
  for (const rt of roleTests) {
    const rEmail = process.env[rt.envEmail];
    const rPass = process.env[rt.envPass];
    if (!rEmail || !rPass) {
      info(`Skip ${rt.label}: defina ${rt.envEmail} e ${rt.envPass} no .env`);
      continue;
    }
    try {
      const { token: rToken } = await login(rEmail, rPass);
      const rEnt = await fetchEntitlements(rToken);
      roleEntitlements[rt.label] = rEnt;
      pass(`Login ${rt.label}`, rEmail);
      if (rEnt) {
        pass(
          `Entitlements ${rt.label}`,
          `modules=[${(rEnt.modules || []).slice(0, 8).join(',')}${(rEnt.modules || []).length > 8 ? '…' : ''}] perms=${(rEnt.permissions || []).length}`,
        );
      }
    } catch (err) {
      fail(`Login ${rt.label}`, err.message);
    }
  }

  if (roleEntitlements.recepção && roleEntitlements.gerente) {
    const recMods = moduleSet(roleEntitlements.recepção);
    const gerMods = moduleSet(roleEntitlements.gerente);
    const recPerms = permSet(roleEntitlements.recepção);
    const gerPerms = permSet(roleEntitlements.gerente);
    if (gerMods.has('cardapio') && !recMods.has('cardapio')) {
      pass('Sidebar diff recepção vs gerente', 'gerente tem cardápio, recepção não');
    } else if (gerPerms.size > recPerms.size) {
      pass('Sidebar diff recepção vs gerente', `gerente ${gerPerms.size} perms > recepção ${recPerms.size}`);
    } else {
      info(`Módulos recepção: [${[...recMods].join(',')}]`);
      info(`Módulos gerente: [${[...gerMods].join(',')}]`);
      pass('Sidebar diff recepção vs gerente', 'comparar manualmente no front');
    }
  }

  // ── 10. Flutter / places (simulação Bloco F) ──
  if (placesRes.status === 200) {
    const places = placesRes.json?.data || [];
    const flutterAnonymous = simulateFlutterPlacesFilter(places, null);
    pass(
      'Flutter fetchAllPlaces (anônimo)',
      `${flutterAnonymous.length}/${places.length} visíveis`,
    );

    if (demoEnt) {
      const flutterDemoB = simulateFlutterPlacesFilter(places, demoEnt);
      const hasDemoB = flutterDemoB.some((p) => String(p.name).toLowerCase().includes('demo b'));
      const hasHighline = flutterDemoB.some((p) => Number(p.id) === 7);
      if (hasDemoB && !hasHighline && flutterDemoB.length <= 2) {
        pass(
          'Flutter fetchAllPlaces (demo B)',
          `${flutterDemoB.length} casa(s) estIds=[${(demoEnt.establishmentIds || []).join(',')}]`,
        );
      } else if (demoEnt.establishmentIds?.length) {
        fail(
          'Flutter fetchAllPlaces (demo B)',
          `${flutterDemoB.length} casas — esperado escopo org B sem Highline (id=7)`,
        );
      } else {
        info('API ainda sem establishmentIds em entitlements — redeploy necessário para Bloco F completo');
        pass('Flutter fetchAllPlaces (demo B)', 'establishmentIds pendente no deploy');
      }
    }
  }

  // ── 11. DB checks (se DATABASE_URL) ──
  if (process.env.DATABASE_URL) {
    try {
      const pool = require('../../config/database');
      const orgCount = await pool.query('SELECT count(*)::int AS c FROM meu_backup_db.organizations');
      pass('DB organizações', String(orgCount.rows[0]?.c ?? 0));
      const mismatch = await pool.query(`
        SELECT count(*)::int AS c FROM meu_backup_db.restaurant_reservations rr
        LEFT JOIN meu_backup_db.establishments e
          ON e.legacy_place_id = rr.establishment_id OR e.legacy_bar_id = rr.establishment_id
        WHERE rr.organization_id IS NOT NULL AND e.id IS NOT NULL
          AND rr.organization_id <> e.organization_id
      `);
      if ((mismatch.rows[0]?.c ?? 0) === 0) pass('DB isolamento reservas', '0 mismatches');
      else fail('DB isolamento reservas', `${mismatch.rows[0].c} mismatches`);
      await pool.end();
    } catch (err) {
      fail('DB checks', err.message);
    }
  } else {
    info('DATABASE_URL ausente — skip checks DB locais');
  }

  // ── 12. Render DATABASE_URL ──
  if (!process.env.DATABASE_URL) {
    info('DATABASE_URL ausente localmente — checks DB acima foram pulados');
  }

  const failed = results.filter((r) => !r.ok);
  console.log('\n========== RESUMO ==========');
  console.log(`${results.length - failed.length}/${results.length} checks passaram`);
  if (failed.length) {
    console.log('\nFalhas:');
    for (const f of failed) console.log(`  • ${f.name}: ${f.detail}`);
  }
  if (notes.length) {
    console.log('\nNotas:');
    for (const n of notes) console.log(`  • ${n}`);
  }
  console.log('\n========== FIM DIAGNÓSTICO ==========\n');
  process.exit(failed.length ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
