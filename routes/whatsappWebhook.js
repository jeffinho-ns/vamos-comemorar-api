const express = require('express');
const { interpretMessage } = require('../services/aiService');
const { sendMessage } = require('../services/whatsappService');
const inbox = require('../services/whatsappInboxRepository');

function extractMessageText(payload) {
  const entry = payload?.entry?.[0];
  const change = entry?.changes?.[0];
  const value = change?.value;
  const firstMessage = value?.messages?.[0];

  if (!firstMessage) return null;

  if (firstMessage?.text?.body) return firstMessage.text.body;
  if (firstMessage?.button?.text) return firstMessage.button.text;
  if (firstMessage?.interactive?.button_reply?.title) {
    return firstMessage.interactive.button_reply.title;
  }
  if (firstMessage?.interactive?.list_reply?.title) {
    return firstMessage.interactive.list_reply.title;
  }

  return null;
}

function extractSenderNumber(payload) {
  const entry = payload?.entry?.[0];
  const change = entry?.changes?.[0];
  const value = change?.value;
  const firstMessage = value?.messages?.[0];
  const firstContact = value?.contacts?.[0];

  return firstMessage?.from || firstContact?.wa_id || null;
}

function extractContactName(payload) {
  const entry = payload?.entry?.[0];
  const change = entry?.changes?.[0];
  const value = change?.value;
  return value?.contacts?.[0]?.profile?.name || null;
}

function mapRowsToOpenAIHistory(rows) {
  return (rows || []).map((r) => ({
    role: r.direction === 'outbound' ? 'assistant' : 'user',
    content: r.body,
  }));
}

function emitInbox(app, payload) {
  const io = app?.get?.('socketio');
  if (io) {
    io.to('whatsapp_inbox').emit('whatsapp_inbox_update', payload);
  }
}

module.exports = (pool, app) => {
  const router = express.Router();

  /**
   * Webhook da API oficial do WhatsApp (Meta).
   * GET: validação do endpoint.
   * POST: recebimento de eventos (mensagens/status).
   */
  router.get('/', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;

    if (!verifyToken) {
      console.error('[WhatsApp webhook] WHATSAPP_VERIFY_TOKEN não definido no ambiente.');
      return res.status(500).send('Internal configuration error');
    }

    if (token === verifyToken && challenge) {
      return res.status(200).type('text/plain').send(challenge);
    }

    console.warn('[WhatsApp webhook] Verificação GET recusada', {
      hub_mode: mode,
      has_verify_token: Boolean(token),
      has_challenge: Boolean(challenge),
    });
    return res.status(403).send('Forbidden');
  });

  router.post('/', async (req, res) => {
    const payload = req.body;

    if (!payload || (typeof payload === 'object' && Object.keys(payload).length === 0)) {
      console.warn('[WhatsApp webhook] POST recebido sem corpo.');
      return res.sendStatus(200);
    }

    console.log('[WhatsApp webhook] payload:', JSON.stringify(payload, null, 2));
    const messageText = extractMessageText(payload);
    const senderNumber = extractSenderNumber(payload);

    if (!messageText) {
      console.log('[WhatsApp webhook] Nenhuma mensagem de texto encontrada no payload.');
      return res.sendStatus(200);
    }

    if (!senderNumber) {
      console.warn('[WhatsApp webhook] Remetente ausente; não é possível responder ou persistir.');
      return res.sendStatus(200);
    }

    let conversation = null;
    let inboundRow = null;
    let usedPersistence = false;

    try {
      conversation = await inbox.upsertConversation(pool, {
        waId: senderNumber,
        contactName: extractContactName(payload),
      });
      inboundRow = await inbox.insertMessage(pool, {
        conversationId: conversation.id,
        direction: 'inbound',
        body: messageText,
        rawPayload: payload,
      });
      usedPersistence = true;
    } catch (err) {
      console.error('[WhatsApp webhook] persistência indisponível (rode a migration?):', err.message);
    }

    emitInbox(app, {
      type: 'inbound',
      wa_id: senderNumber,
      conversation,
      message: inboundRow,
      body: messageText,
    });

    const humanActive = usedPersistence
      ? await inbox.isHumanTakeoverActive(pool, senderNumber)
      : false;

    if (humanActive) {
      console.log('[WhatsApp webhook] Handoff humano ativo — IA não responde automaticamente.');
      return res.sendStatus(200);
    }

    let messageHistory = [{ role: 'user', content: messageText }];
    if (usedPersistence && conversation) {
      try {
        const recent = await inbox.getRecentMessagesForContext(pool, conversation.id, 5);
        messageHistory = mapRowsToOpenAIHistory(recent);
      } catch (e) {
        console.warn('[WhatsApp webhook] falha ao montar histórico:', e.message);
      }
    }

    try {
      const interpreted = await interpretMessage({ messageHistory });
      console.log('[WhatsApp webhook] interpretação IA:', interpreted);

      if (usedPersistence && inboundRow?.id) {
        try {
          await inbox.updateInboundAiFields(pool, inboundRow.id, {
            intent: interpreted.intent,
            suggestedReply: interpreted.suggested_reply,
          });
        } catch (e) {
          console.warn('[WhatsApp webhook] não foi possível salvar intent/sugestão:', e.message);
        }
      }

      emitInbox(app, {
        type: 'interpreted',
        wa_id: senderNumber,
        conversation,
        messageId: inboundRow?.id,
        intent: interpreted.intent,
        suggested_reply: interpreted.suggested_reply,
      });

      if (interpreted.intent === 'falar_com_humano' && interpreted.suggested_reply) {
        const sendResult = await sendMessage(senderNumber, interpreted.suggested_reply);
        console.log('[WhatsApp webhook] envio automático (handoff):', sendResult);

        if (usedPersistence && conversation) {
          try {
            const saved = await inbox.insertMessage(pool, {
              conversationId: conversation.id,
              direction: 'outbound',
              body: interpreted.suggested_reply,
              intent: 'falar_com_humano',
              suggestedReply: null,
              rawPayload: sendResult || null,
            });
            emitInbox(app, {
              type: 'outbound',
              wa_id: senderNumber,
              conversation: await inbox.getConversationByWaId(pool, senderNumber),
              message: saved,
            });
          } catch (e) {
            console.warn('[WhatsApp webhook] falha ao gravar outbound handoff:', e.message);
          }
        }
      }
    } catch (error) {
      console.error('[WhatsApp webhook] erro ao processar mensagem (IA/envio):', error.message);
    }

    return res.sendStatus(200);
  });

  return router;
};
