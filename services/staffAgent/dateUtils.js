'use strict';

/**
 * Datas do Staff Agent — sempre America/Sao_Paulo.
 * parseFlexibleDate é a fonte da verdade (DD/MM, ISO, hoje, amanhã, dia da semana).
 */

const WEEKDAYS = [
  ['domingo'],
  ['segunda', 'segunda-feira'],
  ['terca', 'terça', 'terca-feira', 'terça-feira'],
  ['quarta', 'quarta-feira'],
  ['quinta', 'quinta-feira'],
  ['sexta', 'sexta-feira'],
  ['sabado', 'sábado'],
];

function todayIsoSp() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function addDaysIso(iso, days) {
  const [y, m, d] = String(iso).split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

function normalize(text) {
  return String(text || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/** Aceita YYYY-MM-DD, DD/MM, DD/MM/YYYY, hoje, amanhã, dia da semana. */
function parseFlexibleDate(input) {
  const raw = String(input || '').trim();
  if (!raw) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

  const today = todayIsoSp();
  const n = normalize(raw);

  if (n === 'hoje') return today;
  if (n === 'amanha') return addDaysIso(today, 1);
  if (n === 'depois de amanha' || n === 'depois-de-amanha') return addDaysIso(today, 2);

  const br = raw.match(/^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?$/);
  if (br) {
    const day = Number(br[1]);
    const month = Number(br[2]);
    let year = br[3] ? Number(br[3]) : Number(today.slice(0, 4));
    if (year < 100) year += 2000;
    if (day < 1 || day > 31 || month < 1 || month > 12) return null;
    const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    if (!br[3] && iso < today) {
      return `${year + 1}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
    return iso;
  }

  const weekdayIndex = WEEKDAYS.findIndex((names) => names.includes(n));
  if (weekdayIndex >= 0) {
    const [y, m, d] = today.split('-').map(Number);
    const current = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    const delta = (weekdayIndex - current + 7) % 7 || 7;
    return addDaysIso(today, delta);
  }

  return null;
}

function parseDateOrToday(date) {
  return parseFlexibleDate(date) || todayIsoSp();
}

function formatBr(iso) {
  const [y, m, d] = String(iso).split('-');
  return `${d}/${m}/${y}`;
}

/** Próximo sábado e domingo (se hoje for sábado, usa este fim de semana). */
function upcomingWeekendDates() {
  const today = todayIsoSp();
  const [y, m, d] = today.split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=dom
  const toSat = dow === 6 ? 0 : dow === 0 ? -1 : 6 - dow;
  const sat = addDaysIso(today, toSat);
  const sun = addDaysIso(sat, 1);
  return [sat, sun];
}

/**
 * Extrai datas ISO de um texto (intervalo, lista, final de semana).
 * @param {string} text
 * @returns {string[]}
 */
function extractDatesFromText(text) {
  const raw = String(text || '');
  const n = normalize(raw);
  const found = new Set();

  if (/\b(final de semana|fim de semana|fds)\b/.test(n)) {
    upcomingWeekendDates().forEach((d) => found.add(d));
  }

  // 18/09/2026 ou 18-09-2026 ou 2026-09-18
  const reFull =
    /(\d{4}-\d{2}-\d{2})|(\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?)/g;
  let m;
  while ((m = reFull.exec(raw)) !== null) {
    const iso = parseFlexibleDate(m[0]);
    if (iso) found.add(iso);
  }

  // "do dia 18 até o dia 20/09" / "dias 18 a 20 de setembro"
  const range = n.match(
    /(?:do\s+)?dia\s+(\d{1,2})(?:[/-](\d{1,2})(?:[/-](\d{2,4}))?)?\s+(?:ate|até|a)\s+(?:o\s+)?(?:dia\s+)?(\d{1,2})(?:[/-](\d{1,2})(?:[/-](\d{2,4}))?)?(?:\s+de\s+(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)[a-z]*)?/
  );
  if (range) {
    const months = {
      jan: 1,
      fev: 2,
      mar: 3,
      abr: 4,
      mai: 5,
      jun: 6,
      jul: 7,
      ago: 8,
      set: 9,
      out: 10,
      nov: 11,
      dez: 12,
    };
    const today = todayIsoSp();
    const year = Number(today.slice(0, 4));
    const monthFromName = range[7] ? months[range[7]] : null;
    const startDay = Number(range[1]);
    const startMonth = Number(range[2]) || monthFromName || Number(today.slice(5, 7));
    const startYear = range[3]
      ? Number(range[3]) < 100
        ? 2000 + Number(range[3])
        : Number(range[3])
      : year;
    const endDay = Number(range[4]);
    const endMonth =
      Number(range[5]) || monthFromName || startMonth || Number(today.slice(5, 7));
    const endYear = range[6]
      ? Number(range[6]) < 100
        ? 2000 + Number(range[6])
        : Number(range[6])
      : startYear;

    const start = parseFlexibleDate(
      `${String(startDay).padStart(2, '0')}/${String(startMonth).padStart(2, '0')}/${startYear}`
    );
    const end = parseFlexibleDate(
      `${String(endDay).padStart(2, '0')}/${String(endMonth).padStart(2, '0')}/${endYear}`
    );
    if (start && end && start <= end) {
      let cur = start;
      let guard = 0;
      while (cur <= end && guard < 14) {
        found.add(cur);
        cur = addDaysIso(cur, 1);
        guard += 1;
      }
    }
  }

  // "18, 19 e 20 de setembro"
  const listMonth = n.match(
    /(\d{1,2})\s*,\s*(\d{1,2})\s*e\s*(\d{1,2})\s+de\s+(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)/
  );
  if (listMonth) {
    const months = {
      jan: 1,
      fev: 2,
      mar: 3,
      abr: 4,
      mai: 5,
      jun: 6,
      jul: 7,
      ago: 8,
      set: 9,
      out: 10,
      nov: 11,
      dez: 12,
    };
    const month = months[listMonth[4]];
    const year = Number(todayIsoSp().slice(0, 4));
    for (const day of [listMonth[1], listMonth[2], listMonth[3]]) {
      const iso = parseFlexibleDate(
        `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`
      );
      if (iso) found.add(iso);
    }
  }

  return [...found].sort();
}

module.exports = {
  todayIsoSp,
  addDaysIso,
  parseFlexibleDate,
  parseDateOrToday,
  formatBr,
  upcomingWeekendDates,
  extractDatesFromText,
};
