'use strict';

/**
 * Extrai os campos da OS direto do texto do colaborador, sem depender do LLM.
 *
 * Motivo: com tool_choice forçado a Groq devolveu 400 ("Failed to call a
 * function") e, no automático, ela às vezes ignora a tool. Como o pedido de OS
 * costuma vir em uma frase só e bem estruturada, o parser determinístico é mais
 * confiável — mesma decisão que tomamos no fluxo de pausar item do cardápio.
 *
 * Só assume o turno quando encontra os três obrigatórios; senão devolve null e
 * o fluxo normal com o modelo segue.
 */

const MONTHS = {
  janeiro: 1, fevereiro: 2, marco: 3, abril: 4, maio: 5, junho: 6,
  julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12,
};

/**
 * Início do próximo campo. Usado para saber onde termina o valor anterior.
 * Propositalmente tolerante a erros de digitação comuns ("horáros", "promocao").
 */
const SECTION_STOPS = [
  /\bhor[aá]\w*\b/i,
  /\bfuncionamento\b/i,
  /\bvalor(?:es)?\b/i,
  /\bentrada\b/i,
  /\bpromo\w*\b/i,
  /\bbenef\w*\b/i,
  /\bbriefing\b/i,
  /\bparceria\b/i,
  /\bjogos?\b/i,
  /\bcard[aá]pio\b/i,
  // Só negação de campo da OS — "sem lista" nos valores de entrada não corta.
  /\b(?:sem|n[aã]o\s+haver[aá]|n[aã]o\s+possui|n[aã]o\s+vai(?:\s+exibir)?)\s+(?:briefing|parceria|promo\w*|benef\w*|jogo\w*|card[aá]pio)\b/i,
];

/** Corta o trecho no primeiro marcador de próximo campo. */
function cutAtNextSection(value, extraStops = []) {
  const s = String(value || '');
  let cut = s.length;
  for (const stop of [...SECTION_STOPS, ...extraStops]) {
    const m = s.match(stop);
    if (m && m.index != null && m.index > 0 && m.index < cut) cut = m.index;
  }
  let out = s
    .slice(0, cut)
    .replace(/^[\s:,-]+/, '')
    .replace(/[\s.,;]+$/, '')
    .trim();
  // Conectivo pendurado no fim do recorte ("... homens 50, na" → "... homens 50").
  let prev;
  do {
    prev = out;
    out = out.replace(/[\s,;]+(na|no|nas|nos|e|com|de|da|do|para|pra|a|o|em)$/i, '').trim();
  } while (out !== prev);
  return out;
}

/**
 * "sem parceria", "não vai exibir nenhum jogo" → o campo foi negado, não preenchido.
 * Olha a janela imediatamente antes do rótulo.
 */
function negatedBefore(text, index) {
  const janela = String(text || '').slice(Math.max(0, index - 45), index);
  const n = janela
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  return /\b(sem|nao|nenhum|nenhuma|nada\s+de)\b[^.;]{0,30}$/.test(n);
}

function normalize(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/** "29/08", "29/08/2026", "29 de agosto" → data crua para parseFlexibleDate. */
const DATE_RE = /(\d{1,2}\s*\/\s*\d{1,2}(?:\s*\/\s*\d{2,4})?)|(\d{1,2}\s+de\s+[a-zç]+)/i;

function normalizeDateToken(token) {
  const raw = String(token || '').trim();
  const slash = raw.match(/(\d{1,2})\s*\/\s*(\d{1,2})(?:\s*\/\s*(\d{2,4}))?/);
  if (slash) {
    return slash[3] ? `${slash[1]}/${slash[2]}/${slash[3]}` : `${slash[1]}/${slash[2]}`;
  }
  const written = normalize(raw).match(/(\d{1,2})\s+de\s+([a-z]+)/);
  if (written && MONTHS[written[2]]) {
    return `${written[1]}/${MONTHS[written[2]]}`;
  }
  return null;
}

/** Data do evento: prioriza "o evento acontece no dia X". */
function extractDates(text) {
  const t = String(text || '');

  const eventoMatch = t.match(
    /\bevento\b[^.;]{0,40}?\b(?:vai\s+acontecer|acontece|acontecer[aá]|ser[aá]|é|e)?\b[^.;]{0,20}?\bdia\s+([^\s,.;]+)/i
  ) || t.match(/\bevento\b[^.;]{0,40}?(\d{1,2}\s*\/\s*\d{1,2}(?:\s*\/\s*\d{2,4})?)/i);

  const osMatch = t.match(
    /\bO\.?S\.?\b[^.;]{0,30}?\b(?:na\s+data\s+de|na\s+data|data\s+de|do\s+dia|no\s+dia|em)\s+([^\s,.;]+)/i
  );

  const all = [];
  const re = new RegExp(DATE_RE.source, 'gi');
  let m;
  while ((m = re.exec(t)) !== null) {
    const token = normalizeDateToken(m[0]);
    if (token) all.push(token);
  }

  const eventDate = eventoMatch ? normalizeDateToken(eventoMatch[1]) : null;
  const osDate = osMatch ? normalizeDateToken(osMatch[1]) : null;

  if (eventDate) {
    return { eventDate, osDate: osDate && osDate !== eventDate ? osDate : null };
  }
  // Sem "evento em X": uma data só é do evento; duas, a segunda costuma ser o evento.
  if (osDate && all.length > 1) {
    const outra = all.find((d) => d !== osDate);
    return { eventDate: outra || osDate, osDate: outra ? osDate : null };
  }
  return { eventDate: all[0] || null, osDate: null };
}

function extractProjectName(text) {
  const t = String(text || '');
  // Ponto entre caracteres faz parte do nome ("Justa2.0"); ponto final encerra.
  const NAME = '((?:[^,.;\\n]|\\.(?=\\w))+)';
  const m =
    t.match(new RegExp(`\\bnome\\s+do\\s+projeto\\s+(?:é|e|eh|:)?\\s*${NAME}`, 'i')) ||
    t.match(new RegExp(`\\bprojeto\\s+(?:se\\s+chama|chamado|:)\\s*${NAME}`, 'i')) ||
    t.match(new RegExp(`\\bprojeto\\s+(?:é|e)\\s+${NAME}`, 'i'));
  if (!m) return null;
  // Corta no próximo campo e descarta artigo solto no fim ("Justa2.0 os" → "Justa2.0").
  return cutAtNextSection(m[1]).replace(/\s+(os|as|o|a|e|de|da|do)$/i, '').trim() || null;
}

function padHour(h, min) {
  return `${String(Number(h)).padStart(2, '0')}:${min ? String(min).padStart(2, '0') : '00'}`;
}

function isHour(h) {
  const n = Number(h);
  return Number.isFinite(n) && n >= 0 && n <= 23;
}

/** "30/08" não pode virar "30:00 às 08:00": tira datas antes de procurar horários. */
function maskDates(text) {
  return String(text || '')
    .replace(/\d{1,2}\s*\/\s*\d{1,2}(?:\s*\/\s*\d{2,4})?/g, ' ')
    .replace(/\d{1,2}\s+de\s+[a-zà-ú]+/gi, ' ');
}

/** "começar as 17:00 e vai terminar as 05:00" → "17:00 às 05:00". */
function extractWorkingHours(text) {
  const t = maskDates(text);

  const inicio = t.match(
    /\b(?:come[çc]ar?|come[çc]a|in[ií]cio|inicia|abre|abrir|abertura|a\s+partir\s+d[ae]s?)\b[^\d]{0,20}(\d{1,2})(?:[:h](\d{2}))?/i
  );
  const fim = t.match(
    /\b(?:terminar?|termina|t[eé]rmino|encerra|encerrar|fecha|fechar|fechamento|at[eé])\b[^\d]{0,20}(\d{1,2})(?:[:h](\d{2}))?/i
  );
  if (inicio && fim && isHour(inicio[1]) && isHour(fim[1])) {
    return `${padHour(inicio[1], inicio[2])} às ${padHour(fim[1], fim[2])}`;
  }

  const faixa = t.match(
    /\b(\d{1,2})(?:[:h](\d{2}))?\s*(?:h|hs|horas)?\s*(?:[àa]s|as|até|ate|-)\s*(\d{1,2})(?:[:h](\d{2}))?/i
  );
  if (faixa && isHour(faixa[1]) && isHour(faixa[3])) {
    return `${padHour(faixa[1], faixa[2])} às ${padHour(faixa[3], faixa[4])}`;
  }
  return null;
}

/** Recorta o trecho entre um rótulo e o próximo assunto/pontuação. */
function extractSection(text, startRe, negationMarker = null) {
  const t = String(text || '');
  const m = t.match(startRe);
  if (!m) return null;
  // Negado explicitamente: devolve o marcador para o preview não perguntar de novo.
  if (negatedBefore(t, m.index)) return negationMarker;

  const rest = t.slice(m.index + m[0].length);
  return cutAtNextSection(rest, [/(?<=[a-z0-9])\.\s+[A-ZÀ-Ü]/]) || null;
}

/**
 * @returns {null | { event_date, os_date, project_name, working_hours, ticket_values,
 *                    promotions, benefits, menu, briefing, partnership, tv_games }}
 */
function parseOsFromText(text) {
  const t = String(text || '');
  if (!t.trim()) return null;

  const { eventDate, osDate } = extractDates(t);
  const projectName = extractProjectName(t);
  const workingHours = extractWorkingHours(t);

  if (!eventDate || !projectName || !workingHours) return null;

  const ticketValues = extractSection(
    t,
    /\bvalores?\s+(?:de\s+)?entrada\s*(?:é|e|eh|:|s[ãa]o|de)?\s*/i
  );
  const promotions = extractSection(
    t,
    /\b(?:na\s+promo[çc][ãa]o(?:\s+diga\s+que)?|promo[çc][ãa]o\s*:?|promo[çc][õo]es\s*:?)\s*/i,
    'sem promoção'
  );
  const benefits = extractSection(t, /\bbenef[ií]cios?\s*(?::|s[ãa]o|é|e)?\s*/i, 'sem benefícios');
  const menu = extractSection(t, /\bcard[aá]pio\s*(?::|é|e)?\s*/i, 'sem cardápio');
  const briefing = extractSection(t, /\bbriefing\s*(?::|é|e)?\s*/i, 'sem briefing');
  const partnership = extractSection(t, /\bparceria\s*(?::|é|e|com)?\s*/i, 'sem parceria');
  const tvGames = extractSection(
    t,
    /\bjogos?\b[^.;:]{0,30}?(?:tv|televis[ãa]o)?\s*(?::)?\s*/i,
    'sem jogos'
  );

  return {
    event_date: eventDate,
    os_date: osDate,
    project_name: projectName,
    working_hours: workingHours,
    ticket_values: ticketValues,
    promotions,
    benefits,
    menu,
    briefing,
    partnership,
    tv_games: tvGames,
  };
}

/** Rótulos que têm campo próprio na OS; o resto vira campo extra. */
const KNOWN_FIELDS = [
  ['ticket_values', /^(valores?(\s+de\s+entrada)?|entrada|ingressos?|couvert)$/i],
  ['promotions', /^(promo[çc][õo]es|promo[çc][ãa]o)$/i],
  ['benefits', /^(benef[ií]cios?|cortesias?)$/i],
  ['menu', /^(card[aá]pio|menu)$/i],
  ['briefing', /^briefing$/i],
  ['partnership', /^(parceria|parcerias?|patroc[ií]nio)$/i],
  ['tv_games', /^(jogos?(\s+n?a?\s*tv)?|tv)$/i],
];

function knownFieldFor(label) {
  const clean = String(label || '').trim();
  return KNOWN_FIELDS.find(([, re]) => re.test(clean))?.[0] || null;
}

/**
 * Complemento a uma OS já em preview ("o briefing é X", "Open bar: até 20h").
 * Diferente de parseOsFromText, não exige os obrigatórios.
 *
 * @returns {null | { fields: object, extra_fields: string|null }}
 */
function parseOsAmendment(text) {
  const t = String(text || '').trim();
  if (!t) return null;

  const fields = {};
  const extras = [];

  // "Rótulo: valor" separados por ; ou quebra de linha.
  const pares = t
    .split(/[;\n]+/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => p.match(/^([^:]{2,40}):\s*(.+)$/))
    .filter(Boolean);

  for (const [, rawLabel, rawValue] of pares) {
    const label = rawLabel.replace(/^(adiciona\w*|inclui\w*|acrescent\w*|coloca\w*|o|a)\s+/i, '').trim();
    const value = rawValue.trim();
    const known = knownFieldFor(label);
    if (known) fields[known] = value;
    else extras.push(`${label}: ${value}`);
  }

  if (!pares.length) {
    // Sem rótulo explícito: tenta reconhecer os campos conhecidos no texto corrido.
    const porSecao = {
      ticket_values: /\bvalores?\s+(?:de\s+)?entrada\s*(?:é|e|eh|:|s[ãa]o|de)?\s*/i,
      promotions: /\bpromo[çc][ãa]o\s*(?::|é|e|:)?\s*/i,
      benefits: /\bbenef[ií]cios?\s*(?::|s[ãa]o|é|e)?\s*/i,
      menu: /\bcard[aá]pio\s*(?::|é|e)?\s*/i,
      briefing: /\bbriefing\s*(?::|é|e)?\s*/i,
      partnership: /\bparceria\s*(?::|é|e|com)?\s*/i,
      tv_games: /\bjogos?\b[^.;:]{0,30}?(?:tv|televis[ãa]o)?\s*(?::)?\s*/i,
    };
    for (const [key, re] of Object.entries(porSecao)) {
      const v = extractSection(t, re, `sem ${key}`);
      if (v) fields[key] = v;
    }
    if (!Object.keys(fields).length) {
      const livre = t.replace(/^(adiciona\w*|inclui\w*|acrescent\w*|coloca\w*|p[õo]e)\s+/i, '').trim();
      if (livre) extras.push(`Observações: ${livre}`);
    }
  }

  if (!Object.keys(fields).length && !extras.length) return null;
  return { fields, extra_fields: extras.length ? extras.join('; ') : null };
}

module.exports = {
  parseOsFromText,
  parseOsAmendment,
  extractDates,
  extractProjectName,
  extractWorkingHours,
  extractSection,
};
