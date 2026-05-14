const businessRulesEngine = require('../businessRulesEngine');

function extractEstablishmentToken(text) {
  const normalizedText = String(text || '');
  const match = normalizedText.match(/#EST[_:-]([A-Za-z0-9_-]{1,80})/i);
  if (!match) return null;
  const rawToken = String(match[1] || '').trim();
  if (!rawToken) return null;
  const cleanedText = normalizedText
    .replace(match[0], ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return {
    rawToken,
    marker: match[0],
    cleanedText,
  };
}

async function resolveEstablishmentByToken(pool, token) {
  if (!token) return null;
  const numericId = Number(token);
  if (Number.isFinite(numericId) && numericId > 0) {
    const byId = await pool.query(
      `SELECT id, name, slug
       FROM places
       WHERE id = $1
       LIMIT 1`,
      [numericId]
    );
    return byId.rows[0] || null;
  }

  const bySlug = await pool.query(
    `SELECT id, name, slug
     FROM places
     WHERE LOWER(slug) = LOWER($1)
     LIMIT 1`,
    [String(token).trim()]
  );
  return bySlug.rows[0] || null;
}

function mapRowsToOpenAIHistory(rows) {
  return (rows || []).map((row) => ({
    role: row.direction === 'outbound' ? 'assistant' : 'user',
    content: row.body,
  }));
}

function looksLikePrematureBookingPromise(text) {
  if (!text || typeof text !== 'string') return false;
  return /quase pronta|está pronta|já está|ja esta|confirmad[ao]|registrad[ao]|reserva (foi|esta|está)|garantid[ao]|no sistema\b/i.test(
    text
  );
}

function validateProcessReservationParams(params) {
  const keys = [
    'establishment_id',
    'client_name',
    'client_email',
    'data_nascimento',
    'quantidade_convidados',
    'reservation_date',
    'reservation_time',
    'area_id',
  ];
  const missing = [];
  for (const key of keys) {
    const value = params[key];
    if (value === undefined || value === null || value === '') {
      missing.push(key);
      continue;
    }
    if (
      (key === 'establishment_id' || key === 'area_id' || key === 'quantidade_convidados') &&
      Number.isNaN(Number(value))
    ) {
      missing.push(key);
    }
  }
  return missing;
}

function extractInterpretedEstablishmentId(interpreted) {
  const raw = interpreted?.params?.establishment_id;
  const id = Number(raw);
  if (!Number.isFinite(id) || id <= 0) return null;
  return id;
}

function parsePtBrDateFromText(text) {
  const raw = String(text || '');
  const normalized = raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth() + 1;
  const currentDay = today.getDate();

  const buildFutureDate = (day, month, yearCandidate = null) => {
    let year = yearCandidate;
    if (!year) {
      year = currentYear;
      if (month < currentMonth || (month === currentMonth && day < currentDay)) {
        year += 1;
      }
    } else if (year < 100) {
      year += 2000;
    }
    const iso = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return { iso, day, month, year };
  };

  const match = raw.match(/\b(\d{1,2})[\/-](\d{1,2})(?:[\/-](\d{2,4}))?\b/);
  if (match) {
    const day = Number(match[1]);
    const month = Number(match[2]);
    const year = match[3] ? Number(match[3]) : null;
    if (
      Number.isFinite(day) &&
      Number.isFinite(month) &&
      day >= 1 &&
      day <= 31 &&
      month >= 1 &&
      month <= 12
    ) {
      return buildFutureDate(day, month, year);
    }
  }

  if (/\bhoje\b/i.test(normalized)) {
    return buildFutureDate(currentDay, currentMonth, currentYear);
  }
  if (/\bamanha\b/i.test(normalized)) {
    const nextDay = new Date(today);
    nextDay.setDate(nextDay.getDate() + 1);
    return buildFutureDate(nextDay.getDate(), nextDay.getMonth() + 1, nextDay.getFullYear());
  }

  const dayOnly = raw.match(/\bdia\s+(\d{1,2})\b/i);
  if (dayOnly) {
    const day = Number(dayOnly[1]);
    if (Number.isFinite(day) && day >= 1 && day <= 31) {
      let month = currentMonth;
      let year = currentYear;
      if (day < currentDay) {
        month += 1;
        if (month > 12) {
          month = 1;
          year += 1;
        }
      }
      return buildFutureDate(day, month, year);
    }
  }

  return null;
}

function mergeReplyWithOverrideNotice(replyText, notice) {
  const base = String(replyText || '').trim();
  if (!notice) return base;
  if (!base) return notice;
  if (base.toLowerCase().includes(String(notice).toLowerCase())) return base;
  return `${base}\n\n${notice}`;
}

function looksLikeAvailabilityQuestion(text) {
  const normalized = String(text || '').toLowerCase();
  return /hor[aá]ri|que horas|dispon[ií]vel|disponibilidade/.test(normalized);
}

function looksLikeMusicQuestion(text) {
  const normalized = String(text || '').toLowerCase();
  return /m[uú]sica|programa[cç][aã]o|dj|banda|show|estilo/.test(normalized);
}

function looksLikeMenuQuestion(text) {
  const normalized = String(text || '').toLowerCase();
  return /card[aá]pio|menu/.test(normalized);
}

function looksLikeParkingQuestion(text) {
  const normalized = String(text || '').toLowerCase();
  return /estacionamento|valet|parar o carro/.test(normalized);
}

function looksLikeAreaQuestion(text) {
  const normalized = String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  return /\bquais?\s+(areas?|ambientes?|setores?)\b|\bqual\s+(area|ambiente|setor)\b/.test(normalized);
}

function looksLikeRepeatedDataComplaint(text) {
  const normalized = String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  return /\bja falei\b|\bja informei\b|\bja disse\b|\bja passei\b|\bja te falei\b/.test(normalized);
}

function normalizeInboundText(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

const ESTABLISHMENT_ALIAS_PATTERNS = [
  { pattern: /\breserva\s*rooftop\b|\brooftop\b/, id: 9 },
  { pattern: /\bpracinha\b/, id: 8 },
  { pattern: /\bhigh[\s-]?line\b/, id: 7 },
  { pattern: /\boh\s*fregues\b|\bfregues\b/, id: 4 },
  { pattern: /\bseu\s*justino\b|\bjustino\b/, id: 1 },
];

function detectEstablishmentFromText(text, establishments = []) {
  const normalized = normalizeInboundText(text);
  if (!normalized) return null;

  let bestId = null;
  let bestNameLength = 0;
  for (const establishment of establishments) {
    const name = normalizeInboundText(establishment?.name);
    if (!name || !normalized.includes(name)) continue;
    if (name.length > bestNameLength) {
      bestNameLength = name.length;
      const id = Number(establishment.id);
      if (Number.isFinite(id) && id > 0) bestId = id;
    }
  }
  if (bestId) return bestId;

  for (const alias of ESTABLISHMENT_ALIAS_PATTERNS) {
    if (alias.pattern.test(normalized)) return alias.id;
  }
  return null;
}

function looksLikeFreshReservationStart(text) {
  const normalized = normalizeInboundText(text);
  return /\b(nova reserva|quero reservar|fazer uma reserva|outra reserva|outro estabelecimento)\b/.test(
    normalized
  );
}

function resolveEstablishmentForTurn({
  messageText,
  messageHistory = [],
  establishments = [],
  lockedEstablishmentId = null,
  conversationEstablishmentId = null,
  collectedFields = {},
}) {
  const currentMessageId = detectEstablishmentFromText(messageText, establishments);
  if (currentMessageId) {
    const currentName =
      establishments.find((item) => Number(item.id) === Number(currentMessageId))?.name || '';
    return normalizeCanonicalEstablishmentId(currentMessageId, currentName);
  }

  const historyText = messageHistory.map((message) => message?.content || '').join(' ');
  const historyId = detectEstablishmentFromText(historyText, establishments);
  const fallbackId =
    Number(collectedFields?.establishment_id) ||
    lockedEstablishmentId ||
    conversationEstablishmentId ||
    historyId;
  const fallbackName =
    establishments.find((item) => Number(item.id) === Number(fallbackId))?.name || '';
  return normalizeCanonicalEstablishmentId(fallbackId, fallbackName);
}

function buildAvailabilityReplyText({ establishmentName, displayDate, windows }) {
  if (windows.length > 0) {
    return `No dia ${displayDate}, no ${establishmentName}, os horários disponíveis são: ${windows.join(' | ')}.\n\nSe quiser, já deixo sua reserva encaminhada. Me fala só o horário que prefere e quantas pessoas serão.`;
  }
  return `No dia ${displayDate}, não temos janela de reserva disponível no sistema para ${establishmentName}.\n\nSe quiser, eu te sugiro o melhor dia/horário alternativo e já encaminho sua reserva.`;
}

function normalizeCanonicalEstablishmentId(establishmentIdRaw, establishmentNameRaw = '') {
  const establishmentId = Number(establishmentIdRaw);
  const hint = String(establishmentNameRaw || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

  const highlineEnvId = Number(process.env.HIGHLINE_ESTABLISHMENT_ID || '');
  if (hint.includes('reserva rooftop') || hint.includes('rooftop')) return 9;
  if (hint.includes('pracinha')) return 8;
  if (hint.includes('seu justino') || hint.includes('justino')) return 1;
  if (hint.includes('highline') || hint.includes('high line')) {
    if (Number.isFinite(highlineEnvId) && highlineEnvId > 0) return highlineEnvId;
    if (Number.isFinite(establishmentId) && establishmentId > 0) return establishmentId;
  }
  return Number.isFinite(establishmentId) && establishmentId > 0 ? establishmentId : null;
}

function parseDateFromHistory(messageHistory) {
  const list = Array.isArray(messageHistory) ? messageHistory : [];
  for (let index = list.length - 1; index >= 0; index -= 1) {
    const message = list[index];
    if (message?.role !== 'user') continue;
    const parsed = parsePtBrDateFromText(message?.content || '');
    if (parsed?.iso) return parsed;
  }
  return null;
}

function getCardapioUrlByEstablishmentId(establishmentId) {
  const id = Number(establishmentId);
  const map = {
    7: 'https://www.agilizaiapp.com.br/cardapio/highline',
    4: 'https://www.agilizaiapp.com.br/cardapio/ohfregues',
    8: 'https://www.agilizaiapp.com.br/cardapio/pracinha',
    9: 'https://www.agilizaiapp.com.br/cardapio/reserva-rooftop',
    1: 'https://www.agilizaiapp.com.br/cardapio/justino',
  };
  return map[id] || null;
}

function applyBusinessRulesToReservationParams(params) {
  return businessRulesEngine.validateReservationPartySize(params);
}

module.exports = {
  extractEstablishmentToken,
  resolveEstablishmentByToken,
  mapRowsToOpenAIHistory,
  looksLikePrematureBookingPromise,
  validateProcessReservationParams,
  extractInterpretedEstablishmentId,
  parsePtBrDateFromText,
  mergeReplyWithOverrideNotice,
  looksLikeAvailabilityQuestion,
  looksLikeMusicQuestion,
  looksLikeMenuQuestion,
  looksLikeParkingQuestion,
  looksLikeAreaQuestion,
  looksLikeRepeatedDataComplaint,
  detectEstablishmentFromText,
  looksLikeFreshReservationStart,
  resolveEstablishmentForTurn,
  buildAvailabilityReplyText,
  normalizeCanonicalEstablishmentId,
  parseDateFromHistory,
  getCardapioUrlByEstablishmentId,
  applyBusinessRulesToReservationParams,
};
