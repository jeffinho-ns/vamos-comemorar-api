'use strict';

const express = require('express');
const { withConversationLock } = require('../services/conversationLock');
const messageDedup = require('../services/whatsappMessageDedupRepository');
const { processInboundTurn } = require('../services/conversationEngine/processInboundTurn');
const { isQueueEnabled } = require('../infrastructure/queue/redisConnection');
const { getWameWebhookToken, isWameConfigured } = require('../services/wame/wameConfig');
const { runWithWame } = require('../services/wame/wameContext');
const { resolveWameEstablishmentId } = require('../services/wame/wameHouse');

function firstChange(payload) {
  return payload?.entry?.[0]?.changes?.[0] || null;
}

function extractMessageText(payload) {
  const value = firstChange(payload)?.value;
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
  const value = firstChange(payload)?.value;
  const firstMessage = value?.messages?.[0];
  const firstContact = value?.contacts?.[0];
  return firstMessage?.from || firstContact?.wa_id || null;
}

function extractMessageId(payload) {
  const firstMessage = firstChange(payload)?.value?.messages?.[0];
  return firstMessage?.id ? String(firstMessage.id) : null;
}

function extractPhoneNumberId(payload) {
  return (
    firstChange(payload)?.value?.metadata?.phone_number_id ||
    payload?.instance ||
    payload?.entry?.[0]?.id ||
    null
  );
}

function isStatusOnly(payload) {
  const change = firstChange(payload);
  const value = change?.value;
  if (!value) return false;
  if (Array.isArray(value.statuses) && value.statuses.length > 0 && !value.messages?.length) {
    return true;
  }
  return String(change?.field || '') === 'presence' || String(change?.field || '') === 'connection';
}

function isFromMe(payload) {
  const msg = firstChange(payload)?.value?.messages?.[0];
  if (!msg) return false;
  return msg.from_me === true || msg.fromMe === true;
}

function authorizeWebhook(req) {
  const expected = getWameWebhookToken();
  if (!expected) return true;
  const header = String(req.headers.authorization || '');
  if (header.toLowerCase().startsWith('bearer ') && header.slice(7).trim() === expected) {
    return true;
  }
  const queryToken = String(req.query?.token || req.query?.webhook_token || '').trim();
  return queryToken === expected;
}

function digitsOnly(value) {
  return String(value || '').replace(/\D/g, '');
}

module.exports = (pool, app) => {
  const router = express.Router();

  router.get('/', (_req, res) => {
    return res.status(200).json({
      ok: true,
      provider: 'wame',
      configured: isWameConfigured(),
    });
  });

  router.post('/', async (req, res) => {
    if (!authorizeWebhook(req)) {
      console.warn('[Wame webhook] token inválido');
      return res.status(403).send('Forbidden');
    }

    const payload = req.body;
    if (!payload || (typeof payload === 'object' && Object.keys(payload).length === 0)) {
      return res.sendStatus(200);
    }

    if (String(payload.provider || 'whatsapp').toLowerCase() === 'instagram') {
      return res.sendStatus(200);
    }

    if (isStatusOnly(payload)) {
      const field = String(firstChange(payload)?.field || '');
      if (field === 'connection') {
        try {
          const {
            observeConnectionEvent,
            detectIntegrationTypeFromPayload,
          } = require('../services/wame/wameCoexistenceGuard');
          const establishmentId = await resolveWameEstablishmentId(pool, payload);
          observeConnectionEvent({
            establishmentId,
            payload,
            integrationType: detectIntegrationTypeFromPayload(payload),
          });
        } catch (error) {
          console.warn('[Wame webhook] falha ao auditar connection:', error.message);
        }
      }
      return res.sendStatus(200);
    }

    if (isFromMe(payload) || String(firstChange(payload)?.field || '') === 'smb_message_echoes') {
      try {
        const { persistPhoneReply } = require('../services/wame/wamePhoneReply');
        await persistPhoneReply(pool, app, payload);
      } catch (error) {
        console.error('[Wame webhook] resposta do celular não gravada:', error.message);
      }
      return res.sendStatus(200);
    }

    const field = String(firstChange(payload)?.field || '');
    if (field === 'history') {
      try {
        const { persistHistoryPayload } = require('../services/wame/wameCoexistenceHistory');
        await persistHistoryPayload(pool, payload);
      } catch (error) {
        console.error('[Wame webhook] histórico de coexistência não gravado:', error.message);
      }
      return res.sendStatus(200);
    }

    if (field === 'smb_app_state_sync') {
      console.log('[Wame webhook] sync de contatos recebido (smb_app_state_sync)');
      return res.sendStatus(200);
    }

    if (field && field !== 'messages') {
      return res.sendStatus(200);
    }

    const incomingMessageText = extractMessageText(payload);
    const customerWaId = digitsOnly(extractSenderNumber(payload));
    const instanceId = extractPhoneNumberId(payload);
    const wamid = extractMessageId(payload);

    if (!incomingMessageText || !customerWaId) {
      return res.sendStatus(200);
    }

    const waId = customerWaId;
    const hintedEstablishmentId = await resolveWameEstablishmentId(pool, payload);

    try {
      const dedupResult = await messageDedup.claimInboundMessage(pool, wamid, waId);
      if (dedupResult.duplicate) {
        console.log('[Wame webhook] wamid duplicado ignorado:', wamid);
        return res.sendStatus(200);
      }
    } catch (dedupError) {
      console.warn('[Wame webhook] deduplicação indisponível:', dedupError.message);
    }

    const wameCtx = {
      enabled: true,
      instanceId: instanceId ? String(instanceId) : null,
      quotedMessageId: wamid || null,
      establishmentId: Number.isFinite(hintedEstablishmentId) ? hintedEstablishmentId : null,
    };
    if (instanceId && /[a-z]/i.test(String(instanceId)) && Number.isFinite(hintedEstablishmentId)) {
      const { rememberEstablishmentInstance } = require('../services/wame/wameService');
      rememberEstablishmentInstance(hintedEstablishmentId, instanceId);
    }

    try {
      if (isQueueEnabled() && process.env.BULLMQ_WEBHOOK_INLINE !== 'true') {
        // Fila legada ainda não carrega contexto Wame; processa inline na ponte.
        console.warn('[Wame webhook] processando inline (contexto Wame não enfileirado)');
      }

      const startedAt = Date.now();
      await runWithWame(wameCtx, () =>
        withConversationLock(pool, waId, async () => {
          await processInboundTurn({
            pool,
            app,
            payload,
            incomingMessageText,
            waId,
            hintedEstablishmentId: Number.isFinite(hintedEstablishmentId) ? hintedEstablishmentId : null,
            pinnedEstablishmentId: Number.isFinite(hintedEstablishmentId) ? hintedEstablishmentId : null,
          });
        }),
      );
      console.log(
        `[Wame webhook] turno concluído waId=${waId} wamid=${wamid || 'sem-id'} instance=${instanceId || 'n/a'} ms=${Date.now() - startedAt}`,
      );
    } catch (error) {
      console.error('[Wame webhook] erro no turno:', error.message);
    }

    return res.sendStatus(200);
  });

  return router;
};
