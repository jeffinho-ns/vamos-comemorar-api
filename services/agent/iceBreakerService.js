const { looksLikeReservationIntent } = require('./reservationDateHint');
const { looksLikeAdEntryGreeting, isFirstUserMessageInConversation } = require('./reservationFunnel');

function asRecord(value) {
  return value && typeof value === 'object' ? value : {};
}

function normalizeChannel(value) {
  const channel = String(value || 'whatsapp').trim().toLowerCase();
  return channel === 'instagram' ? 'instagram' : 'whatsapp';
}

async function loadIceBreakers(pool, establishmentId, channel = 'whatsapp') {
  const id = Number(establishmentId);
  if (!pool || !Number.isFinite(id) || id <= 0) return [];
  const wanted = normalizeChannel(channel);
  try {
    const result = await pool.query(
      `SELECT label, question, channel
         FROM ai_ice_breakers
        WHERE establishment_id = $1
          AND is_active = TRUE
          AND COALESCE(TRIM(question), '') <> ''
          AND LOWER(COALESCE(channel, 'whatsapp')) = $2
        ORDER BY sort_order ASC, id ASC
        LIMIT 5`,
      [id, wanted]
    );
    return (result.rows || []).map((row) => ({
      label: String(row.label || '').trim(),
      question: String(row.question || '').trim(),
    }));
  } catch (error) {
    console.warn('[iceBreakerService] falha ao carregar quebra-gelos:', error.message);
    return [];
  }
}

function iceBreakersEnabled(settings, channel = 'whatsapp') {
  const cfg = asRecord(settings);
  if (cfg.ice_breakers_enabled === false) return false;
  const channels = Array.isArray(cfg.ice_breakers_channels) ? cfg.ice_breakers_channels : ['whatsapp'];
  return channels.map((item) => normalizeChannel(item)).includes(normalizeChannel(channel));
}

function shouldOfferIceBreakers({ settings, userText, messageHistory, channel = 'whatsapp' } = {}) {
  if (!iceBreakersEnabled(settings, channel)) return false;
  if (!isFirstUserMessageInConversation(messageHistory)) return false;
  const text = String(userText || '').trim();
  if (!text) return false;
  if (looksLikeReservationIntent(text)) return false;
  return looksLikeAdEntryGreeting(text) || text.length <= 80;
}

function appendIceBreakers(replyText, items = []) {
  const reply = String(replyText || '').trim();
  const questions = (items || [])
    .map((item) => String(item?.question || '').trim())
    .filter(Boolean)
    .slice(0, 2);
  if (!questions.length) return reply;
  const extra = questions.join(' ');
  if (!reply) return extra;
  if (questions.some((question) => reply.includes(question))) return reply;
  return `${reply} ${extra}`.trim();
}

module.exports = {
  loadIceBreakers,
  iceBreakersEnabled,
  shouldOfferIceBreakers,
  appendIceBreakers,
};
