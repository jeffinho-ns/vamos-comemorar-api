'use strict';

/**
 * Garante a semântica de isolamento de LEITURA (establishmentScopeClause /
 * canReadEstablishment): inerte fora do enforce, no-op para admin/anônimo,
 * e restrição real para usuário autenticado escopado.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { establishmentScopeClause, canReadEstablishment } = require('../../tenancy/queryScope');

const scopedReq = { tenant: { isAdmin: false, establishmentIds: [1, 4] } };
const adminReq = { tenant: { isAdmin: true, establishmentIds: [] } };
const anonReq = {}; // sem req.tenant (anônimo)

test('off => clausula vazia (query inalterada)', () => {
  process.env.SAAS_MODE = 'off';
  const r = establishmentScopeClause(scopedReq, 'rr.establishment_id', 1);
  assert.equal(r.sql, '');
  assert.deepEqual(r.params, []);
  assert.equal(r.nextIndex, 1);
});

test('observe => clausula vazia (observe nunca altera resultado)', () => {
  process.env.SAAS_MODE = 'observe';
  const r = establishmentScopeClause(scopedReq, 'rr.establishment_id', 1);
  assert.equal(r.sql, '');
});

test('on + escopado => IN com placeholders e params', () => {
  process.env.SAAS_MODE = 'on';
  const r = establishmentScopeClause(scopedReq, 'rr.establishment_id', 3);
  assert.equal(r.sql, ' AND rr.establishment_id IN ($3, $4)');
  assert.deepEqual(r.params, [1, 4]);
  assert.equal(r.nextIndex, 5);
});

test('on + admin => clausula vazia (vê tudo)', () => {
  process.env.SAAS_MODE = 'on';
  assert.equal(establishmentScopeClause(adminReq, 'rr.establishment_id', 1).sql, '');
});

test('on + anônimo => clausula vazia (rota pública)', () => {
  process.env.SAAS_MODE = 'on';
  assert.equal(establishmentScopeClause(anonReq, 'rr.establishment_id', 1).sql, '');
});

test('on + escopado SEM escopo => nao vaza nada (= -1)', () => {
  process.env.SAAS_MODE = 'on';
  const r = establishmentScopeClause({ tenant: { isAdmin: false, establishmentIds: [] } }, 'rr.establishment_id', 1);
  assert.equal(r.sql, ' AND rr.establishment_id = -1');
});

test('canReadEstablishment: off => sempre true', () => {
  process.env.SAAS_MODE = 'off';
  assert.equal(canReadEstablishment(scopedReq, 99), true);
});

test('canReadEstablishment: on + escopado dentro/fora', () => {
  process.env.SAAS_MODE = 'on';
  assert.equal(canReadEstablishment(scopedReq, 1), true);
  assert.equal(canReadEstablishment(scopedReq, 99), false);
});

test('canReadEstablishment: on + admin/anônimo => true', () => {
  process.env.SAAS_MODE = 'on';
  assert.equal(canReadEstablishment(adminReq, 99), true);
  assert.equal(canReadEstablishment(anonReq, 99), true);
});

test.after(() => { delete process.env.SAAS_MODE; });
