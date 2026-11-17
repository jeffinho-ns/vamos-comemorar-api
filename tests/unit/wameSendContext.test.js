'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { loadWameSendContext } = require('../../services/wame/wameSendContext');
const { sendText } = require('../../services/wame/wameService');
const { runWithWame } = require('../../services/wame/wameContext');

describe('wameSendContext', () => {
  it('usa a instância da casa e cita a última mensagem do cliente', async () => {
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
    const ctx = await loadWameSendContext(pool, { conversationId: 10, establishmentId: 1 });
    assert.equal(ctx.instanceId, 'justinoKey1');
    assert.equal(ctx.quotedMessageId, 'wamid.hoje');
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
