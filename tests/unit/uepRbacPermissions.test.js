'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  mergeUepRowIntoPermissionSet,
  loadUepRbacPermissions,
} = require('../../tenancy/uepToRbacPermissions');
const { resolveEntitlements } = require('../../tenancy/entitlements');

test('UEP com can_manage_whatsapp concede whatsapp:read e whatsapp:update', () => {
  const perms = new Set();
  mergeUepRowIntoPermissionSet(perms, {
    can_manage_reservations: false,
    can_manage_whatsapp: true,
    can_configure_ia: false,
  });
  assert.ok(perms.has('whatsapp:read'));
  assert.ok(perms.has('whatsapp:update'));
});

test('resolveEntitlements mescla UEP com membership recepcao', async () => {
  process.env.SAAS_MODE = 'on';
  const pool = {
    async query(sql) {
      if (/role_permissions/i.test(sql)) {
        return {
          rows: [
            { key: 'reservas:read', role_key: 'recepcao' },
            { key: 'checkin:read', role_key: 'recepcao' },
          ],
        };
      }
      if (/user_establishment_permissions/i.test(sql)) {
        return {
          rows: [
            {
              can_manage_reservations: true,
              can_create_edit_reservations: true,
              can_manage_checkins: true,
              can_manage_whatsapp: true,
              can_configure_ia: false,
              can_view_cardapio: false,
              can_create_cardapio: false,
              can_edit_cardapio: false,
              can_delete_cardapio: false,
              can_view_reports: false,
              can_view_os: false,
              can_create_os: false,
              can_edit_os: false,
              can_view_operational_detail: false,
              can_create_operational_detail: false,
              can_edit_operational_detail: false,
            },
          ],
        };
      }
      if (/memberships/i.test(sql)) {
        return {
          rows: [
            {
              organization_id: 1,
              establishment_id: 7,
              legacy_place_id: 7,
              legacy_bar_id: null,
            },
          ],
        };
      }
      if (/subscriptions/i.test(sql)) return { rows: [{ status: 'active' }] };
      if (/organization_modules/i.test(sql)) {
        return { rows: [{ key: 'whatsapp' }, { key: 'reservas' }] };
      }
      if (/FROM meu_backup_db.establishments/i.test(sql)) {
        return { rows: [{ legacy_place_id: 7, legacy_bar_id: null }] };
      }
      throw new Error(`query: ${sql}`);
    },
  };

  const ent = await resolveEntitlements(pool, {
    id: 99,
    email: 'recepcao@teste',
    role: 'promoter',
    is_super_admin: false,
  });

  assert.ok(ent.permissions.includes('whatsapp:read'));
  assert.ok(ent.permissions.includes('whatsapp:update'));
  assert.equal(ent.legacyScoped, false);
  delete process.env.SAAS_MODE;
});

test('loadUepRbacPermissions retorna vazio sem linhas', async () => {
  const pool = {
    async query() {
      return { rows: [] };
    },
  };
  const perms = await loadUepRbacPermissions(pool, 1);
  assert.deepEqual(perms, []);
});
