'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizeRecipient,
  sendText,
  providerMessageId,
  shouldRetryOnAnotherServer,
  isPermanentHttpStatus,
  isTransientHttpStatus,
  serverCandidates,
  resolveWameRouting,
} = require('../../services/wame/wameService');
const { runWithWame } = require('../../services/wame/wameContext');
const { establishmentFromDisplayPhone } = require('../../services/wame/wameHouse');
const {
  isWameConfigured,
  isWameOutboundEnabled,
  getWameServerUrl,
  resolveMappedInstanceForEstablishment,
  resolveMappedServerForInstance,
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

  it('classifica 401/404 como permanente e não troca de servidor', () => {
    assert.equal(isPermanentHttpStatus(401), true);
    assert.equal(isPermanentHttpStatus(404), true);
    assert.equal(isTransientHttpStatus(503), true);
    assert.equal(shouldRetryOnAnotherServer({ status: 401 }), false);
    assert.equal(shouldRetryOnAnotherServer({ status: 404 }), false);
    assert.equal(shouldRetryOnAnotherServer({ status: 503 }), true);
    assert.equal(shouldRetryOnAnotherServer({ message: 'fetch failed' }), true);
  });

  it('usa só o servidor explícito da instância quando mapeado', () => {
    const prev = process.env.WAME_SERVER_BY_INSTANCE;
    process.env.WAME_SERVER_BY_INSTANCE = JSON.stringify({
      abc123key: 'https://us.api-wa.me',
    });
    try {
      assert.deepEqual(serverCandidates('abc123key'), ['https://us.api-wa.me']);
      assert.equal(resolveMappedServerForInstance('abc123key'), 'https://us.api-wa.me');
    } finally {
      if (prev == null) delete process.env.WAME_SERVER_BY_INSTANCE;
      else process.env.WAME_SERVER_BY_INSTANCE = prev;
    }
  });

  it('envia pela chave da instância e tenta outro servidor se o primeiro cair (rede)', async () => {
    const prevKey = process.env.WAME_API_KEY;
    const prevServer = process.env.WAME_SERVER_URL;
    const prevMap = process.env.WAME_SERVER_BY_INSTANCE;
    process.env.WAME_API_KEY = 'env-key';
    process.env.WAME_SERVER_URL = 'https://dead.example';
    delete process.env.WAME_SERVER_BY_INSTANCE;
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
      if (prevMap == null) delete process.env.WAME_SERVER_BY_INSTANCE;
      else process.env.WAME_SERVER_BY_INSTANCE = prevMap;
    }
  });

  it('não troca de servidor em 401', async () => {
    const prevKey = process.env.WAME_API_KEY;
    const prevServer = process.env.WAME_SERVER_URL;
    const prevMap = process.env.WAME_SERVER_BY_INSTANCE;
    process.env.WAME_API_KEY = 'env-key';
    process.env.WAME_SERVER_URL = 'https://primary.example';
    // Mapa explícito: um único host — 401 não pode vazar para FALLBACK_SERVERS
    process.env.WAME_SERVER_BY_INSTANCE = JSON.stringify({
      perm401keyxx: 'https://primary.example',
    });
    const calls = [];
    const originalFetch = global.fetch;
    global.fetch = async (url) => {
      calls.push(String(url));
      return {
        ok: false,
        status: 401,
        json: async () => ({ message: 'unauthorized' }),
      };
    };
    try {
      await assert.rejects(
        () =>
          runWithWame({ enabled: true, instanceId: 'perm401keyxx' }, () =>
            sendText('5511999998888', 'oi')
          ),
        /401/,
      );
      assert.equal(calls.length, 1);
      assert.match(calls[0], /^https:\/\/primary\.example\//);
    } finally {
      global.fetch = originalFetch;
      if (prevKey == null) delete process.env.WAME_API_KEY;
      else process.env.WAME_API_KEY = prevKey;
      if (prevServer == null) delete process.env.WAME_SERVER_URL;
      else process.env.WAME_SERVER_URL = prevServer;
      if (prevMap == null) delete process.env.WAME_SERVER_BY_INSTANCE;
      else process.env.WAME_SERVER_BY_INSTANCE = prevMap;
    }
  });

  it('em 401 sem mapa explícito também não tenta outro host', async () => {
    const prevKey = process.env.WAME_API_KEY;
    const prevServer = process.env.WAME_SERVER_URL;
    const prevMap = process.env.WAME_SERVER_BY_INSTANCE;
    process.env.WAME_API_KEY = 'env-key';
    process.env.WAME_SERVER_URL = 'https://only-one.example';
    delete process.env.WAME_SERVER_BY_INSTANCE;
    const calls = [];
    const originalFetch = global.fetch;
    global.fetch = async (url) => {
      calls.push(String(url));
      return {
        ok: false,
        status: 401,
        json: async () => ({ message: 'unauthorized' }),
      };
    };
    try {
      await assert.rejects(
        () =>
          runWithWame({ enabled: true, instanceId: 'fresh401inst1' }, () =>
            sendText('5511999998888', 'oi')
          ),
        /401/,
      );
      assert.equal(calls.length, 1);
      assert.match(calls[0], /^https:\/\/only-one\.example\//);
    } finally {
      global.fetch = originalFetch;
      if (prevKey == null) delete process.env.WAME_API_KEY;
      else process.env.WAME_API_KEY = prevKey;
      if (prevServer == null) delete process.env.WAME_SERVER_URL;
      else process.env.WAME_SERVER_URL = prevServer;
      if (prevMap == null) delete process.env.WAME_SERVER_BY_INSTANCE;
      else process.env.WAME_SERVER_BY_INSTANCE = prevMap;
    }
  });

  it('não usa key global quando establishmentId está pinado sem mapa', async () => {
    const prevKey = process.env.WAME_API_KEY;
    const prevServer = process.env.WAME_SERVER_URL;
    const prevMap = process.env.WAME_INSTANCE_BY_ESTABLISHMENT;
    process.env.WAME_API_KEY = 'outraCasaKey1';
    process.env.WAME_SERVER_URL = 'https://us.api-wa.me';
    delete process.env.WAME_INSTANCE_BY_ESTABLISHMENT;
    try {
      await assert.rejects(
        () =>
          runWithWame({ enabled: true, establishmentId: 7, instanceId: null }, () =>
            sendText('5511999998888', 'oi')
          ),
        /sem fallback cruzado/i,
      );
    } finally {
      if (prevKey == null) delete process.env.WAME_API_KEY;
      else process.env.WAME_API_KEY = prevKey;
      if (prevServer == null) delete process.env.WAME_SERVER_URL;
      else process.env.WAME_SERVER_URL = prevServer;
      if (prevMap == null) delete process.env.WAME_INSTANCE_BY_ESTABLISHMENT;
      else process.env.WAME_INSTANCE_BY_ESTABLISHMENT = prevMap;
    }
  });

  it('resolve roteamento determinístico por establishment', async () => {
    const prevMap = process.env.WAME_INSTANCE_BY_ESTABLISHMENT;
    const prevServerMap = process.env.WAME_SERVER_BY_INSTANCE;
    process.env.WAME_INSTANCE_BY_ESTABLISHMENT = JSON.stringify({ 7: 'highlineKey1' });
    process.env.WAME_SERVER_BY_INSTANCE = JSON.stringify({
      highlineKey1: 'https://us.api-wa.me',
    });
    try {
      assert.equal(resolveMappedInstanceForEstablishment(7), 'highlineKey1');
      const routing = await resolveWameRouting(null, 7);
      assert.equal(routing.instanceId, 'highlineKey1');
      assert.equal(routing.serverUrl, 'https://us.api-wa.me');
      assert.equal(routing.source, 'env_map');
    } finally {
      if (prevMap == null) delete process.env.WAME_INSTANCE_BY_ESTABLISHMENT;
      else process.env.WAME_INSTANCE_BY_ESTABLISHMENT = prevMap;
      if (prevServerMap == null) delete process.env.WAME_SERVER_BY_INSTANCE;
      else process.env.WAME_SERVER_BY_INSTANCE = prevServerMap;
    }
  });

  it('cita a última mensagem do cliente quando a janela da Meta recusa o texto livre', async () => {
    const prevKey = process.env.WAME_API_KEY;
    const prevServer = process.env.WAME_SERVER_URL;
    const prevMap = process.env.WAME_SERVER_BY_INSTANCE;
    process.env.WAME_API_KEY = 'justinoKey1';
    process.env.WAME_SERVER_URL = 'https://us.api-wa.me';
    process.env.WAME_SERVER_BY_INSTANCE = JSON.stringify({
      justinoKey1: 'https://us.api-wa.me',
    });
    const calls = [];
    const originalFetch = global.fetch;
    global.fetch = async (url, opts) => {
      calls.push({ url: String(url), body: JSON.parse(opts.body) });
      if (String(url).includes('/message/') && String(url).includes('/text') && String(url).includes('wamid')) {
        return {
          ok: false,
          status: 409,
          json: async () => ({ status: 409, message: 'Janela de atendimento de 24h fechada' }),
        };
      }
      return { ok: true, json: async () => ({ status: 200, data: { key: { id: 'out1' } } }) };
    };
    try {
      const result = await runWithWame({ enabled: true, instanceId: 'justinoKey1' }, () =>
        sendText('5511913587834', 'Sim, fica no externo', {
          quotedMessageId: 'wamid.HBgNINBOUND',
        })
      );
      assert.equal(calls[0].url, 'https://us.api-wa.me/justinoKey1/message/wamid.HBgNINBOUND/text');
      assert.equal(calls[0].body.quotedId, 'wamid.HBgNINBOUND');
      assert.equal(result.status, 200);
      // 409 no path quoted → tenta path sem quote no MESMO servidor (não failover)
      assert.equal(calls.length, 2);
      assert.match(calls[1].url, /^https:\/\/us\.api-wa\.me\/justinoKey1\/message\/text$/);
    } finally {
      global.fetch = originalFetch;
      if (prevKey == null) delete process.env.WAME_API_KEY;
      else process.env.WAME_API_KEY = prevKey;
      if (prevServer == null) delete process.env.WAME_SERVER_URL;
      else process.env.WAME_SERVER_URL = prevServer;
      if (prevMap == null) delete process.env.WAME_SERVER_BY_INSTANCE;
      else process.env.WAME_SERVER_BY_INSTANCE = prevMap;
    }
  });
});

describe('wameHouse', () => {
  it('amarra o telefone da Pracinha na casa 8', () => {
    assert.equal(establishmentFromDisplayPhone('551123050938'), 8);
    assert.equal(establishmentFromDisplayPhone('+55 11 2305-0938'), 8);
    assert.equal(establishmentFromDisplayPhone('551152003650'), 1);
    assert.equal(establishmentFromDisplayPhone('+55 11 5200-3650'), 1);
    assert.equal(establishmentFromDisplayPhone('551130322934'), 7);
    assert.equal(establishmentFromDisplayPhone('+55 11 3032-2934'), 7);
    assert.equal(establishmentFromDisplayPhone('551142803345'), 9);
    assert.equal(establishmentFromDisplayPhone('+55 11 4280-3345'), 9);
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
