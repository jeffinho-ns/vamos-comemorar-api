const express = require('express');
const { withConversationLock } = require('../services/conversationLock');
const messageDedup = require('../services/whatsappMessageDedupRepository');
const { processInboundTurn } = require('../services/conversationEngine/processInboundTurn');
const { enqueueInboundTurn } = require('../infrastructure/queue/producers');
const { isQueueEnabled } = require('../infrastructure/queue/redisConnection');

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

function extractMessageId(payload) {
  const entry = payload?.entry?.[0];
  const change = entry?.changes?.[0];
  const value = change?.value;
  const firstMessage = value?.messages?.[0];
  return firstMessage?.id ? String(firstMessage.id) : null;
}

module.exports = (pool, app) => {
  const router = express.Router();

  router.get('/', (req, res) => {
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

    return res.status(403).send('Forbidden');
  });

  router.post('/', async (req, res) => {
    const payload = req.body;
    if (!payload || (typeof payload === 'object' && Object.keys(payload).length === 0)) {
      return res.sendStatus(200);
    }

    const incomingMessageText = extractMessageText(payload);
    const waId = extractSenderNumber(payload);
    const wamid = extractMessageId(payload);

    if (!incomingMessageText || !waId) {
      return res.sendStatus(200);
    }

    try {
      const dedupResult = await messageDedup.claimInboundMessage(pool, wamid, waId);
      if (dedupResult.duplicate) {
        console.log('[WhatsApp webhook] wamid duplicado ignorado:', wamid);
        return res.sendStatus(200);
      }
    } catch (dedupError) {
      console.warn('[WhatsApp webhook] deduplicação indisponível:', dedupError.message);
    }

    try {
      if (isQueueEnabled() && process.env.BULLMQ_WEBHOOK_INLINE !== 'true') {
        const enqueueResult = await enqueueInboundTurn({
          waId,
          wamid,
          payload,
          incomingMessageText,
        });
        if (enqueueResult.enqueued) {
          console.log(
            `[WhatsApp webhook] turno enfileirado waId=${waId} wamid=${wamid || 'sem-id'} job=${enqueueResult.jobId}`
          );
          return res.sendStatus(200);
        }
        console.warn(
          `[WhatsApp webhook] fila indisponível; processando inline waId=${waId} wamid=${wamid || 'sem-id'} motivo=${enqueueResult.reason || 'desconhecido'}`
        );
      }

      const startedAt = Date.now();
      await withConversationLock(pool, waId, async () => {
        await processInboundTurn({
          pool,
          app,
          payload,
          incomingMessageText,
          waId,
        });
      });
      console.log(
        `[WhatsApp webhook] turno inline concluído waId=${waId} wamid=${wamid || 'sem-id'} ms=${Date.now() - startedAt}`
      );
    } catch (lockError) {
      console.error('[WhatsApp webhook] erro no lock/fila da conversa:', lockError.message);
    }

    return res.sendStatus(200);
  });

  return router;
};
