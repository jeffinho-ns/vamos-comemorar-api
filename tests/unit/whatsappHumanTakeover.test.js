const test = require('node:test');
const assert = require('node:assert/strict');

test('isHumanTakeoverActive respeita pausa até retorno manual', async () => {
  const queries = [];
  const pool = {
    query: async (sql, params) => {
      queries.push({ sql, params });
      if (sql.includes('human_takeover_until')) {
        return {
          rows: [{ human_takeover_until: '2099-12-31T23:59:59.000Z' }],
        };
      }
      return { rows: [] };
    },
  };

  const inbox = require('../../services/whatsappInboxRepository');
  const active = await inbox.isHumanTakeoverActive(pool, '5511999999999');
  assert.equal(active, true);
});

test('isHumanTakeoverActive false quando campo vazio', async () => {
  const pool = {
    query: async () => ({
      rows: [{ human_takeover_until: null }],
    }),
  };
  const inbox = require('../../services/whatsappInboxRepository');
  assert.equal(await inbox.isHumanTakeoverActive(pool, '5511888888888'), false);
});
