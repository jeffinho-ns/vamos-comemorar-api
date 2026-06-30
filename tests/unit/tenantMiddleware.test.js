'use strict';

/**
 * Garante a semântica de segurança do tenantMiddleware (SaaS multi-tenant):
 *   - off       => no-op (sempre next()).
 *   - observe   => nunca bloqueia (apenas logaria).
 *   - on        => restringe usuários AUTENTICADOS ao escopo; NÃO impõe login
 *                  (anônimo segue), admin acessa tudo.
 *
 * Estes testes blindam o passo de "enforce" para não quebrar o fluxo público
 * de reservas (POST /api/restaurant-reservations sem token).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const tenantMiddleware = require('../../tenancy/tenantMiddleware');

// pool falso: usuário escopado ao establishment 1 (via memberships).
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
    // se o middleware respondeu sem chamar next, resolve via microtask
    Promise.resolve(result).then(() => {
      if (!nextCalled) resolve({ res, nextCalled });
    });
  });
}

const scopedUser = { id: 10, email: 'gerente@casa1.com', role: 'gerente' };
const adminUser = { id: 1, email: 'admin@empresa.com', role: 'admin' };

test('off => no-op (passa tudo, mesmo fora de escopo)', async () => {
  process.env.SAAS_MODE = 'off';
  const { res, nextCalled } = await run(makeReq({ user: scopedUser, establishmentId: 99 }));
  assert.equal(nextCalled, true);
  assert.equal(res.statusCode, null);
});

test('observe => nunca bloqueia (fora de escopo segue)', async () => {
  process.env.SAAS_MODE = 'observe';
  const { res, nextCalled } = await run(makeReq({ user: scopedUser, establishmentId: 99 }));
  assert.equal(nextCalled, true);
  assert.equal(res.statusCode, null);
});

test('on + anônimo (sem token) => NÃO bloqueia (reserva pública continua)', async () => {
  process.env.SAAS_MODE = 'on';
  const { res, nextCalled } = await run(makeReq({ user: undefined, establishmentId: 99 }));
  assert.equal(nextCalled, true);
  assert.equal(res.statusCode, null);
});

test('on + admin => acessa qualquer estabelecimento', async () => {
  process.env.SAAS_MODE = 'on';
  const { res, nextCalled } = await run(makeReq({ user: adminUser, establishmentId: 99 }));
  assert.equal(nextCalled, true);
  assert.equal(res.statusCode, null);
});

test('on + usuário escopado dentro do escopo => passa', async () => {
  process.env.SAAS_MODE = 'on';
  const { res, nextCalled } = await run(makeReq({ user: scopedUser, establishmentId: 1 }));
  assert.equal(nextCalled, true);
  assert.equal(res.statusCode, null);
});

test('on + usuário escopado FORA do escopo => 403', async () => {
  process.env.SAAS_MODE = 'on';
  const { res, nextCalled } = await run(makeReq({ user: scopedUser, establishmentId: 99 }));
  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 403);
});

test.after(() => { delete process.env.SAAS_MODE; });
