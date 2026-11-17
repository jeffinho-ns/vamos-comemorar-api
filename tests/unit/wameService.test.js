'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizeRecipient,
  sendText,
  providerMessageId,
} = require('../../services/wame/wameService');
const { runWithWame } = require('../../services/wame/wameContext');
const { establishmentFromDisplayPhone } = require('../../services/wame/wameHouse');
const {
  isWameConfigured,
  isWameOutboundEnabled,
  getWameServerUrl,
} = require('../../services/wame/wameConfig');

describe('wameService', () => {
  it('normaliza destinatário BR com DDI', () => {
    assert.equal(normalizeRecipient('5511999998888'), '5511999998888');
    assert.equal(normalizeRecipient('waba:123:5511999998888'), '5511999998888');
  });

  it('aceita o id da Wame no lugar do id da Meta', () => {
    assert.equal(
      providerMessageId({ status: 200, data: { key: { id: '3EB0A1' } } }),
      '3EB0A1',
    );
    assert.equal(providerMessageId({ messages: [{ id: 'wamid.1' }] }), 'wamid.1');
    assert.match(providerMessageId({ status: 200 }), /^wame-/);
    assert.equal(providerMessageId({ status: 400 }), null);
  });

  it('acha a instância da casa quando a conversa só tem histórico', async () => {
    const { findEstablishmentWameInstanceId } = require('../../services/wame/wameService');
    const pool = {
      query: async () => ({
        rows: [{
          raw_payload: {
            entry: [{
              changes: [{
                value: { metadata: { phone_number_id: 'justinoKey1' } },
              }],
            }],
          },
        }],
      }),
    };
    assert.equal(await findEstablishmentWameInstanceId(pool, 1), 'justinoKey1');
  });

  it('rejeita destinatário curto', () => {
    assert.throws(() => normalizeRecipient('119999'), /inválido/i);
  });

  it('envia pela chave da instância e tenta outro servidor se o primeiro cair', async () => {
    const prevKey = process.env.WAME_API_KEY;
    const prevServer = process.env.WAME_SERVER_URL;
    process.env.WAME_API_KEY = 'env-key';
    process.env.WAME_SERVER_URL = 'https://dead.example';
    const calls = [];
    const originalFetch = global.fetch;
    global.fetch = async (url) => {
      calls.push(String(url));
      if (String(url).includes('dead.example')) {
        throw new TypeError('fetch failed');
      }
      return { ok: true, json: async () => ({ status: 200 }) };
    };
    try {
      await runWithWame({ enabled: true, instanceId: 'abc123key' }, () =>
        sendText('5511999998888', 'oi')
      );
      assert.match(calls[0], /^https:\/\/dead\.example\/abc123key\/message\/text$/);
      assert.match(calls.at(-1), /^https:\/\/us\.api-wa\.me\/abc123key\/message\/text$/);
    } finally {
      global.fetch = originalFetch;
      if (prevKey == null) delete process.env.WAME_API_KEY;
      else process.env.WAME_API_KEY = prevKey;
      if (prevServer == null) delete process.env.WAME_SERVER_URL;
      else process.env.WAME_SERVER_URL = prevServer;
    }
  });
});

describe('wameHouse', () => {
  it('amarra o telefone da Pracinha na casa 8', () => {
    assert.equal(establishmentFromDisplayPhone('551123050938'), 8);
    assert.equal(establishmentFromDisplayPhone('+55 11 2305-0938'), 8);
    assert.equal(establishmentFromDisplayPhone('551152003650'), 1);
    assert.equal(establishmentFromDisplayPhone('+55 11 5200-3650'), 1);
    assert.equal(establishmentFromDisplayPhone('5511999999999'), null);
  });
});

describe('wameConfig', () => {
  it('usa server padrão sem barra final', () => {
    const prev = process.env.WAME_SERVER_URL;
    delete process.env.WAME_SERVER_URL;
    assert.equal(getWameServerUrl(), 'https://v5.api.wame.pro');
    process.env.WAME_SERVER_URL = 'https://v5.api.wame.pro/';
    assert.equal(getWameServerUrl(), 'https://v5.api.wame.pro');
    if (prev == null) delete process.env.WAME_SERVER_URL;
    else process.env.WAME_SERVER_URL = prev;
  });

  it('outbound Wame só com flag explícita', () => {
    const prevProvider = process.env.WHATSAPP_OUTBOUND_PROVIDER;
    const prevEnabled = process.env.WAME_ENABLED;
    delete process.env.WHATSAPP_OUTBOUND_PROVIDER;
    delete process.env.WAME_ENABLED;
    assert.equal(isWameOutboundEnabled(), false);
    process.env.WHATSAPP_OUTBOUND_PROVIDER = 'wame';
    assert.equal(isWameOutboundEnabled(), true);
    process.env.WHATSAPP_OUTBOUND_PROVIDER = 'meta';
    assert.equal(isWameOutboundEnabled(), false);
    if (prevProvider == null) delete process.env.WHATSAPP_OUTBOUND_PROVIDER;
    else process.env.WHATSAPP_OUTBOUND_PROVIDER = prevProvider;
    if (prevEnabled == null) delete process.env.WAME_ENABLED;
    else process.env.WAME_ENABLED = prevEnabled;
  });

  it('configured exige key', () => {
    const prevKey = process.env.WAME_API_KEY;
    const prevServer = process.env.WAME_SERVER_URL;
    delete process.env.WAME_API_KEY;
    delete process.env.WAME_SERVER_URL;
    assert.equal(isWameConfigured(), false);
    process.env.WAME_API_KEY = 'test-key';
    assert.equal(isWameConfigured(), true);
    if (prevKey == null) delete process.env.WAME_API_KEY;
    else process.env.WAME_API_KEY = prevKey;
    if (prevServer == null) delete process.env.WAME_SERVER_URL;
    else process.env.WAME_SERVER_URL = prevServer;
  });
});
