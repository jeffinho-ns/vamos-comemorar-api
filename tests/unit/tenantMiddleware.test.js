'use strict';

/**
 * Isolamento de organização SEMPRE ativo para usuários autenticados
 * (independente de SAAS_MODE). Anônimos seguem (rotas públicas).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const tenantMiddleware = require('../../tenancy/tenantMiddleware');

const poolScopedToEst1 = {
  async query(sql) {
    if (/memberships/i.test(sql)) {
      return { rows: [{ organization_id: 1, establishment_id: 1 }] };
    }
    return { rows: [] };
  },
};

function makeReq({ user, establishmentId, pool = poolScopedToEst1 } = {}) {
  return {
    app: { get: (k) => (k === 'pool' ? pool : null) },
    user,
    query: establishmentId != null ? { establishment_id: establishmentId } : {},
    body: {},
    params: {},
    method: 'GET',
    originalUrl: '/api/restaurant-reservations',
  };
}

function makeRes() {
  return {
    statusCode: null,
    body: null,
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
  };
}

function run(req) {
  return new Promise((resolve) => {
    const res = makeRes();
    let nextCalled = false;
    const next = () => { nextCalled = true; resolve({ res, nextCalled }); };
    const result = tenantMiddleware()(req, res, next);
    Promise.resolve(result).then(() => {
      if (!nextCalled) resolve({ res, nextCalled });
    });
  });
}

const scopedUser = { id: 10, email: 'gerente@casa1.com', role: 'gerente' };
const adminUser = { id: 1, email: 'admin@empresa.com', role: 'admin' };
const superAdminUser = {
  id: 2,
  email: 'super@agilizai.app',
  role: 'admin',
  is_super_admin: true,
};

const poolUnscopedAdmin = {
  async query(sql) {
    if (/memberships/i.test(sql)) return { rows: [] };
    if (/user_establishment_permissions/i.test(sql)) return { rows: [] };
    if (/FROM users/i.test(sql)) return { rows: [] };
    return { rows: [] };
  },
};

test('SAAS off + autenticado fora de escopo => 403 (isolamento always-on)', async () => {
  process.env.SAAS_MODE = 'off';
  const { res, nextCalled } = await run(makeReq({ user: scopedUser, establishmentId: 99 }));
  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 403);
});

test('anônimo (sem token) => NÃO bloqueia (reserva pública)', async () => {
  process.env.SAAS_MODE = 'off';
  const { res, nextCalled } = await run(makeReq({ user: undefined, establishmentId: 99 }));
  assert.equal(nextCalled, true);
  assert.equal(res.statusCode, null);
});

test('superadmin => acessa qualquer estabelecimento', async () => {
  process.env.SAAS_MODE = 'off';
  const { res, nextCalled } = await run(makeReq({ user: superAdminUser, establishmentId: 99 }));
  assert.equal(nextCalled, true);
  assert.equal(res.statusCode, null);
});

test('admin de tenant NÃO acessa casa de outra organização', async () => {
  process.env.SAAS_MODE = 'on';
  const { res, nextCalled } = await run(makeReq({ user: adminUser, establishmentId: 99 }));
  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 403);
});

test('admin sem vínculo de tenant => fail-closed (403)', async () => {
  process.env.SAAS_MODE = 'on';
  const { res, nextCalled } = await run(
    makeReq({ user: adminUser, establishmentId: 99, pool: poolUnscopedAdmin }),
  );
  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 403);
});

test('usuário escopado dentro do escopo => passa', async () => {
  process.env.SAAS_MODE = 'on';
  const { res, nextCalled } = await run(makeReq({ user: scopedUser, establishmentId: 1 }));
  assert.equal(nextCalled, true);
  assert.equal(res.statusCode, null);
});

test('usuário escopado FORA do escopo => 403', async () => {
  process.env.SAAS_MODE = 'on';
  const { res, nextCalled } = await run(makeReq({ user: scopedUser, establishmentId: 99 }));
  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 403);
});

test.after(() => { delete process.env.SAAS_MODE; });
