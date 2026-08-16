'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { uepFlagsForModules } = require('../../billing/uepFlagsForModules');

test('org só cardápio libera só flags de cardápio', () => {
  const flags = uepFlagsForModules(['cardapio']);
  assert.equal(flags.can_view_cardapio, true);
  assert.equal(flags.can_edit_cardapio, true);
  assert.equal(flags.can_manage_reservations, false);
  assert.equal(flags.can_manage_checkins, false);
  assert.equal(flags.can_view_os, false);
  assert.equal(flags.is_active, true);
});

test('sem módulos não liga nenhuma função operacional', () => {
  const flags = uepFlagsForModules([]);
  assert.equal(flags.can_view_cardapio, false);
  assert.equal(flags.can_manage_reservations, false);
});
