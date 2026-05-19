const TIME_ZONE = 'America/Sao_Paulo';

/** Índice alinhado ao Intl (0=domingo … 6=sábado) em America/Sao_Paulo. */
const WEEKDAY_INDEX = {
  domingo: 0,
  dom: 0,
  segunda: 1,
  seg: 1,
  terca: 2,
  ter: 2,
  tercafeira: 2,
  quarta: 3,
  qua: 3,
  quinta: 4,
  qui: 4,
  sexta: 5,
  sex: 5,
  sabado: 6,
  sab: 6,
};

const MONTH_LABEL_PT = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
];

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function getZonedParts(date = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  });
  const parts = formatter.formatToParts(date);
  const result = { year: 0, month: 0, day: 0, weekday: 0 };
  for (const part of parts) {
    if (part.type === 'year') result.year = Number(part.value);
    if (part.type === 'month') result.month = Number(part.value);
    if (part.type === 'day') result.day = Number(part.value);
    if (part.type === 'weekday') {
      const short = String(part.value || '').slice(0, 3).toLowerCase();
      const map = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
      result.weekday = map[short] ?? 0;
    }
  }
  return result;
}

function toIsoDate(year, month, day) {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function addDaysToParts(parts, days) {
  const utc = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days, 12, 0, 0));
  return getZonedParts(utc);
}

function compareIso(leftIso, rightIso) {
  if (leftIso === rightIso) return 0;
  return leftIso < rightIso ? -1 : 1;
}

function nextOccurrenceOfWeekday(parts, weekday, options = {}) {
  const includeToday = options.includeToday === true;
  const forceStrictlyFuture = options.forceStrictlyFuture === true;
  let delta = (weekday - parts.weekday + 7) % 7;
  if (delta === 0 && !includeToday) delta = 7;
  if (forceStrictlyFuture && delta === 0) delta = 7;
  const target = addDaysToParts(parts, delta);
  return toIsoDate(target.year, target.month, target.day);
}

function parseNumericDate(text) {
  const match = String(text || '').match(/\b(\d{1,2})[\/-](\d{1,2})(?:[\/-](\d{2,4}))?\b/);
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  let year = match[3] ? Number(match[3]) : null;
  if (!Number.isFinite(day) || !Number.isFinite(month) || day < 1 || day > 31 || month < 1 || month > 12) {
    return null;
  }
  const today = getZonedParts();
  if (!year) {
    year = today.year;
    const candidate = toIsoDate(year, month, day);
    if (compareIso(candidate, toIsoDate(today.year, today.month, today.day)) < 0) {
      year += 1;
    }
  } else if (year < 100) {
    year += 2000;
  }
  return { iso: toIsoDate(year, month, day), confidence: 'high', source: 'numeric_date' };
}

function resolveDateFromText(text, options = {}) {
  const normalized = normalizeText(text);
  if (!normalized) {
    return { ok: false, confidence: 'none', reason: 'empty_text' };
  }

  const today = getZonedParts();
  const todayIso = toIsoDate(today.year, today.month, today.day);

  if (/\bhoje\b/.test(normalized) || /\bhj\b/.test(normalized)) {
    return { ok: true, iso: todayIso, confidence: 'high', source: 'hoje' };
  }

  if (/\bamanha\b/.test(normalized)) {
    const tomorrow = addDaysToParts(today, 1);
    return {
      ok: true,
      iso: toIsoDate(tomorrow.year, tomorrow.month, tomorrow.day),
      confidence: 'high',
      source: 'amanha',
    };
  }

  const numeric = parseNumericDate(normalized);
  if (numeric) {
    return { ok: true, ...numeric };
  }

  const dayOnly = normalized.match(/\bdia\s+(\d{1,2})\b/);
  if (dayOnly) {
    const day = Number(dayOnly[1]);
    let month = today.month;
    let year = today.year;
    if (day < today.day) {
      month += 1;
      if (month > 12) {
        month = 1;
        year += 1;
      }
    }
    return {
      ok: true,
      iso: toIsoDate(year, month, day),
      confidence: 'medium',
      source: 'dia_n',
    };
  }

  const weekdayToken =
    '(domingo|dom|segunda|seg|terca|ter|quarta|qua|quinta|qui|sexta|sex|sabado|sab)';
  const weekdayModifier = '(?:essa|esta|nesta|proxima|proximo|prox\\.?|que vem|agora)?';
  const weekdayPatterns = [
    new RegExp(`\\b(?:proximo|proxima|prox\\.?)\\s+${weekdayToken}\\b`, 'i'),
    new RegExp(`\\b${weekdayModifier}\\s+${weekdayToken}\\b`, 'i'),
    new RegExp(
      `\\b(?:para|pra|na|no|em)\\s+${weekdayModifier}\\s*${weekdayToken}\\b`,
      'i'
    ),
    new RegExp(
      `\\b(?:na\\s+)?(?:proxima|proximo|prox\\.?|que vem|agora)?\\s*${weekdayToken}\\b`,
      'i'
    ),
  ];

  let weekdayMatch = null;
  for (const pattern of weekdayPatterns) {
    weekdayMatch = normalized.match(pattern);
    if (weekdayMatch) break;
  }

  if (weekdayMatch) {
    const weekdayKey = weekdayMatch[weekdayMatch.length - 1];
    const weekday = WEEKDAY_INDEX[weekdayKey];
    if (weekday === undefined) {
      return { ok: false, confidence: 'low', reason: 'weekday_unknown' };
    }
    const includeToday = /\bagora\b/.test(normalized) || /\bhoje\b/.test(normalized);
    const forceStrictlyFuture =
      /\b(proximo|proxima|prox\.?|que vem)\b/.test(normalized) && !includeToday;
    const iso = nextOccurrenceOfWeekday(today, weekday, {
      includeToday,
      forceStrictlyFuture,
    });
    const ambiguous = /\bque vem\b/.test(normalized) && compareIso(iso, todayIso) <= 7;
    return {
      ok: true,
      iso,
      confidence: ambiguous ? 'medium' : 'high',
      source: 'weekday_relative',
      ambiguous,
      needsConfirmation: true,
      weekdayIndex: weekday,
    };
  }

  return { ok: false, confidence: 'none', reason: 'unparsed' };
}

function formatReservationDateLabels(iso) {
  const match = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return {
      iso: iso || null,
      shortDate: null,
      weekdayWithDate: null,
      confirmationPhrase: null,
    };
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const noonSp = new Date(`${iso}T12:00:00-03:00`);
  const weekdayName = new Intl.DateTimeFormat('pt-BR', {
    timeZone: TIME_ZONE,
    weekday: 'long',
  }).format(noonSp);
  const dd = String(day).padStart(2, '0');
  const mm = String(month).padStart(2, '0');
  const monthName = MONTH_LABEL_PT[month - 1] || '';

  return {
    iso,
    shortDate: `${dd}/${mm}`,
    fullDate: `${dd}/${mm}/${year}`,
    weekdayWithDate: `${weekdayName}, dia ${dd}/${mm}`,
    confirmationPhrase: `${weekdayName}, dia ${dd}/${mm}/${year}`,
    weekdayName,
    monthName,
  };
}

function resolveDateFromConversation(userText, messageHistory = []) {
  const direct = resolveDateFromText(userText);
  if (direct.ok) return direct;

  const history = Array.isArray(messageHistory) ? messageHistory : [];
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const item = history[index];
    if (item?.role !== 'user') continue;
    const parsed = resolveDateFromText(item.content);
    if (parsed.ok) return parsed;
  }
  return { ok: false, confidence: 'none', reason: 'unparsed' };
}

function buildTodayCalendarLabels(referenceDateIso) {
  const iso =
    String(referenceDateIso || '').slice(0, 10) ||
    toIsoDate(getZonedParts().year, getZonedParts().month, getZonedParts().day);
  return formatReservationDateLabels(iso);
}

function isDateInPastComparedToReference(iso, referenceDateIso) {
  const ref = String(referenceDateIso || '').slice(0, 10);
  const target = String(iso || '').slice(0, 10);
  if (!ref || !target) return false;
  return compareIso(target, ref) < 0;
}

module.exports = {
  TIME_ZONE,
  resolveDateFromText,
  resolveDateFromConversation,
  formatReservationDateLabels,
  buildTodayCalendarLabels,
  isDateInPastComparedToReference,
  getZonedParts,
  toIsoDate,
};
