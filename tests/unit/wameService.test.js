'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { normalizeRecipient } = require('../../services/wame/wameService');
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

  it('rejeita destinatário curto', () => {
    assert.throws(() => normalizeRecipient('119999'), /inválido/i);
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
