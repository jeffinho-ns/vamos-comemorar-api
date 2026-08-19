'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveOrganizationIdForBar } = require('../../services/menuOrganizationRepair');

test('resolveOrganizationIdForBar: usa establishments.legacy_bar_id', async () => {
  const pool = {
    async query(sql, params) {
      assert.match(sql, /legacy_bar_id/i);
      assert.equal(params[0], 15);
      return { rows: [{ organization_id: 9 }] };
    },
  };
  const orgId = await resolveOrganizationIdForBar(pool, 15, 1);
  assert.equal(orgId, 9);
});

test('resolveOrganizationIdForBar: fallback para primaryOrganizationId', async () => {
  const pool = {
    async query() {
      return { rows: [] };
    },
  };
  const orgId = await resolveOrganizationIdForBar(pool, 15, 9);
  assert.equal(orgId, 9);
});

test('resolveOrganizationIdForBar: bar inválido retorna fallback', async () => {
  const pool = {
    async query() {
      throw new Error('não deveria consultar');
    },
  };
  assert.equal(await resolveOrganizationIdForBar(pool, null, 9), 9);
  assert.equal(await resolveOrganizationIdForBar(pool, 'x', null), null);
});
