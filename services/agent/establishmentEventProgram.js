const { looksLikeEventProgramQuestion } = require('./faqTopicCanonical');
const {
  resolveDateFromConversation,
  formatReservationDateLabels,
} = require('../../nlp/dateResolver');

const WEEKDAY_FAQ_TOPIC = {
  0: 'informacoes_domingo',
  2: 'informacoes_terca',
  3: 'informacoes_quarta',
  4: 'informacoes_quinta',
  5: 'informacoes_sexta',
  6: 'informacoes_sabado',
};

const SENSITIVE_TEXT = /\b(cpf|cnpj|ag[eê]ncia|conta corrente|conta poupan[cç]a|cach[eê]|pix do artista|dados banc[aá]rios)\b/i;

function normalizeLoose(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function looksLikeDayProgramQuestion(text) {
  if (looksLikeEventProgramQuestion(text)) return true;
  const normalized = normalizeLoose(text);
  if (!normalized) return false;
  const reservationOnly =
    /\b(reserva|reservar|mesa|mesas)\b/.test(normalized) &&
    !/\b(o que|programacao|evento|atracao|atração|artista)\b/.test(normalized);
  if (reservationOnly) return false;
  const asksAbout = /\b(quero saber|me fala|me conta|como vai ser|o que rola)\b/.test(normalized);
  const hasDay =
    /\b(hoje|amanha|proximo|proxima|segunda|terca|quarta|quinta|sexta|sabado|domingo)\b/.test(
      normalized
    );
  return asksAbout && hasDay;
}

function weekdayIndexFromIso(isoDate) {
  const iso = String(isoDate || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const noon = new Date(`${iso}T12:00:00-03:00`);
  const short = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    weekday: 'short',
  }).format(noon);
  const map = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return map[short] ?? null;
}

function weekdayFaqTopicForIso(isoDate) {
  const index = weekdayIndexFromIso(isoDate);
  return WEEKDAY_FAQ_TOPIC[index] || '';
}

function cleanText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function safePublicText(value) {
  const text = cleanText(value);
  if (!text || SENSITIVE_TEXT.test(text)) return '';
  if (text.length <= 320) return text;
  return `${text.slice(0, 317).trim()}...`;
}

function formatClock(value) {
  const match = String(value || '').match(/(\d{1,2}):(\d{2})/);
  if (!match) return '';
  const hour = String(Number(match[1]));
  return match[2] === '00' ? `${hour}h` : `${hour}h${match[2]}`;
}

function formatBrl(value) {
  if (value === null || value === undefined || value === '') return '';
  const numeric = Number(String(value).replace(/\s/g, '').replace(',', '.'));
  if (!Number.isFinite(numeric) || numeric <= 0) return cleanText(value);
  return numeric.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function includesLoose(text, snippet) {
  const haystack = normalizeLoose(text).replace(/\s/g, '');
  const needle = normalizeLoose(snippet).replace(/\s/g, '');
  if (!haystack || !needle) return false;
  return haystack.includes(needle.slice(0, 8));
}

function baseEvent(row) {
  return {
    id: Number(row.id),
    name: cleanText(row.nome_do_evento),
    timeLabel: formatClock(row.hora_do_evento),
    description: safePublicText(row.descricao),
    observation: safePublicText(row.observacao),
    entryPrice: formatBrl(row.valor_da_entrada),
    gift: safePublicText(row.brinde),
    attractions: [],
    artisticAttraction: safePublicText(row.artistic_attraction),
    showSchedule: safePublicText(row.show_schedule),
    ticketPrices: safePublicText(row.ticket_prices),
    promotions: safePublicText(row.promotions),
  };
}

function withAttraction(event, row) {
  const name = cleanText(row.nome_atracao);
  if (!name || event.attractions.some((item) => item.name === name)) return event;
  return {
    ...event,
    attractions: [
      ...event.attractions,
      {
        name,
        start: formatClock(row.horario_inicio),
        end: formatClock(row.horario_termino),
      },
    ],
  };
}

function groupEventRows(rows) {
  return (rows || []).reduce((events, row) => {
    if (!cleanText(row?.nome_do_evento)) return events;
    const id = Number(row.id);
    const current = events.find((item) => item.id === id);
    if (!current) return [...events, withAttraction(baseEvent(row), row)];
    return events.map((item) => (item.id === id ? withAttraction(item, row) : item));
  }, []);
}

function houseFilter(includeName) {
  if (!includeName) return 'e.id_place = $1';
  return '(e.id_place = $1 OR lower(trim(e.casa_do_evento)) = lower(trim($4)))';
}

function eventDateFilter() {
  return `(
        (e.data_do_evento IS NOT NULL AND e.data_do_evento::date = $2::date)
        OR (
          e.tipo_evento = 'semanal'
          AND e.dia_da_semana = $3
          AND e.data_do_evento IS NULL
        )
      )`;
}

function buildEventProgramSql(includeName, withDetails) {
  const joins = withDetails
    ? `LEFT JOIN evento_atracoes a ON a.evento_id = e.id
       LEFT JOIN LATERAL (
         SELECT artistic_attraction, show_schedule, ticket_prices, promotions
           FROM operational_details
          WHERE establishment_id = $1
            AND (is_active = TRUE OR is_active = 1)
            AND (
              event_id = e.id
              OR (event_id IS NULL AND event_date::date = $2::date)
            )
          ORDER BY CASE WHEN event_id = e.id THEN 0 ELSE 1 END,
                   updated_at DESC NULLS LAST
          LIMIT 1
       ) od ON TRUE`
    : 'LEFT JOIN evento_atracoes a ON a.evento_id = e.id';
  const detailColumns = withDetails
    ? 'od.artistic_attraction, od.show_schedule, od.ticket_prices, od.promotions'
    : 'NULL::text AS artistic_attraction, NULL::text AS show_schedule, NULL::text AS ticket_prices, NULL::text AS promotions';
  return `
    SELECT e.id, e.nome_do_evento, e.hora_do_evento, e.descricao, e.observacao,
           e.valor_da_entrada, e.brinde,
           a.nome_atracao, a.horario_inicio, a.horario_termino,
           ${detailColumns}
      FROM eventos e
      ${joins}
     WHERE ${houseFilter(includeName)}
       AND ${eventDateFilter()}
     ORDER BY CASE WHEN e.data_do_evento IS NOT NULL THEN 0 ELSE 1 END,
              e.hora_do_evento ASC NULLS LAST,
              a.horario_inicio ASC NULLS LAST
     LIMIT 40
  `;
}

async function queryEvents(pool, sql, params) {
  const result = await pool.query(sql, params);
  return result?.rows || [];
}

async function loadPublicEventsForDate(pool, { establishmentId, establishmentName, isoDate } = {}) {
  const establishment = Number(establishmentId);
  const iso = String(isoDate || '').slice(0, 10);
  const weekday = weekdayIndexFromIso(iso);
  if (!pool || !Number.isFinite(establishment) || establishment <= 0 || !iso || weekday === null) {
    return [];
  }
  const name = cleanText(establishmentName);
  const includeName = name.length > 2;
  const params = includeName ? [establishment, iso, weekday, name] : [establishment, iso, weekday];
  try {
    const rows = await queryEvents(pool, buildEventProgramSql(includeName, true), params);
    return groupEventRows(rows);
  } catch (error) {
    console.warn(
      `[eventProgram] consulta completa falhou establishment_id=${establishment} date=${iso}:`,
      error.message
    );
  }
  try {
    const rows = await queryEvents(pool, buildEventProgramSql(includeName, false), params);
    return groupEventRows(rows);
  } catch (error) {
    console.warn(
      `[eventProgram] consulta de eventos falhou establishment_id=${establishment} date=${iso}:`,
      error.message
    );
    return [];
  }
}

function artistPhrase(event) {
  const fromShows = (event.attractions || []).map((item) => {
    if (item.start && item.end) return `${item.name}, das ${item.start} às ${item.end}`;
    if (item.start) return `${item.name}, a partir das ${item.start}`;
    return item.name;
  });
  const namedAttraction = safePublicText(event.artisticAttraction);
  const names = fromShows.length ? fromShows : namedAttraction ? [namedAttraction] : [];
  if (!names.length) return '';
  if (names.length === 1) return `A atração é ${names[0]}.`;
  const last = names[names.length - 1];
  return `As atrações são ${names.slice(0, -1).join(', ')} e ${last}.`;
}

function detailSentences(event) {
  const note = safePublicText(event.observation) || safePublicText(event.description) || '';
  const sentences = [];
  if (note) sentences.push(`Na observação está: ${note}.`);
  if (event.showSchedule && !(event.attractions || []).some((item) => item.start)) {
    sentences.push(`O horário do show é ${event.showSchedule}.`);
  }
  if (event.entryPrice && !includesLoose(note, event.entryPrice)) {
    sentences.push(`A entrada é ${event.entryPrice}.`);
  }
  if (event.ticketPrices && !includesLoose(note, event.ticketPrices)) {
    sentences.push(`Os valores divulgados são ${event.ticketPrices}.`);
  }
  if (event.promotions && !includesLoose(`${note} ${event.ticketPrices}`, event.promotions)) {
    const promo = event.promotions.endsWith('.') ? event.promotions : `${event.promotions}.`;
    sentences.push(promo);
  }
  if (event.gift) sentences.push(`Tem brinde: ${event.gift}.`);
  return sentences;
}

function formatEventSentence(event, index) {
  if (!event?.name) return '';
  const verb = index === 0 ? 'O evento é' : 'Também tem';
  const when = event.timeLabel ? `, a partir das ${event.timeLabel}` : '';
  return [`${verb} ${event.name}${when}.`, artistPhrase(event), ...detailSentences(event)]
    .filter(Boolean)
    .join(' ');
}

function openingLine(program) {
  const label = program?.label || 'nesse dia';
  if (program?.source === 'amanha') return `Amanhã é ${label}.`;
  if (program?.source === 'hoje') return `Hoje é ${label}.`;
  return `É ${label}.`;
}

function formatEventProgramReply(program) {
  const events = program?.events || [];
  if (!events.length) return '';
  const body = events.map(formatEventSentence).filter(Boolean).join(' ');
  if (!body) return '';
  return `${openingLine(program)} ${body}`.replace(/\s+/g, ' ').trim();
}

function formatEventProgramPromptBlock(program) {
  if (!program?.iso) return '';
  const when = program.label || program.iso;
  if (!program.events?.length) {
    return [
      'PROGRAMAÇÃO REAL DO DIA:',
      `Não há evento cadastrado em Funcionamento para ${when}.`,
      'Não invente artista, preço ou observação. Diga que vai confirmar com a equipe.',
    ].join('\n');
  }
  const lines = program.events.map((event, index) => formatEventSentence(event, index)).filter(Boolean);
  return [
    'PROGRAMAÇÃO REAL DO DIA (cadastro de Funcionamento; vence o texto genérico do dia da semana):',
    `Data: ${when}.`,
    ...lines,
    'Não invente artista, preço ou observação fora deste bloco. Não cite contrato, cachê, CPF ou dados bancários.',
  ].join('\n');
}

async function resolveDayProgram({
  pool,
  establishmentId,
  establishmentName,
  userText,
  messageHistory,
} = {}) {
  if (!looksLikeDayProgramQuestion(userText)) return null;
  const parsed = resolveDateFromConversation(userText, messageHistory);
  if (!parsed?.ok || !parsed.iso) return null;
  const labels = formatReservationDateLabels(parsed.iso);
  const events = await loadPublicEventsForDate(pool, {
    establishmentId,
    establishmentName,
    isoDate: parsed.iso,
  });
  console.log(
    `[eventProgram] establishment_id=${establishmentId} date=${parsed.iso} events=${events.length}`
  );
  return {
    iso: parsed.iso,
    source: parsed.source,
    label: labels.confirmationPhrase || labels.weekdayWithDate || parsed.iso,
    events,
  };
}

module.exports = {
  looksLikeDayProgramQuestion,
  weekdayIndexFromIso,
  weekdayFaqTopicForIso,
  formatEventProgramReply,
  formatEventProgramPromptBlock,
  loadPublicEventsForDate,
  resolveDayProgram,
};
