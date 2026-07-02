'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildTokenPayload } = require('../../tenancy/jwtClaims');
const { loadUserScope } = require('../../tenancy/tenantScope');

test('buildTokenPayload inclui organization_id do escopo UEP', async () => {
  const pool = {
    async query(sql, params) {
      if (/is_super_admin/i.test(sql)) {
        return { rows: [{ is_super_admin: false }] };
      }
      if (/memberships/i.test(sql)) {
        return { rows: [] };
      }
      if (/user_establishment_permissions/i.test(sql)) {
        return { rows: [{ establishment_id: 8 }] };
      }
      if (/establishments/i.test(sql)) {
        return { rows: [{ organization_id: 1 }] };
      }
      throw new Error(`query inesperada: ${sql}`);
    },
  };

  const payload = await buildTokenPayload(pool, {
    id: 42,
    email: 'analista@pracinha.com',
    role: 'gerente',
  });

  assert.equal(payload.organization_id, 1);
  assert.deepEqual(payload.organization_ids, [1]);
  assert.equal(payload.is_super_admin, false);
});

test('loadUserScope UEP resolve organizationIds via establishments', async () => {
  const pool = {
    async query(sql) {
      if (/memberships/i.test(sql)) return { rows: [] };
      if (/user_establishment_permissions/i.test(sql)) {
        return { rows: [{ establishment_id: 8 }, { establishment_id: 4 }] };
      }
      if (/establishments/i.test(sql)) {
        return { rows: [{ organization_id: 1 }, { organization_id: 1 }] };
      }
      throw new Error(`query inesperada: ${sql}`);
    },
  };

  const scope = await loadUserScope(pool, { id: 1, email: 'a@test.com', role: 'gerente' });
  assert.deepEqual(scope.organizationIds, [1]);
  assert.deepEqual(scope.establishmentIds.sort(), [4, 8]);
});
