'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  operationalEstablishmentIdFromRow,
  loadUserScope,
} = require('../../tenancy/tenantScope');

test('operationalEstablishmentIdFromRow prioriza legacy_place_id', () => {
  assert.equal(
    operationalEstablishmentIdFromRow({
      establishment_id: 99,
      legacy_place_id: 7,
      legacy_bar_id: 3,
    }),
    7,
  );
});

test('operationalEstablishmentIdFromRow usa legacy_bar_id sem place', () => {
  assert.equal(
    operationalEstablishmentIdFromRow({
      establishment_id: 99,
      legacy_place_id: null,
      legacy_bar_id: 5,
    }),
    5,
  );
});

test('loadUserScope memberships traduz ids canonicos para operacionais', async () => {
  const pool = {
    async query(sql, params) {
      if (/memberships/i.test(sql)) {
        return {
          rows: [
            {
              organization_id: 1,
              establishment_id: 10,
              legacy_place_id: 7,
              legacy_bar_id: 3,
            },
          ],
        };
      }
      throw new Error('query inesperada');
    },
  };

  const scope = await loadUserScope(pool, { id: 42, email: 'g@test.com', role: 'gerente' });
  assert.deepEqual(scope.establishmentIds, [7]);
  assert.deepEqual(scope.organizationIds, [1]);
});

test('loadUserScope membership org-wide inclui todas as casas da org', async () => {
  const pool = {
    async query(sql) {
      if (/memberships/i.test(sql)) {
        return {
          rows: [{ organization_id: 1, establishment_id: null, legacy_place_id: null, legacy_bar_id: null }],
        };
      }
      if (/FROM meu_backup_db.establishments/i.test(sql)) {
        return {
          rows: [
            { legacy_place_id: 7, legacy_bar_id: 3 },
            { legacy_place_id: 9, legacy_bar_id: 5 },
          ],
        };
      }
      throw new Error(`query inesperada: ${sql}`);
    },
  };

  const scope = await loadUserScope(pool, { id: 1, email: 'a@test.com', role: 'gerente' });
  assert.deepEqual(scope.establishmentIds.sort(), [7, 9]);
});
