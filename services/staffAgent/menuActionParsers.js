'use strict';

const { todayIsoSp, addDaysIso } = require('./dateUtils');

const SEAL_CATALOG = [
  ['especial-do-dia', 'especial do dia'],
  ['vegetariano', 'vegetariano'],
  ['saudavel-leve', 'saudavel', 'saudavel/leve', 'saudavel leve'],
  ['prato-da-casa', 'prato da casa'],
  ['artesanal', 'artesanal'],
  ['assinatura-bartender', 'assinatura do bartender', 'assinatura bartender'],
  ['edicao-limitada', 'edicao limitada'],
  ['processo-artesanal', 'processo artesanal'],
  ['sem-alcool', 'sem alcool'],
  ['refrescante', 'refrescante'],
  ['citrico', 'citrico'],
  ['doce', 'doce'],
  ['picante', 'picante'],
];

function normalizeText(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function parseClockTime(value) {
  const text = normalizeText(value).replace(/\s+/g, '');
  const match = text.match(/^(\d{1,2})(?:[:h](\d{2}))?h?$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = match[2] ? Number(match[2]) : 0;
  if (hours > 23 || minutes > 59) return null;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function parseUntilFromText(text) {
  const normalized = normalizeText(text);
  const match = normalized.match(/\bate\s+(?:as\s+)?(\d{1,2})(?::(\d{2}))?\s*h?\b/);
  if (!match) return null;
  return parseClockTime(match[2] ? `${match[1]}:${match[2]}` : `${match[1]}h`);
}

function nowMinutesSp(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const hour = Number(parts.find((part) => part.type === 'hour')?.value || 0);
  const minute = Number(parts.find((part) => part.type === 'minute')?.value || 0);
  return hour * 60 + minute;
}

/** Horário de hoje em São Paulo. Se já passou, vale amanhã. */
function pauseUntilFromClock(hhmm, now = new Date()) {
  const clock = parseClockTime(hhmm);
  if (!clock) return null;
  const [hours, minutes] = clock.split(':').map(Number);
  const today = todayIsoSp();
  const day = hours * 60 + minutes <= nowMinutesSp(now) ? addDaysIso(today, 1) : today;
  return `${day}T${clock}:00-03:00`;
}

function resolvePauseUntil(args, now = new Date()) {
  const clock = parseClockTime(args?.until_time) || parseClockTime(args?.ends_at);
  if (clock) return { clock, iso: pauseUntilFromClock(clock, now) };
  const raw = String(args?.ends_at || args?.until_time || '').trim();
  if (!raw) return null;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return { clock: null, iso: parsed.toISOString() };
}

function parseMenuPrice(value) {
  const text = normalizeText(value);
  if (!text) return null;
  if (/\b(sob consulta|consultar)\b/.test(text)) return -1;
  const match = text.replace(/[r$\s]/g, '').match(/-?\d+(?:[.,]\d{1,2})?/);
  if (!match) return null;
  const amount = Number(match[0].replace(',', '.'));
  if (!Number.isFinite(amount)) return null;
  return amount;
}

function normalizeSealList(value) {
  const source = Array.isArray(value)
    ? value
    : String(value || '')
        .split(/[,;]+/)
        .map((part) => part.trim())
        .filter(Boolean);
  const ids = [];
  const unknown = [];
  for (const entry of source) {
    const key = normalizeText(entry);
    if (!key) continue;
    const known = SEAL_CATALOG.find((row) => row.includes(key) || row[0] === key);
    if (known) {
      if (!ids.includes(known[0])) ids.push(known[0]);
    } else if (/^[a-z0-9:_-]+$/.test(key)) {
      if (!ids.includes(key)) ids.push(key);
    } else {
      unknown.push(entry);
    }
  }
  return { ids, unknown };
}

function parseNameList(value) {
  if (Array.isArray(value)) {
    return value.map((name) => String(name || '').trim()).filter(Boolean);
  }
  return String(value || '')
    .split(/\s*(?:,| e | depois | entao )\s*/i)
    .map((name) => name.trim())
    .filter(Boolean);
}

module.exports = {
  SEAL_CATALOG,
  normalizeText,
  parseClockTime,
  parseUntilFromText,
  pauseUntilFromClock,
  resolvePauseUntil,
  parseMenuPrice,
  normalizeSealList,
  parseNameList,
};
