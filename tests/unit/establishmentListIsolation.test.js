'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  resolveEstablishmentListFilter,
  sqlPlaceIsolation,
  sqlBarIsolation,
} = require('../../tenancy/establishmentListIsolation');

test('anônimo continua público (reserva/cardápio sem login)', () => {
  const filter = resolveEstablishmentListFilter(null, null);
  assert.equal(filter.mode, 'public');
  assert.equal(sqlPlaceIsolation(filter, 1).sql, '');
  assert.equal(sqlBarIsolation(filter, 1).sql, '');
});

test('superadmin vê todas as casas', () => {
  const filter = resolveEstablishmentListFilter(
    { id: 1, is_super_admin: true, role: 'admin' },
    { isAdmin: true, organizationIds: [], establishmentIds: [] },
  );
  assert.equal(filter.mode, 'all');
});

test('admin da nova org só vê casas da própria organização', () => {
  const filter = resolveEstablishmentListFilter(
    { id: 900, is_super_admin: false, role: 'admin' },
    { isAdmin: false, organizationIds: [99], establishmentIds: [501, 502] },
  );
  assert.equal(filter.mode, 'organization');
  assert.deepEqual(filter.organizationIds, [99]);
  const placeSql = sqlPlaceIsolation(filter, 1);
  assert.match(placeSql.sql, /organization_id = ANY/i);
  assert.deepEqual(placeSql.params, [[99]]);
  const barSql = sqlBarIsolation(filter, 1);
  assert.match(barSql.sql, /legacy_bar_id = b\.id/i);
  assert.deepEqual(barSql.params, [[99]]);
});

test('autenticado sem org e sem casas não vê o universo de estabelecimentos', () => {
  const filter = resolveEstablishmentListFilter(
    { id: 3, is_super_admin: false, role: 'gerente' },
    { isAdmin: false, organizationIds: [], establishmentIds: [] },
  );
  assert.equal(filter.mode, 'none');
  assert.equal(sqlPlaceIsolation(filter, 1).sql.trim(), 'AND FALSE');
});

test('usuário legado com UEP filtra pelos ids operacionais', () => {
  const filter = resolveEstablishmentListFilter(
    { id: 4, is_super_admin: false, role: 'gerente' },
    { isAdmin: false, organizationIds: [], establishmentIds: [7, 8] },
  );
  assert.equal(filter.mode, 'establishments');
  const placeSql = sqlPlaceIsolation(filter, 2);
  assert.match(placeSql.sql, /p\.id = ANY/);
  assert.deepEqual(placeSql.params, [[7, 8]]);
});
