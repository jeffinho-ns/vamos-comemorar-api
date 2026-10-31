const { sendMessage } = require('../whatsappService');
const inbox = require('../whatsappInboxRepository');
const { getMemory } = require('./agentMemoryService');
const { loadActiveSettings } = require('./assistantSettingsService');
const { looksLikeReservationIntent } = require('./reservationDateHint');
const { inactivityLimitMinutes } = require('./assistantBehaviorRuntime');
const {
  reservationAlreadyCreated,
  lastAssistantClosedReservation,
} = require('./reservationFunnel');
const { isInstagramWaId } = require('../instagram/instagramIdentity');

const CATEGORY_HINTS = [
  { key: 'reservas', test: (text) => looksLikeReservationIntent(text) || /\breserv/i.test(text) },
  { key: 'cardapio', test: (text) => /\b(card[aá]pio|menu|drink|comer)\b/i.test(text) },
  { key: 'eventos', test: (text) => /\b(evento|programa[cç][aã]o|dj|show)\b/i.test(text) },
  { key: 'fila', test: (text) => /\b(fila|lista de espera|espera)\b/i.test(text) },
  { key: 'saudacoes', test: (text) => /^(oi|ol[aá]|boa (noite|tarde|dia))\b/i.test(text) },
  { key: 'informacoes', test: () => true },
];

function asRecord(value) {
  return value && typeof value === 'object' ? value : {};
}

function followUpConfig(settings) {
  return asRecord(asRecord(settings).follow_up_config);
}

function pickCategory(lastUserText, categories) {
  const enabled = asRecord(categories);
  const text = String(lastUserText || '');
  for (const hint of CATEGORY_HINTS) {
    const setting = enabled[hint.key];
    if (setting && setting.enabled === false) continue;
    if (hint.test(text)) return { key: hint.key, instruction: String(setting?.instruction || '').trim() };
  }
  return { key: 'informacoes', instruction: '' };
}

function buildFollowUpText(category) {
  const instruction = String(category?.instruction || '').trim();
  if (instruction) {
    return instruction.length > 220 ? `${instruction.slice(0, 217).trim()}…` : instruction;
  }
  if (category?.key === 'reservas') {
    return 'Ainda tá aí? Se quiser, eu sigo com a sua reserva por aqui.';
  }
  return 'Ainda tá por aí? Qualquer coisa é só me chamar.';
}

async function listHousesWithFollowUp(pool) {
  const result = await pool.query(
    `SELECT establishment_id, follow_up_config, behavior_config
       FROM ai_assistant_settings
      WHERE COALESCE((follow_up_config->>'enabled')::boolean, false) = true`
  );
  return result.rows || [];
}

async function lastMessages(pool, conversationId) {
  const result = await pool.query(
    `SELECT direction, body, intent, created_at
       FROM whatsapp_messages
      WHERE conversation_id = $1
      ORDER BY created_at DESC
      LIMIT 12`,
    [conversationId]
  );
  return result.rows || [];
}

function alreadySentInterval(messages, minutes) {
  const intent = `CONVO_FOLLOWUP_${minutes}`;
  return (messages || []).some((row) => String(row.intent || '') === intent);
}

function outboundToHistory(messages = []) {
  return (messages || [])
    .filter((row) => row?.direction === 'outbound')
    .slice()
    .reverse()
    .map((row) => ({ role: 'assistant', content: String(row.body || '') }));
}

function hasCreatedReservationIntent(messages = []) {
  return (messages || []).some((row) => {
    const intent = String(row.intent || '');
    return intent === 'PROCESS_RESERVATION' || intent === 'GUEST_LIST_LINK';
  });
}

function conversationWaId(waId) {
  const raw = String(waId || '').trim();
  if (!raw) return '';
  return isInstagramWaId(raw) ? raw : raw.replace(/\D/g, '');
}

function shouldSkipConversationFollowUp({ messages = [], workingState = {} } = {}) {
  if (reservationAlreadyCreated(workingState)) return true;
  if (hasCreatedReservationIntent(messages)) return true;
  if (lastAssistantClosedReservation(outboundToHistory(messages))) return true;
  return false;
}

async function processConversationFollowUpBatch(pool, app) {
  if (!pool) return { scanned: 0, sent: 0, takeovers: 0 };
  const houses = await listHousesWithFollowUp(pool).catch(() => []);
  if (!houses.length) return { scanned: 0, sent: 0, takeovers: 0 };

  let scanned = 0;
  let sent = 0;
  let takeovers = 0;

  for (const house of houses) {
    const establishmentId = Number(house.establishment_id);
    const settings = await loadActiveSettings(pool, establishmentId).catch(() => null);
    const cfg = followUpConfig(settings || { follow_up_config: house.follow_up_config });
    const intervals = (Array.isArray(cfg.intervals) ? cfg.intervals : [])
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value) && value > 0)
      .sort((a, b) => a - b)
      .slice(0, 5);
    if (!intervals.length) continue;

    const conversations = await pool.query(
      `SELECT id, wa_id, establishment_id
         FROM whatsapp_conversations
        WHERE establishment_id = $1
          AND (human_takeover_until IS NULL OR human_takeover_until < NOW())
        ORDER BY updated_at DESC
        LIMIT 20`,
      [establishmentId]
    );

    for (const conversation of conversations.rows || []) {
      scanned += 1;
      try {
      const messages = await lastMessages(pool, conversation.id);
      const memory = await getMemory(pool, conversation.id).catch(() => ({ workingState: {} }));
      if (shouldSkipConversationFollowUp({ messages, workingState: memory?.workingState || {} })) {
        continue;
      }
      const lastUser = messages.find((row) => row.direction === 'inbound');
      if (!lastUser?.created_at) continue;
      const silentMin = (Date.now() - new Date(lastUser.created_at).getTime()) / 60000;
      if (!Number.isFinite(silentMin) || silentMin < intervals[0]) continue;

      const lastOut = messages.find((row) => row.direction === 'outbound');
      if (lastOut && new Date(lastOut.created_at) > new Date(lastUser.created_at)) {
        const alreadyWaiting = (Date.now() - new Date(lastOut.created_at).getTime()) / 60000;
        if (alreadyWaiting < intervals[0]) continue;
      }

      const idleLimit = inactivityLimitMinutes(settings || { behavior_config: house.behavior_config });
      if (idleLimit > 0 && silentMin >= idleLimit) {
        await pool.query(
          `UPDATE whatsapp_conversations
              SET human_takeover_until = NOW() + interval '48 hours',
                  updated_at = NOW()
            WHERE id = $1`,
          [conversation.id]
        );
        takeovers += 1;
        continue;
      }

      const due = [...intervals].reverse().find((minutes) => silentMin >= minutes);
      if (!due || alreadySentInterval(messages, due)) continue;

      const category = pickCategory(lastUser.body, cfg.categories);
      const text = buildFollowUpText(category);
      const waId = conversationWaId(conversation.wa_id);
      if (!waId) continue;
      await sendMessage(waId, text);
      await inbox.insertMessage(pool, {
        conversationId: conversation.id,
        direction: 'outbound',
        body: text,
        intent: `CONVO_FOLLOWUP_${due}`,
        suggestedReply: null,
        rawPayload: { source: 'conversation_followup', category: category.key, minutes: due },
      });
      sent += 1;
      const io = app?.get?.('socketio');
      if (io) io.to('whatsapp_inbox').emit('whatsapp_inbox_update', { type: 'conversation_followup' });
      } catch (error) {
        console.warn(
          `[conversationFollowUp] falha conversation_id=${conversation.id}:`,
          error.message
        );
      }
    }
  }

  return { scanned, sent, takeovers };
}

module.exports = {
  processConversationFollowUpBatch,
  pickCategory,
  buildFollowUpText,
  shouldSkipConversationFollowUp,
};
