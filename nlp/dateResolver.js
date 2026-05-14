const TIME_ZONE = 'America/Sao_Paulo';

const WEEKDAY_INDEX = {
  domingo: 0,
  dom: 0,
  segunda: 1,
  seg: 1,
  terca: 1,
  ter: 1,
  tercafeira: 1,
  quarta: 2,
  qua: 2,
  quinta: 3,
  qui: 3,
  sexta: 4,
  sex: 4,
  sabado: 5,
  sab: 5,
};

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
      const map = { sun: 0, mon: 1, tue: 1, wed: 2, thu: 3, fri: 4, sat: 5 };
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

function nextOccurrenceOfWeekday(parts, weekday, includeToday = false) {
  let delta = (weekday - parts.weekday + 7) % 7;
  if (delta === 0 && !includeToday) delta = 7;
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

  const weekdayMatch = normalized.match(
    /\b(?:na\s+)?(?:proxima|prox\.?|que vem|agora)?\s*(domingo|dom|segunda|seg|terca|ter|quarta|qua|quinta|qui|sexta|sex|sabado|sab)\b/
  );
  if (weekdayMatch) {
    const weekday = WEEKDAY_INDEX[weekdayMatch[1]];
    if (weekday === undefined) {
      return { ok: false, confidence: 'low', reason: 'weekday_unknown' };
    }
    const includeToday = /\bagora\b/.test(normalized) || /\bhoje\b/.test(normalized);
    const iso = nextOccurrenceOfWeekday(today, weekday, includeToday);
    const ambiguous = /\bque vem\b/.test(normalized) && compareIso(iso, todayIso) <= 7;
    return {
      ok: true,
      iso,
      confidence: ambiguous ? 'medium' : 'high',
      source: 'weekday_relative',
      ambiguous,
    };
  }

  return { ok: false, confidence: 'none', reason: 'unparsed' };
}

module.exports = {
  TIME_ZONE,
  resolveDateFromText,
};
