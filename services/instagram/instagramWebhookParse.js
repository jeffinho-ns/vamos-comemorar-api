const { toInstagramWaId } = require('./instagramIdentity');

function firstEntry(payload) {
  return payload?.entry?.[0] || null;
}

function messagingEvents(payload) {
  const entry = firstEntry(payload);
  if (!entry) return [];
  if (Array.isArray(entry.messaging)) return entry.messaging;
  const change = entry.changes?.[0];
  if (change?.value && (change.value.sender || change.value.message)) {
    return [change.value];
  }
  return [];
}

function isInstagramPayload(payload) {
  return String(payload?.object || '').toLowerCase() === 'instagram';
}

function isInstagramComment(payload) {
  const field = String(firstEntry(payload)?.changes?.[0]?.field || '').toLowerCase();
  if (field.includes('comment')) return true;
  const value = firstEntry(payload)?.changes?.[0]?.value || {};
  return Boolean(value.comment_id || (value.from && value.text && !value.message && field));
}

function extractInstagramInbound(payload) {
  if (!isInstagramPayload(payload)) return null;
  if (isInstagramComment(payload)) {
    const value = firstEntry(payload)?.changes?.[0]?.value || {};
    const from = value.from || {};
    return {
      kind: 'comment',
      waId: toInstagramWaId(from.id),
      text: String(value.text || '').trim() || null,
      messageId: value.id ? String(value.id) : null,
      contactName: from.username ? String(from.username) : null,
    };
  }

  const event = messagingEvents(payload)[0];
  if (!event) return null;
  const message = event.message || {};
  if (message.is_echo || message.is_deleted) return null;
  const text =
    String(message.text || event.text || '').trim() ||
    String(message?.reply_to?.story?.payload || '').trim() ||
    null;
  const senderId = event.sender?.id || event.from?.id;
  if (!senderId) return null;
  return {
    kind: message.is_unsupported ? 'unsupported' : 'direct',
    waId: toInstagramWaId(senderId),
    text,
    messageId: message.mid || event.mid || message.id || null,
    contactName: event.sender?.username || event.from?.username || null,
  };
}

module.exports = {
  isInstagramPayload,
  isInstagramComment,
  extractInstagramInbound,
};
