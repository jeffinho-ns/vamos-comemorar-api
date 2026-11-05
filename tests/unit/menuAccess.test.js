'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  ALLOWED_MENU_KEYS,
  sanitizeMenuAccess,
  deriveLegacyFlagsFromMenuAccess,
  canAccessBiJustinoFromUep,
} = require('../../tenancy/menuAccess');
const { mergeUepRowIntoPermissionSet } = require('../../tenancy/uepToRbacPermissions');
const { canAccessBiJustinoFromUep: fromBi } = require('../../services/biJustino/access');

test('sanitizeMenuAccess aceita só a whitelist e bloqueia reservas/equipe/superadmin', () => {
  const out = sanitizeMenuAccess([
    'checkins',
    'reservas',
    'equipe',
    'superadmin',
    'bi-justino',
    'users',
    'nope',
    'checkins',
  ]);
  assert.deepEqual(out, ['checkins', 'bi-justino', 'users']);
  assert.equal(ALLOWED_MENU_KEYS.includes('reservas'), false);
});

test('deriveLegacyFlagsFromMenuAccess liga e desliga só as flags mapeadas', () => {
  const flags = deriveLegacyFlagsFromMenuAccess(['cardapio', 'atendimento']);
  assert.equal(flags.can_view_cardapio, true);
  assert.equal(flags.can_create_cardapio, true);
  assert.equal(flags.can_edit_cardapio, true);
  assert.equal(flags.can_manage_whatsapp, true);
  assert.equal(flags.can_manage_checkins, false);
  assert.equal(flags.can_manage_reservations, false);
  assert.equal(flags.can_configure_ia, undefined);
});

test('canAccessBiJustinoFromUep não substitui allowlist de e-mail', () => {
  assert.equal(canAccessBiJustinoFromUep({ menu_access: ['bi-justino'] }), true);
  assert.equal(fromBi({ menu_access: ['logs'] }), false);
});

test('menu_access concede RBAC correspondente sem flags', () => {
  const perms = new Set();
  mergeUepRowIntoPermissionSet(perms, {
    can_manage_reservations: false,
    can_create_edit_reservations: false,
    can_manage_checkins: false,
    can_manage_whatsapp: false,
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
    menu_access: ['logs', 'eventos', 'justino360', 'rh-ideia', 'checkins'],
  });
  assert.ok(perms.has('relatorios:read'));
  assert.ok(perms.has('eventos:read'));
  assert.ok(perms.has('justino360:read'));
  assert.ok(perms.has('rh_ideia:read'));
  assert.ok(perms.has('checkin:read'));
});
