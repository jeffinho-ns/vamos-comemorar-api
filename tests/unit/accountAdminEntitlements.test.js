'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadUserScope } = require('../../tenancy/tenantScope');
const { resolveEntitlements } = require('../../tenancy/entitlements');

test('loadUserScope account_admin com role admin usa memberships, não escopo global', async () => {
  const pool = {
    async query(sql) {
      if (/memberships/i.test(sql)) {
        return {
          rows: [
            {
              organization_id: 8,
              establishment_id: null,
              legacy_place_id: null,
              legacy_bar_id: null,
            },
          ],
        };
      }
      if (/FROM meu_backup_db.establishments/i.test(sql)) {
        return { rows: [{ legacy_place_id: 16, legacy_bar_id: 13 }] };
      }
      throw new Error(`query inesperada: ${sql}`);
    },
  };

  const scope = await loadUserScope(pool, {
    id: 233,
    email: 'demo-b-admin@agilizaiapp.test',
    role: 'admin',
    is_super_admin: false,
  });
  assert.equal(scope.isAdmin, false);
  assert.deepEqual(scope.organizationIds, [8]);
  assert.deepEqual(scope.establishmentIds, [16]);
});

test('resolveEntitlements org admin não recebe allowAll', async () => {
  process.env.SAAS_MODE = 'on';
  const pool = {
    async query(sql) {
      if (/role_permissions/i.test(sql)) {
        return {
          rows: [
            { key: 'reservas:read', role_key: 'account_admin' },
            { key: 'reservas:create', role_key: 'account_admin' },
          ],
        };
      }
      if (/memberships/i.test(sql)) {
        return {
          rows: [
            {
              organization_id: 8,
              establishment_id: null,
              legacy_place_id: null,
              legacy_bar_id: null,
            },
          ],
        };
      }
      if (/subscriptions/i.test(sql)) return { rows: [{ status: 'active' }] };
      if (/organization_modules/i.test(sql)) {
        return { rows: [{ key: 'reservas' }, { key: 'cardapio' }] };
      }
      if (/FROM meu_backup_db.establishments/i.test(sql)) {
        return { rows: [{ legacy_place_id: 16, legacy_bar_id: 13 }] };
      }
      throw new Error(`query: ${sql}`);
    },
  };

  const ent = await resolveEntitlements(pool, {
    id: 233,
    email: 'demo-b-admin@agilizaiapp.test',
    role: 'admin',
    is_super_admin: false,
  });
  assert.equal(ent.allowAll, false);
  assert.equal(ent.organizationId, 8);
  assert.equal(ent.isAccountAdmin, true);
  delete process.env.SAAS_MODE;
});
