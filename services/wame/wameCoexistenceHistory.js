'use strict';

/**
 * Histórico de coexistência Meta (field=history).
 * A Meta só envia depois de POST /instance/official/sync (até 180 dias, 1x / 24h do onboarding).
 * Não dispara a Sol — só espelha no painel.
 */

const inbox = require('../whatsappInboxRepository');
const {
  normalizeDisplayPhone,
  isHouseDisplayPhone,
  resolveWameEstablishmentId,
  displayPhoneFromPayload,
} = require('./wameHouse');
const { messageBody, messageTimestamp } = require('./wameHistoryImport');

function firstChange(payload) {
  return payload?.entry?.[0]?.changes?.[0] || null;
}

function isHistoryPayload(payload) {
  return String(firstChange(payload)?.field || '') === 'history';
}

function historyChunks(payload) {
  const value = firstChange(payload)?.value;
  return Array.isArray(value?.history) ? value.history : [];
}

function messageIsFromBusiness(message, housePhone) {
  if (message?.history_context?.from_me === true) return true;
  if (message?.from_me === true || message?.fromMe === true) return true;
  const from = normalizeDisplayPhone(message?.from);
  if (housePhone && from && from === housePhone) return true;
  if (from && isHouseDisplayPhone(from)) return true;
  return false;
}

function customerPhoneFromThread(thread, housePhone) {
  const candidates = [
    thread?.id,
    thread?.context?.wa_id,
    thread?.messages?.[0]?.from,
  ];
  for (const candidate of candidates) {
    const digits = normalizeDisplayPhone(candidate);
    if (digits.length >= 12 && digits !== housePhone && !isHouseDisplayPhone(digits)) {
      return digits;
    }
  }
  return null;
}

async function persistHistoryPayload(pool, payload) {
  if (!isHistoryPayload(payload)) return { ok: false, reason: 'not_history' };

  const establishmentId = await resolveWameEstablishmentId(pool, payload);
  if (!establishmentId) {
    console.warn('[Wame history] casa não resolvida para o payload de histórico');
    return { ok: false, reason: 'no_establishment' };
  }

  const housePhone = normalizeDisplayPhone(displayPhoneFromPayload(payload));
  const instanceId =
    firstChange(payload)?.value?.metadata?.phone_number_id ||
    payload?.instance ||
    null;
  if (instanceId && /[a-z]/i.test(String(instanceId))) {
    const { rememberEstablishmentInstance } = require('./wameService');
    rememberEstablishmentInstance(establishmentId, instanceId);
  }

  let threads = 0;
  let inserted = 0;
  let skipped = 0;

  for (const chunk of historyChunks(payload)) {
    const list = Array.isArray(chunk?.threads) ? chunk.threads : [];
    for (const thread of list) {
      const phone = customerPhoneFromThread(thread, housePhone);
      if (!phone) {
        skipped += 1;
        continue;
      }
      threads += 1;
      const conversation = await inbox.upsertConversation(pool, {
        waId: phone,
        contactName: null,
        establishmentId,
        touchUpdatedAt: false,
      });
      await inbox.upsertContact(pool, {
        waId: phone,
        contactName: null,
        lastEstablishmentId: establishmentId,
        grantMarketingOptIn: false,
        sourceChannel: 'WHATSAPP',
      });

      const messages = Array.isArray(thread.messages) ? thread.messages : [];
      for (const message of messages) {
        const wameId = message?.id ? String(message.id) : '';
        const body = messageBody(message);
        const createdAt = messageTimestamp(message.timestamp);
        if (!wameId || !body || !createdAt) {
          skipped += 1;
          continue;
        }
        if (await inbox.hasMessageWithWameId(pool, conversation.id, wameId)) {
          skipped += 1;
          continue;
        }
        const fromMe = messageIsFromBusiness(message, housePhone);
        await inbox.insertHistoryMessage(pool, {
          conversationId: conversation.id,
          direction: fromMe ? 'outbound' : 'inbound',
          body,
          messageType: String(message.type || 'text').slice(0, 32),
          createdAt,
          rawPayload: {
            source: 'wame_coexistence_history',
            instance: instanceId ? String(instanceId) : null,
            wame_message_id: wameId,
            from_me: fromMe,
            history_context: message.history_context || null,
          },
        });
        inserted += 1;
      }
      await inbox.alignConversationActivity(pool, conversation.id);
    }
  }

  console.log(
    `[Wame history] casa=${establishmentId} threads=${threads} inseridas=${inserted} ignoradas=${skipped}`
  );
  return { ok: true, establishmentId, threads, inserted, skipped };
}

module.exports = {
  isHistoryPayload,
  persistHistoryPayload,
};
