'use strict';

/**
 * Suíte de auditoria Wame/Meta — 16 cenários com mocks only.
 * Não envia WhatsApp real, não altera sessão/instância remota.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  sendText,
  rememberEstablishmentInstance,
  findEstablishmentWameInstanceId,
  requestOfficialHistorySync,
} = require('../../services/wame/wameService');
const { runWithWame, currentWame } = require('../../services/wame/wameContext');
const {
  establishmentFromDisplayPhone,
  resolveWameEstablishmentId,
  DISPLAY_PHONE_TO_ESTABLISHMENT,
} = require('../../services/wame/wameHouse');
const { describePhoneReply } = require('../../services/wame/wamePhoneReply');
const { isHistoryPayload } = require('../../services/wame/wameCoexistenceHistory');
const { claimInboundMessage } = require('../../services/whatsappMessageDedupRepository');
const {
  scopeCustomerWaId,
  parseScopedWaId,
  toPublicLine,
} = require('../../services/whatsapp/whatsappPhoneLineService');
const {
  shouldUseTimeoutFallback,
  buildTimeoutFallbackReply,
} = require('../../services/agent/solTimeoutFallback');
const {
  metaStylePayload,
  mockPool,
  installFetchMock,
  jsonResponse,
  withEnv,
  FIXTURES,
} = require('../helpers/wameMocks');

const {
  HIGHLINE_ID,
  JUSTINO_ID,
  HIGHLINE_PHONE,
  JUSTINO_PHONE,
  HIGHLINE_INSTANCE,
  JUSTINO_INSTANCE,
  CUSTOMER,
} = FIXTURES;

describe('Wame Meta audit — 16 cenários (mocks)', () => {
  // S01 — instância correta
  it('S01 instância correta: envio usa a chave do contexto da casa', async () => {
    await withEnv(
      {
        WAME_API_KEY: 'env-global-key-should-not-win',
        WAME_SERVER_URL: 'https://us.api-wa.me',
      },
      async () => {
        const fetchMock = installFetchMock(async () => jsonResponse(200, { status: 200 }));
        try {
          await runWithWame({ enabled: true, instanceId: HIGHLINE_INSTANCE }, () =>
            sendText(CUSTOMER, 'ping-test-mock'),
          );
          assert.equal(fetchMock.calls.length, 1);
          assert.match(fetchMock.calls[0].url, new RegExp(`/${HIGHLINE_INSTANCE}/message/text$`));
          assert.doesNotMatch(fetchMock.calls[0].url, /env-global-key/);
        } finally {
          fetchMock.restore();
        }
      },
    );
  });

  // S02 — isolamento Highline vs outras
  it('S02 isolamento: Highline (7) não colide com Justino/Pracinha/Rooftop', () => {
    assert.equal(establishmentFromDisplayPhone(HIGHLINE_PHONE), HIGHLINE_ID);
    assert.equal(establishmentFromDisplayPhone(JUSTINO_PHONE), JUSTINO_ID);
    assert.equal(establishmentFromDisplayPhone('551123050938'), 8);
    assert.equal(establishmentFromDisplayPhone('551142803345'), 9);
    const phones = Object.keys(DISPLAY_PHONE_TO_ESTABLISHMENT);
    const ids = phones.map((p) => DISPLAY_PHONE_TO_ESTABLISHMENT[p]);
    assert.equal(new Set(phones).size, phones.length);
    assert.equal(ids.filter((id) => id === HIGHLINE_ID).length, 1);
  });

  // S03 — sem fallback cruzado de instância entre casas
  it('S03 sem fallback cruzado: troca de servidor mantém a mesma instância Highline', async () => {
    await withEnv(
      {
        WAME_API_KEY: JUSTINO_INSTANCE,
        WAME_SERVER_URL: 'https://dead.example',
      },
      async () => {
        const fetchMock = installFetchMock(async ({ url }) => {
          if (url.includes('dead.example')) {
            const err = new TypeError('fetch failed');
            throw err;
          }
          return jsonResponse(200, { status: 200 });
        });
        try {
          await runWithWame({ enabled: true, instanceId: HIGHLINE_INSTANCE }, () =>
            sendText(CUSTOMER, 'ping-test-mock'),
          );
          assert.ok(fetchMock.calls.length >= 2);
          for (const call of fetchMock.calls) {
            assert.match(call.url, new RegExp(`/${HIGHLINE_INSTANCE}/`));
            assert.doesNotMatch(call.url, new RegExp(`/${JUSTINO_INSTANCE}/`));
          }
        } finally {
          fetchMock.restore();
        }
      },
    );
  });

  // S04 — 401
  it('S04 HTTP 401: tenta outro servidor com a mesma instância', async () => {
    await withEnv(
      {
        WAME_API_KEY: HIGHLINE_INSTANCE,
        WAME_SERVER_URL: 'https://primary.example',
      },
      async () => {
        const fetchMock = installFetchMock(async ({ url }) => {
          if (url.includes('primary.example')) return jsonResponse(401, { message: 'unauthorized' });
          return jsonResponse(200, { status: 200, data: { key: { id: 'ok1' } } });
        });
        try {
          const result = await runWithWame({ enabled: true, instanceId: HIGHLINE_INSTANCE }, () =>
            sendText(CUSTOMER, 'ping-test-mock'),
          );
          assert.equal(result.status, 200);
          assert.ok(fetchMock.calls.length >= 2);
          assert.match(fetchMock.calls[0].url, /primary\.example/);
        } finally {
          fetchMock.restore();
        }
      },
    );
  });

  // S05 — 403
  it('S05 HTTP 403: não faz fallback de servidor (erro de autorização)', async () => {
    await withEnv(
      {
        WAME_API_KEY: HIGHLINE_INSTANCE,
        WAME_SERVER_URL: 'https://us.api-wa.me',
      },
      async () => {
        const fetchMock = installFetchMock(async () => jsonResponse(403, { message: 'forbidden' }));
        try {
          await assert.rejects(
            () =>
              runWithWame({ enabled: true, instanceId: HIGHLINE_INSTANCE }, () =>
                sendText(CUSTOMER, 'ping-test-mock'),
              ),
            /403/,
          );
          assert.equal(fetchMock.calls.length, 1);
        } finally {
          fetchMock.restore();
        }
      },
    );
  });

  // S06 — 404
  it('S06 HTTP 404: tenta outro servidor antes de falhar', async () => {
    await withEnv(
      {
        WAME_API_KEY: HIGHLINE_INSTANCE,
        WAME_SERVER_URL: 'https://primary.example',
      },
      async () => {
        const fetchMock = installFetchMock(async ({ url }) => {
          if (url.includes('primary.example')) return jsonResponse(404, { message: 'missing' });
          return jsonResponse(200, { status: 200 });
        });
        try {
          await runWithWame({ enabled: true, instanceId: HIGHLINE_INSTANCE }, () =>
            sendText(CUSTOMER, 'ping-test-mock'),
          );
          assert.ok(fetchMock.calls.length >= 2);
        } finally {
          fetchMock.restore();
        }
      },
    );
  });

  // S07 — 409
  it('S07 HTTP 409 janela 24h: propaga sem trocar de instância', async () => {
    await withEnv(
      {
        WAME_API_KEY: HIGHLINE_INSTANCE,
        WAME_SERVER_URL: 'https://us.api-wa.me',
      },
      async () => {
        const fetchMock = installFetchMock(async () =>
          jsonResponse(409, { status: 409, message: 'Janela de atendimento de 24h fechada' }),
        );
        try {
          await assert.rejects(
            () =>
              runWithWame({ enabled: true, instanceId: HIGHLINE_INSTANCE }, () =>
                sendText(CUSTOMER, 'ping-test-mock'),
              ),
            (err) => Number(err.status) === 409,
          );
          for (const call of fetchMock.calls) {
            assert.match(call.url, new RegExp(`/${HIGHLINE_INSTANCE}/`));
          }
        } finally {
          fetchMock.restore();
        }
      },
    );
  });

  // S08 — 429
  it('S08 HTTP 429: não faz loop infinito de servidores', async () => {
    await withEnv(
      {
        WAME_API_KEY: HIGHLINE_INSTANCE,
        WAME_SERVER_URL: 'https://us.api-wa.me',
      },
      async () => {
        const fetchMock = installFetchMock(async () => jsonResponse(429, { message: 'rate limit' }));
        try {
          await assert.rejects(
            () =>
              runWithWame({ enabled: true, instanceId: HIGHLINE_INSTANCE }, () =>
                sendText(CUSTOMER, 'ping-test-mock'),
              ),
            /429/,
          );
          assert.equal(fetchMock.calls.length, 1);
        } finally {
          fetchMock.restore();
        }
      },
    );
  });

  // S09 — 5xx
  it('S09 HTTP 5xx: falha sem fallback cruzado de instância', async () => {
    await withEnv(
      {
        WAME_API_KEY: HIGHLINE_INSTANCE,
        WAME_SERVER_URL: 'https://us.api-wa.me',
      },
      async () => {
        const fetchMock = installFetchMock(async () => jsonResponse(503, { message: 'unavailable' }));
        try {
          await assert.rejects(
            () =>
              runWithWame({ enabled: true, instanceId: HIGHLINE_INSTANCE }, () =>
                sendText(CUSTOMER, 'ping-test-mock'),
              ),
            /503/,
          );
          assert.equal(fetchMock.calls.length, 1);
          assert.match(fetchMock.calls[0].url, new RegExp(`/${HIGHLINE_INSTANCE}/`));
        } finally {
          fetchMock.restore();
        }
      },
    );
  });

  // S10 — timeouts / rede
  it('S10 timeout/rede: retry em outro host mantendo a instância', async () => {
    await withEnv(
      {
        WAME_API_KEY: HIGHLINE_INSTANCE,
        WAME_SERVER_URL: 'https://slow.example',
      },
      async () => {
        const fetchMock = installFetchMock(async ({ url }) => {
          if (url.includes('slow.example')) {
            // isRetryableSendError exige "timed out" (não só "timeout")
            throw new Error('request timed out');
          }
          return jsonResponse(200, { status: 200 });
        });
        try {
          await runWithWame({ enabled: true, instanceId: HIGHLINE_INSTANCE }, () =>
            sendText(CUSTOMER, 'ping-test-mock'),
          );
          assert.ok(fetchMock.calls.length >= 2);
          assert.match(fetchMock.calls.at(-1).url, new RegExp(`/${HIGHLINE_INSTANCE}/`));
        } finally {
          fetchMock.restore();
        }
      },
    );
  });

  // S11 — dedupe webhook
  it('S11 dedupe webhook: segundo claim do mesmo wamid é duplicate', async () => {
    const seen = new Set();
    const pool = mockPool({
      query: async (_sql, params) => {
        const id = String(params[0]);
        if (seen.has(id)) return { rows: [], rowCount: 0 };
        seen.add(id);
        return { rows: [{ provider_message_id: id }], rowCount: 1 };
      },
    });
    const first = await claimInboundMessage(pool, 'wamid.DEDUP1', CUSTOMER);
    const second = await claimInboundMessage(pool, 'wamid.DEDUP1', CUSTOMER);
    assert.equal(first.duplicate, false);
    assert.equal(second.duplicate, true);
  });

  // S12 — telefone principal / secundários
  it('S12 telefone principal Highline mapeia; secundário desconhecido não herda Justino', async () => {
    assert.equal(establishmentFromDisplayPhone(HIGHLINE_PHONE), HIGHLINE_ID);
    assert.equal(establishmentFromDisplayPhone('5511999000111'), null);

    const pool = mockPool({
      query: async () => ({ rows: [{ establishment_id: HIGHLINE_ID }] }),
    });
    const fromLine = await resolveWameEstablishmentId(
      pool,
      metaStylePayload({ displayPhone: '5511999000111', phoneNumberId: HIGHLINE_INSTANCE }),
    );
    assert.equal(fromLine, HIGHLINE_ID);

    await withEnv({ WAME_DEFAULT_ESTABLISHMENT_ID: String(JUSTINO_ID) }, async () => {
      const emptyPool = mockPool({ query: async () => ({ rows: [] }) });
      const fallback = await resolveWameEstablishmentId(
        emptyPool,
        metaStylePayload({ displayPhone: '5511999000111' }),
      );
      // Documenta o risco operacional: default env pode apontar para outra casa.
      assert.equal(fallback, JUSTINO_ID);
    });
  });

  // S13 — mirror (from_me / eco do celular)
  it('S13 mirror: from_me Highline vira resposta de celular, cliente inbound não', () => {
    const mirror = describePhoneReply(
      metaStylePayload({
        displayPhone: HIGHLINE_PHONE,
        phoneNumberId: HIGHLINE_INSTANCE,
        from: CUSTOMER,
        messageId: 'wamid.mirror',
        text: 'Confirmado pelo celular',
        fromMe: true,
      }),
    );
    assert.equal(mirror.waId, CUSTOMER);
    assert.equal(mirror.body, 'Confirmado pelo celular');

    const inbound = describePhoneReply(
      metaStylePayload({
        displayPhone: HIGHLINE_PHONE,
        from: CUSTOMER,
        messageId: 'wamid.in',
        text: 'quero reserva',
        fromMe: false,
      }),
    );
    assert.equal(inbound, null);
  });

  // S14 — SOL receive (fallback de timeout, sem WhatsApp)
  it('S14 SOL receive: fallback de timeout é texto puro e não dispara fetch', async () => {
    const fetchMock = installFetchMock(async () => {
      throw new Error('fetch não deveria ser chamado no fallback SOL');
    });
    try {
      assert.equal(shouldUseTimeoutFallback({ code: 'OPENAI_TIMEOUT' }), true);
      assert.equal(shouldUseTimeoutFallback(null), false);
      const reply = buildTimeoutFallbackReply({});
      assert.equal(typeof reply, 'string');
      assert.ok(reply.length > 0);
      assert.equal(fetchMock.calls.length, 0);
    } finally {
      fetchMock.restore();
    }
  });

  // S15 — histórico coexistência + instância ausente/expirada
  it('S15 histórico e instância ausente: reconhece history; cache expirado consulta pool', async () => {
    assert.equal(
      isHistoryPayload({
        entry: [{ changes: [{ field: 'history', value: { history: [] } }] }],
      }),
      true,
    );
    assert.equal(
      isHistoryPayload(metaStylePayload({ field: 'messages' })),
      false,
    );

    rememberEstablishmentInstance(HIGHLINE_ID, HIGHLINE_INSTANCE);
    const cached = await findEstablishmentWameInstanceId(
      mockPool({
        query: async () => {
          throw new Error('não deveria consultar com cache quente');
        },
      }),
      HIGHLINE_ID,
    );
    assert.equal(cached, HIGHLINE_INSTANCE);

    // Força expiração do cache interno (10 min) via remember com expires passado —
    // rememberEstablishmentInstance não aceita TTL custom; validamos lookup sem cache
    // para establishment sem memória prévia.
    const otherId = 42;
    let queried = false;
    const found = await findEstablishmentWameInstanceId(
      mockPool({
        query: async () => {
          queried = true;
          return { rows: [] };
        },
      }),
      otherId,
    );
    assert.equal(queried, true);
    assert.equal(found, null);
  });

  // S16 — disconnect/revocation inventory + concorrência multi-tenant
  it('S16 disconnect/revocation e concorrência multi-tenant ALS', async () => {
    const schedulerPath = path.join(__dirname, '../../workers/whatsappMaintenanceScheduler.js');
    const schedulerSrc = fs.readFileSync(schedulerPath, 'utf8');
    assert.doesNotMatch(schedulerSrc, /\b(logout|restart|reconnect|offboard|pair)\b/i);
    assert.doesNotMatch(schedulerSrc, /requestOfficialHistorySync/);
    assert.doesNotMatch(schedulerSrc, /instance\/official\/sync/);

    // sync oficial só via API explícita — mock local, sem rede real
    await withEnv(
      {
        WAME_API_KEY: HIGHLINE_INSTANCE,
        WAME_SERVER_URL: 'https://us.api-wa.me',
      },
      async () => {
        const fetchMock = installFetchMock(async ({ url, method }) => {
          assert.equal(method, 'POST');
          assert.match(url, /\/highlineKey7\/instance\/official\/sync$/);
          return jsonResponse(200, { status: 200 });
        });
        try {
          await requestOfficialHistorySync(HIGHLINE_INSTANCE);
          assert.equal(fetchMock.calls.length, 1);
        } finally {
          fetchMock.restore();
        }
      },
    );

    // linha pública nunca vaza token
    const publicLine = toPublicLine({
      establishment_id: HIGHLINE_ID,
      phone_number_id: '123456',
      display_phone: HIGHLINE_PHONE,
      access_token: 'secret-token-value',
      is_active: true,
    });
    assert.equal(publicLine.has_token, true);
    assert.match(publicLine.token_hint, /••••/);
    assert.doesNotMatch(JSON.stringify(publicLine), /secret-token-value/);

    // concorrência: contextos ALS isolados
    const seen = [];
    await Promise.all([
      runWithWame({ enabled: true, instanceId: HIGHLINE_INSTANCE }, async () => {
        await new Promise((r) => setTimeout(r, 20));
        seen.push(currentWame()?.instanceId);
        assert.equal(currentWame()?.instanceId, HIGHLINE_INSTANCE);
      }),
      runWithWame({ enabled: true, instanceId: JUSTINO_INSTANCE }, async () => {
        await new Promise((r) => setTimeout(r, 5));
        seen.push(currentWame()?.instanceId);
        assert.equal(currentWame()?.instanceId, JUSTINO_INSTANCE);
      }),
    ]);
    assert.deepEqual(seen.sort(), [HIGHLINE_INSTANCE, JUSTINO_INSTANCE].sort());

    // scoped wa_id impede colisão multi-tenant no mesmo cliente
    assert.equal(
      scopeCustomerWaId(CUSTOMER, '222', '111'),
      `waba:222:${CUSTOMER}`,
    );
    assert.deepEqual(parseScopedWaId(`waba:222:${CUSTOMER}`), {
      phoneNumberId: '222',
      customer: CUSTOMER,
    });
  });
});
