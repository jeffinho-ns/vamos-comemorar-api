/**
 * Troca só o nome de área proibido pelo label válido.
 * Não apaga horário nem pessoas da frase.
 */

const { validHighlineLabelForForbiddenName } = require('./highlineReservationAreas');

const HIGHLINE_REPLACEMENTS = [
  { pattern: /terra[cç]o/gi, lookup: 'terraco' },
  { pattern: /[áa]rea\s+vip(?!\s*consum)/gi, lookup: 'area vip' },
  { pattern: /[áa]rea\s+deck\s*-\s*frente/gi, lookup: 'deck frente' },
  { pattern: /[áa]rea\s+deck\s*-\s*esquerdo/gi, lookup: 'deck esquerdo' },
  { pattern: /[áa]rea\s+deck\s*-\s*direito/gi, lookup: 'deck direito' },
];

const STRIP_LEFTOVER = [
  /[áa]rea coberta/gi,
  /[áa]rea descoberta/gi,
  /mezanino/gi,
  /pista interna/gi,
];

function cleanupSpaces(text) {
  return String(text || '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\s+([,.;!?])/g, '$1')
    .replace(/\(\s+/g, '(')
    .replace(/\s+\)/g, ')')
    .trim();
}

function hasUsefulReservationProse(text) {
  const t = String(text || '');
  if (!t.trim()) return false;
  const hasTime =
    /\b\d{1,2}:\d{2}\b/.test(t) ||
    /\b\d{1,2}\s*h(?:oras?)?\b/i.test(t) ||
    /\b(?:às|as)\s+\d{1,2}\b/i.test(t);
  const hasPeople = /\b\d{1,2}\s*(?:pessoas?|pax)\b/i.test(t);
  return hasTime || hasPeople;
}

function replaceHighlineForbiddenNames(text) {
  let out = String(text || '');
  for (const item of HIGHLINE_REPLACEMENTS) {
    const label = validHighlineLabelForForbiddenName(item.lookup);
    if (!label) continue;
    out = out.replace(item.pattern, label);
  }
  const balcaoLabel = validHighlineLabelForForbiddenName('balcao');
  if (balcaoLabel) {
    out = out.replace(/(^|[\s,.;!?(])(balc[aã]o)(?=$|[\s,.;!?)])/gi, `$1${balcaoLabel}`);
  }
  for (const re of STRIP_LEFTOVER) {
    out = out.replace(re, '');
  }
  return cleanupSpaces(out);
}

function sanitizeForbiddenAreaNames(text, establishmentId = null) {
  const source = String(text || '');
  if (!source.trim()) return '';
  const houseId = Number(establishmentId);

  if (houseId === 8) {
    let out = source
      .replace(/terra[cç]o/gi, '')
      .replace(/[áa]rea\s+vip(?!\s*consum)/gi, '')
      .replace(/[áa]rea coberta/gi, '')
      .replace(/[áa]rea descoberta/gi, '')
      .replace(/mezanino/gi, '')
      .replace(/pista interna/gi, '')
      .replace(/[áa]rea\s+deck\s*-\s*(frente|esquerdo|direito)/gi, '');
    return cleanupSpaces(out);
  }

  return replaceHighlineForbiddenNames(source);
}

module.exports = {
  sanitizeForbiddenAreaNames,
  hasUsefulReservationProse,
};
