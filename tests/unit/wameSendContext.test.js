'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { loadWameSendContext } = require('../../services/wame/wameSendContext');
const { sendText } = require('../../services/wame/wameService');
const { runWithWame } = require('../../services/wame/wameContext');

describe('wameSendContext', () => {
  it('usa a instância da casa e cita a última mensagem do cliente', async () => {
    const prevMap = process.env.WAME_INSTANCE_BY_ESTABLISHMENT;
    delete process.env.WAME_INSTANCE_BY_ESTABLISHMENT;
    const pool = {
      query: async () => ({
        rows: [
          {
            direction: 'outbound',
            raw_payload: { instance: 'justinoKey1' },
          },
          {
            direction: 'inbound',
            raw_payload: { wame_message_id: 'wamid.hoje' },
          },
        ],
      }),
    };
    try {
      const ctx = await loadWameSendContext(pool, { conversationId: 10, establishmentId: 1 });
      assert.equal(ctx.instanceId, 'justinoKey1');
      assert.equal(ctx.quotedMessageId, 'wamid.hoje');
      assert.equal(ctx.establishmentId, 1);
    } finally {
      if (prevMap == null) delete process.env.WAME_INSTANCE_BY_ESTABLISHMENT;
      else process.env.WAME_INSTANCE_BY_ESTABLISHMENT = prevMap;
    }
  });

  it('prioriza o mapa explícito da casa sobre o histórico da conversa', async () => {
    const prevMap = process.env.WAME_INSTANCE_BY_ESTABLISHMENT;
    process.env.WAME_INSTANCE_BY_ESTABLISHMENT = JSON.stringify({ 1: 'mappedKey99' });
    const pool = {
      query: async () => ({
        rows: [{ direction: 'outbound', raw_payload: { instance: 'oldKeyFromChat' } }],
      }),
    };
    try {
      const ctx = await loadWameSendContext(pool, { conversationId: 10, establishmentId: 1 });
      assert.equal(ctx.instanceId, 'mappedKey99');
      assert.equal(ctx.source, 'env_map');
    } finally {
      if (prevMap == null) delete process.env.WAME_INSTANCE_BY_ESTABLISHMENT;
      else process.env.WAME_INSTANCE_BY_ESTABLISHMENT = prevMap;
    }
  });

  it('envia citando o id que veio no contexto da conversa', async () => {
    const prevKey = process.env.WAME_API_KEY;
    const prevServer = process.env.WAME_SERVER_URL;
    process.env.WAME_API_KEY = 'justinoKey1';
    process.env.WAME_SERVER_URL = 'https://us.api-wa.me';
    const calls = [];
    const originalFetch = global.fetch;
    global.fetch = async (url) => {
      calls.push(String(url));
      return { ok: true, json: async () => ({ status: 200 }) };
    };
    try {
      await runWithWame(
        { enabled: true, instanceId: 'justinoKey1', quotedMessageId: 'wamid.cliente' },
        () => sendText('5511913587834', 'ok')
      );
      assert.equal(calls[0], 'https://us.api-wa.me/justinoKey1/message/wamid.cliente/text');
    } finally {
      global.fetch = originalFetch;
      if (prevKey == null) delete process.env.WAME_API_KEY;
      else process.env.WAME_API_KEY = prevKey;
      if (prevServer == null) delete process.env.WAME_SERVER_URL;
      else process.env.WAME_SERVER_URL = prevServer;
    }
  });
});
