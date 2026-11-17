'use strict';

const inbox = require('../whatsappInboxRepository');
const { resolveWameEstablishmentId, normalizeDisplayPhone, displayPhoneFromPayload } = require('./wameHouse');

const HOUSE_PHONES = new Set(['551123050938', '551152003650']);

function firstChange(payload) {
  return payload?.entry?.[0]?.changes?.[0] || null;
}

function replyMessage(payload) {
  const value = firstChange(payload)?.value;
  if (!value) return null;
  if (Array.isArray(value.messages) && value.messages[0]) return value.messages[0];
  if (Array.isArray(value.message_echoes) && value.message_echoes[0]) return value.message_echoes[0];
  return null;
}

function isPhoneReply(payload) {
  const field = String(firstChange(payload)?.field || '');
  if (field === 'smb_message_echoes') return true;
  const message = replyMessage(payload);
  if (!message) return false;
  return message.from_me === true || message.fromMe === true;
}

function replyBody(message) {
  if (!message) return '';
  if (typeof message.text === 'string' && message.text.trim()) return message.text.trim();
  if (message.text?.body && String(message.text.body).trim()) return String(message.text.body).trim();
  if (message.image?.caption && String(message.image.caption).trim()) {
    return String(message.image.caption).trim();
  }
  const type = String(message.type || '').trim();
  if (!type || type === 'text') return '';
  return `[${type}]`;
}

function customerWaId(payload) {
  const value = firstChange(payload)?.value;
  const message = replyMessage(payload);
  if (!message) return null;
  const house = normalizeDisplayPhone(displayPhoneFromPayload(payload));
  const blocked = new Set(HOUSE_PHONES);
  if (house) blocked.add(house);
  const candidates = [value?.contacts?.[0]?.wa_id, message.to, message.from];
  for (const candidate of candidates) {
    const digits = normalizeDisplayPhone(candidate);
    if (digits.length >= 12 && !blocked.has(digits)) return digits;
  }
  return null;
}

function describePhoneReply(payload) {
  if (!isPhoneReply(payload)) return null;
  const message = replyMessage(payload);
  if (!message || String(message.chat_type || '') === 'group') return null;
  const waId = customerWaId(payload);
  const body = replyBody(message).slice(0, 4000);
  if (!waId || !body) return null;
  return {
    waId,
    body,
    wamid: message.id ? String(message.id) : null,
    messageType: String(message.type || 'text').slice(0, 32),
  };
}

async function alreadyStored(pool, conversationId, reply) {
  if (reply.wamid && await inbox.hasMessageWithWameId(pool, conversationId, reply.wamid)) {
    return true;
  }
  const recent = await pool.query(
    `SELECT 1
       FROM whatsapp_messages
      WHERE conversation_id = $1
        AND direction = 'outbound'
        AND body = $2
        AND created_at > NOW() - INTERVAL '2 minutes'
      LIMIT 1`,
    [conversationId, reply.body]
  );
  return recent.rowCount > 0;
}

function emitInbox(app, waId) {
  const io = app?.get?.('socketio');
  if (!io) return;
  io.to('whatsapp_inbox').emit('whatsapp_inbox_update', {
    type: 'outbound',
    wa_id: waId,
  });
}

async function persistPhoneReply(pool, app, payload) {
  const reply = describePhoneReply(payload);
  if (!reply) return { stored: false };

  const establishmentId = await resolveWameEstablishmentId(pool, payload);
  const conversation = await inbox.upsertConversation(pool, {
    waId: reply.waId,
    contactName: null,
    establishmentId: Number.isFinite(establishmentId) ? establishmentId : null,
  });
  if (await alreadyStored(pool, conversation.id, reply)) return { stored: false };

  const saved = await inbox.insertMessage(pool, {
    conversationId: conversation.id,
    direction: 'outbound',
    body: reply.body,
    intent: null,
    rawPayload: payload,
    messageType: reply.messageType,
  });
  const updated = await inbox.setHumanTakeoverUntilManualResume(pool, reply.waId);
  emitInbox(app, reply.waId);
  return { stored: true, message: saved, conversation: updated };
}

module.exports = {
  describePhoneReply,
  isPhoneReply,
  persistPhoneReply,
};
