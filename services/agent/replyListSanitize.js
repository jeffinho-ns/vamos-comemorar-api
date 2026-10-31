const BULLET_LINE = /^\s*[-*•]\s+\S/m;
const NUMBERED_LINE = /^\s*\d+[.)]\s+\S/m;
const HEADING_LINE = /^\s*#{1,6}\s+\S/m;
const FENCE = /```/;
const BOLD = /\*\*/;
const TABLE_LINE = /^\s*\|.+\|\s*$/m;
const RANGE_SOURCE = '\\b\\d{1,2}:\\d{2}\\s*[-–—]\\s*\\d{1,2}:\\d{2}\\b';
const TIME_SOURCE = '\\b(?:[01]?\\d|2[0-3])(?::[0-5]\\d|h(?:[0-5]\\d)?)\\b';

function asText(text) {
  if (typeof text !== 'string') return '';
  return text.trim();
}

function normalizeContext(context) {
  if (!context || typeof context !== 'object') {
    return { workingState: {}, alreadySaidTime: undefined };
  }
  const workingState =
    context.workingState && typeof context.workingState === 'object' ? context.workingState : {};
  return { workingState, alreadySaidTime: context.alreadySaidTime };
}

function countTimes(text) {
  return (String(text).match(new RegExp(TIME_SOURCE, 'gi')) || []).length;
}

function rangeMatches(text) {
  return String(text).match(new RegExp(RANGE_SOURCE, 'g')) || [];
}

function countTimeLines(text) {
  return String(text)
    .split(/\r?\n/)
    .filter((line) => {
      const trimmed = line.trim();
      return trimmed.length > 0 && trimmed.length <= 40 && countTimes(trimmed) > 0;
    }).length;
}

function looksLikeListOrGrid(text) {
  const raw = asText(text);
  if (!raw) return false;
  if (BULLET_LINE.test(raw) || NUMBERED_LINE.test(raw) || HEADING_LINE.test(raw)) return true;
  if (FENCE.test(raw) || BOLD.test(raw) || TABLE_LINE.test(raw)) return true;
  if (rangeMatches(raw).length > 0 || countTimeLines(raw) >= 2) return true;
  return countTimes(raw) >= 3 && /[,;\n]/.test(raw);
}

function parseClock(value) {
  const match = String(value || '').trim().match(/^(\d{1,2})\s*[:hH]\s*(\d{2})?/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = match[2] == null || match[2] === '' ? 0 : Number(match[2]);
  if (!Number.isInteger(hour) || hour > 23 || minute > 59) return null;
  return { hour, minute };
}

function formatSpoken(clock) {
  if (!clock.minute) return `${clock.hour}h`;
  return `${clock.hour}h${String(clock.minute).padStart(2, '0')}`;
}

function resolveSpokenTime(ctx) {
  const explicit = ctx.alreadySaidTime;
  const fromState = ctx.workingState.reservation_time;
  const raw = typeof explicit === 'string' && explicit.trim() ? explicit : fromState;
  const parsed = parseClock(raw);
  if (!parsed) return null;
  return { ...parsed, label: formatSpoken(parsed) };
}

function hasValue(value) {
  if (typeof value === 'number') return Number.isFinite(value) && value > 0;
  return value != null && String(value).trim() !== '';
}

function nextQuestion(workingState) {
  const state = workingState || {};
  if (!hasValue(state.reservation_date) && !hasValue(state.pending_reservation_date_iso)) {
    return 'Pra quando seria a reserva?';
  }
  if (!hasValue(state.quantidade_convidados) && !hasValue(state.number_of_people)) {
    return 'Quantas pessoas vão com você?';
  }
  if (!hasValue(state.client_name) && !hasValue(state.nome)) {
    return 'Me confirma seu nome completo, por favor?';
  }
  if (!hasValue(state.client_email) && !hasValue(state.email)) {
    return 'Qual é o seu e-mail?';
  }
  if (!hasValue(state.data_nascimento) && !hasValue(state.birth_date)) {
    return 'Me passa sua data de nascimento, por favor?';
  }
  return 'Posso seguir com a sua reserva?';
}

function confirmChosenTime(label, workingState) {
  return `Combinado, às ${label}. ${nextQuestion(workingState)}`;
}

function stripMarkup(text) {
  return String(text)
    .replace(/```/g, '')
    .replace(/^\s*#{1,6}\s+/gm, '')
    .replace(/\*\*/g, '')
    .replace(/\|/g, ' ')
    .replace(/^\s*[-*•]\s+/gm, '')
    .replace(/^\s*\d+[.)]\s+/gm, '');
}

function listItems(text) {
  return stripMarkup(text)
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .filter((line) => !/^(hor[aá]rios?|janelas?|op[cç][oõ]es)\s*:?$/i.test(line));
}

function isTimeOnlyItem(item) {
  return /^(\d{1,2}(?::\d{2}|h\d{0,2}))(\s*[-–—]\s*\d{1,2}(?::\d{2}|h\d{0,2}))?$/i.test(
    String(item || '').trim()
  );
}

function isMultiTimeDump(text) {
  const ranges = rangeMatches(text);
  if (ranges.length >= 2) return true;
  const timeItems = listItems(text).filter(isTimeOnlyItem);
  if (timeItems.length >= 2) return true;
  if (ranges.length === 1) {
    const without = text.replace(new RegExp(RANGE_SOURCE, 'g'), ' ');
    if (countTimes(without) > 0) return true;
    if (BULLET_LINE.test(text) || NUMBERED_LINE.test(text)) return true;
    return false;
  }
  if (countTimes(text) >= 3) return true;
  return countTimeLines(text) >= 2;
}

function shouldConfirmChosenTime(text) {
  if (isMultiTimeDump(text) || rangeMatches(text).length > 0 || countTimeLines(text) >= 2) {
    return true;
  }
  const hasMarker =
    BULLET_LINE.test(text) ||
    NUMBERED_LINE.test(text) ||
    BOLD.test(text) ||
    HEADING_LINE.test(text) ||
    FENCE.test(text) ||
    TABLE_LINE.test(text);
  return hasMarker && countTimes(text) > 0;
}

function singleRangeProse(text) {
  const ranges = rangeMatches(text);
  if (ranges.length !== 1) return null;
  if (BULLET_LINE.test(text) || NUMBERED_LINE.test(text)) return null;
  const without = text.replace(new RegExp(RANGE_SOURCE, 'g'), ' ');
  if (countTimes(without) > 0) return null;
  const parts = ranges[0].match(/(\d{1,2}:\d{2})\s*[-–—]\s*(\d{1,2}:\d{2})/);
  if (!parts) return null;
  const start = parseClock(parts[1]);
  const end = parseClock(parts[2]);
  if (!start || !end) return null;
  return `Funcionamos das ${formatSpoken(start)} às ${formatSpoken(end)}.`;
}

function loneTimeQuestion(text) {
  if (rangeMatches(text).length > 0) return null;
  const tokens = String(text).match(new RegExp(TIME_SOURCE, 'gi')) || [];
  if (tokens.length !== 1) return null;
  const parsed = parseClock(tokens[0]);
  if (!parsed) return null;
  return `Pode ser às ${formatSpoken(parsed)} pra você?`;
}

function joinItems(items) {
  const clean = items
    .map((item) => item.replace(/[.!?]+$/g, '').trim())
    .filter(Boolean)
    .filter((item) => !/^(atenciosamente|cordialmente|caro|prezado)\b/i.test(item));
  if (clean.length === 0) return '';
  if (clean.length === 1) {
    const sentence = `${clean[0]}.`;
    return sentence.charAt(0).toUpperCase() + sentence.slice(1);
  }
  const [first, ...rest] = clean;
  const lowered = rest.map((item) => item.charAt(0).toLowerCase() + item.slice(1));
  const head = [first, ...lowered.slice(0, -1)].join(', ');
  const sentence = `${head} e ${lowered[lowered.length - 1]}.`;
  return sentence.charAt(0).toUpperCase() + sentence.slice(1);
}

function limitProse(text) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (!clean) return '';
  const sentences = clean.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [clean];
  const kept = [];
  let questions = 0;
  for (const sentence of sentences) {
    const piece = sentence.trim();
    if (!piece) continue;
    const isQuestion = piece.includes('?');
    if (isQuestion && questions >= 1) continue;
    kept.push(piece);
    if (isQuestion) questions += 1;
    if (kept.length >= 2) break;
  }
  return kept.join(' ').trim();
}

function timeQuestion() {
  return 'Qual horário fica melhor pra você?';
}

function rewriteListToProse(text, context = {}) {
  const trimmed = asText(text);
  if (!trimmed) return '';
  const ctx = normalizeContext(context);
  if (!looksLikeListOrGrid(trimmed)) return trimmed;

  const said = resolveSpokenTime(ctx);
  if (said && shouldConfirmChosenTime(trimmed)) {
    return limitProse(confirmChosenTime(said.label, ctx.workingState));
  }

  const single = singleRangeProse(trimmed);
  if (single) return single;

  if (isMultiTimeDump(trimmed)) return timeQuestion();

  const extras = listItems(trimmed).filter((item) => !isTimeOnlyItem(item));
  if (extras.length === 0) {
    return loneTimeQuestion(trimmed) || timeQuestion();
  }

  const joined = joinItems(extras);
  if (joined && !looksLikeListOrGrid(joined)) return limitProse(joined);
  return timeQuestion();
}

function sanitizeListOrGridReply(text, context = {}) {
  const trimmed = asText(text);
  if (!trimmed) return '';
  const ctx = normalizeContext(context);
  if (!looksLikeListOrGrid(trimmed)) return trimmed;

  const prose = rewriteListToProse(trimmed, ctx);
  if (!prose || looksLikeListOrGrid(prose)) {
    const said = resolveSpokenTime(ctx);
    if (said) return limitProse(confirmChosenTime(said.label, ctx.workingState));
    return timeQuestion();
  }
  return prose;
}

module.exports = {
  looksLikeListOrGrid,
  rewriteListToProse,
  sanitizeListOrGridReply,
};
