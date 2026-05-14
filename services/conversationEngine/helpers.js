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

function detectEstablishmentFromText(text, establishments = []) {
  const normalized = String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  if (!normalized) return null;
  for (const establishment of establishments) {
    const name = String(establishment?.name || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
    if (!name) continue;
    if (normalized.includes(name)) {
      const id = Number(establishment.id);
      if (Number.isFinite(id) && id > 0) return id;
    }
  }
  return null;
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
  detectEstablishmentFromText,
  normalizeCanonicalEstablishmentId,
  parseDateFromHistory,
  getCardapioUrlByEstablishmentId,
  applyBusinessRulesToReservationParams,
};
