'use strict';

/**
 * Isolamento de LEITURA sempre ativo quando req.tenant está populado
 * (independente de SAAS_MODE).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { establishmentScopeClause, canReadEstablishment } = require('../../tenancy/queryScope');

const scopedReq = { tenant: { isAdmin: false, establishmentIds: [1, 4] } };
const adminReq = { tenant: { isAdmin: true, establishmentIds: [] } };
const anonReq = {}; // sem req.tenant (anônimo)

test('escopado => IN com placeholders (mesmo com SAAS off)', () => {
  process.env.SAAS_MODE = 'off';
  const r = establishmentScopeClause(scopedReq, 'rr.establishment_id', 3);
  assert.equal(r.sql, ' AND rr.establishment_id IN ($3, $4)');
  assert.deepEqual(r.params, [1, 4]);
  assert.equal(r.nextIndex, 5);
});

test('admin => clausula vazia (vê tudo)', () => {
  process.env.SAAS_MODE = 'off';
  assert.equal(establishmentScopeClause(adminReq, 'rr.establishment_id', 1).sql, '');
});

test('anônimo => clausula vazia (rota pública)', () => {
  process.env.SAAS_MODE = 'on';
  assert.equal(establishmentScopeClause(anonReq, 'rr.establishment_id', 1).sql, '');
});

test('escopado SEM ids => nao vaza nada (= -1)', () => {
  const r = establishmentScopeClause(
    { tenant: { isAdmin: false, establishmentIds: [] } },
    'rr.establishment_id',
    1,
  );
  assert.equal(r.sql, ' AND rr.establishment_id = -1');
});

test('canReadEstablishment: escopado dentro/fora', () => {
  process.env.SAAS_MODE = 'off';
  assert.equal(canReadEstablishment(scopedReq, 1), true);
  assert.equal(canReadEstablishment(scopedReq, 99), false);
});

test('canReadEstablishment: admin/anônimo => true', () => {
  assert.equal(canReadEstablishment(adminReq, 99), true);
  assert.equal(canReadEstablishment(anonReq, 99), true);
});

test.after(() => {
  delete process.env.SAAS_MODE;
});
