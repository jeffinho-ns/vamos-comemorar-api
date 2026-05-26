const { parsePtBrDateFromText } = require('../conversationEngine/helpers');
const { looksLikeReservationIntent, isAffirmativeConfirmation } = require('./reservationDateHint');
const {
  buildCollectBundlePrompt,
  BUNDLE_FIELD_ORDER,
  OBSERVATIONS_STEP,
  getStepPrompt,
} = require('../stateManager/conversationSteps');

/**
 * Detecta a mensagem padronizada gerada por anúncio/tráfego pago.
 * Ex.: "Olá! Quero fazer uma reserva no HighLine.", "Quero fazer uma reserva
 * no Pracinha", etc. São mensagens curtas que só anunciam a intenção sem
 * dar nenhum dado real — é o lead frio que precisa ser puxado para conversa.
 */
function looksLikeAdEntryGreeting(text) {
  const raw = String(text || '').trim();
  if (!raw) return false;
  if (raw.length > 120) return false;
  const normalized = raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[!.?]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!normalized) return false;

  const askingReservation =
    /\b(quero|gostaria|preciso|posso|consigo)\b.*\b(fazer (uma )?reserva|reservar|reserva)\b/.test(
      normalized
    ) ||
    /\bfazer (uma )?reserva\b/.test(normalized) ||
    /\bquero (uma )?reserva\b/.test(normalized);

  const hasNoRealData =
    !/\d/.test(normalized) &&
    !/\b(hoje|amanha|amanhã|sexta|sabado|sábado|domingo|segunda|terca|terça|quarta|quinta|aniversario|aniversário|niver|jantar|almoco|almoço|brunch)\b/.test(
      normalized
    );

  return askingReservation && hasNoRealData;
}

function isFirstUserMessageInConversation(messageHistory = []) {
  const userTurns = (messageHistory || []).filter((msg) => msg?.role === 'user');
  return userTurns.length <= 1;
}

function extractFirstName(text) {
  const raw = String(text || '').trim();
  if (!raw) return '';
  const first = raw.split(/\s+/)[0] || '';
  if (!first) return '';
  if (first.length < 2 || first.length > 20) return '';
  if (!/^[a-zA-ZÀ-ÿ'.-]+$/.test(first)) return '';
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
}

const MISSING_FIELD_PROMPTS = {
  establishment_id: 'Qual casa você prefere?',
  reservation_date: 'Para qual data?',
  reservation_time: 'Qual horário?',
  quantidade_convidados: 'Quantas pessoas?',
  client_name: 'Qual seu nome completo?',
  client_email: 'Qual seu e-mail?',
  data_nascimento: 'Qual sua data de nascimento? (DD/MM/AAAA)',
  area_id: 'Tem preferência de área? Se não, eu escolho a melhor disponível.',
};

const RESERVATION_FIELD_ORDER = [
  'establishment_id',
  'reservation_date',
  'reservation_time',
  'quantidade_convidados',
  'client_name',
  'client_email',
  'data_nascimento',
];

function hasFieldValue(state, key) {
  const value = state[key];
  if (value === undefined || value === null || value === '') return false;
  if (['establishment_id', 'quantidade_convidados', 'area_id'].includes(key)) {
    const n = Number(value);
    return Number.isFinite(n) && n > 0;
  }
  return true;
}

function conversationHasReservationIntent(messageHistory = [], lookback = 12) {
  const slice = (messageHistory || []).slice(-lookback);
  for (const msg of slice) {
    if (msg?.role !== 'user') continue;
    if (looksLikeReservationIntent(String(msg.content || ''))) return true;
  }
  return false;
}

function isReservationFunnelInProgress(workingState = {}, messageHistory = []) {
  const state = workingState && typeof workingState === 'object' ? workingState : {};
  const hasEstablishment = hasFieldValue(state, 'establishment_id');
  const hasDate =
    hasFieldValue(state, 'reservation_date') || Boolean(state.pending_reservation_date_iso);
  if (hasEstablishment && hasDate) return true;

  const filledCount = RESERVATION_FIELD_ORDER.filter((key) => hasFieldValue(state, key)).length;
  if (filledCount >= 2 && conversationHasReservationIntent(messageHistory)) return true;

  if (hasEstablishment && conversationHasReservationIntent(messageHistory, 6)) return true;

  return false;
}

function shouldSkipFaqFirst(workingState = {}, messageHistory = [], userText = '') {
  if (isReservationFunnelInProgress(workingState, messageHistory)) return true;
  if (looksLikeReservationIntent(userText) && getReservationMissingFields(workingState).length < 7) {
    return true;
  }
  return false;
}

function getReservationMissingFields(workingState = {}) {
  const state = workingState && typeof workingState === 'object' ? workingState : {};
  const missing = [];
  for (const key of RESERVATION_FIELD_ORDER) {
    if (!hasFieldValue(state, key)) missing.push(key);
  }
  if (!hasFieldValue(state, 'reservation_date') && state.pending_reservation_date_iso) {
    const idx = missing.indexOf('reservation_date');
    if (idx >= 0) missing[idx] = 'reservation_date_confirm';
  }
  return missing;
}

function buildNextFieldQuestion(workingState = {}, options = {}) {
  const missing = getReservationMissingFields(workingState);
  if (missing.includes('reservation_date_confirm')) {
    const label = workingState.pending_reservation_date_label || workingState.pending_reservation_date_iso;
    return `Só confirmando: é para ${label}? (sim/não)`;
  }
  if (missing.length === 0) {
    return getStepPrompt(OBSERVATIONS_STEP);
  }
  if (missing.length >= 2 || missing.some((key) => BUNDLE_FIELD_ORDER.includes(key))) {
    return buildCollectBundlePrompt(workingState, options);
  }
  const first = missing[0];
  return MISSING_FIELD_PROMPTS[first] || buildCollectBundlePrompt(workingState, options);
}

function buildReservationFunnelPromptBlock(workingState = {}, messageHistory = []) {
  if (!isReservationFunnelInProgress(workingState, messageHistory)) return '';

  const missing = getReservationMissingFields(workingState);
  const collected = RESERVATION_FIELD_ORDER.filter((key) => hasFieldValue(workingState, key)).map(
    (key) => `${key}=${workingState[key]}`
  );

  const lines = [
    'FUNIL DE RESERVA ATIVO (prioridade máxima nesta conversa):',
    '- O cliente já está cadastrando reserva. NÃO desvie para FAQ genérica nem encerre sem registrar.',
    '- Peça os dados da reserva em UM bloco só (data, horário, pessoas, nome, e-mail, nascimento) — não interrogatório campo a campo.',
    '- Depois de coletar os dados, pergunte se há observações para o painel antes de criar_pre_reserva.',
    '- Quando tiver tudo validado (incluindo observações perguntadas), chame criar_pre_reserva.',
    '- Se já verificou disponibilidade com vaga, avance para o próximo dado faltante ou registre.',
    '- Nunca diga que a reserva está feita sem chamar criar_pre_reserva com sucesso.',
  ];

  if (collected.length) {
    lines.push(`- Dados já conhecidos: ${collected.join('; ')}.`);
  }
  if (missing.length) {
    const labels = missing.map((m) => MISSING_FIELD_PROMPTS[m] || m).join(' | ');
    lines.push(`- Ainda falta: ${labels}`);
    lines.push(`- Próximo passo sugerido: ${buildNextFieldQuestion(workingState)}`);
  } else {
    lines.push('- Todos os campos obrigatórios parecem preenchidos: chame criar_pre_reserva agora.');
  }

  return lines.join('\n');
}

function assistantAskedForReservationTime(messageHistory = []) {
  const lastAssistant = [...(messageHistory || [])]
    .reverse()
    .find((msg) => msg?.role === 'assistant');
  const normalized = String(lastAssistant?.content || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  if (!normalized) return false;
  return /\b(horario|horarios|qual hora|que horas|fica melhor|prefere as)\b/.test(normalized);
}

function normalizeTimeHHmm(text, options = {}) {
  const raw = String(text || '').trim();
  const allowBareHour = options.allowBareHour === true;

  if (allowBareHour && /^\d{1,2}$/.test(raw)) {
    const h = Number(raw);
    if (h >= 0 && h <= 23) {
      return `${String(h).padStart(2, '0')}:00`;
    }
  }

  let match = raw.match(/\b(\d{1,2})\s*[:h]\s*(\d{2})\b/i);
  if (match) {
    const h = Math.min(23, Number(match[1]));
    const m = Math.min(59, Number(match[2]));
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
  match = raw.match(/\b(\d{1,2})\s*h\b/i);
  if (match) {
    const h = Math.min(23, Number(match[1]));
    return `${String(h).padStart(2, '0')}:00`;
  }
  return null;
}

function buildAvailabilityFingerprint(workingState = {}, context = {}) {
  const establishmentId = Number(
    workingState.establishment_id || context.lockedEstablishmentId
  );
  const reservationDate = String(
    workingState.reservation_date || workingState.pending_reservation_date_iso || ''
  ).slice(0, 10);
  const partySize = Number(workingState.quantidade_convidados);
  if (!establishmentId || !reservationDate || !partySize) return null;
  return `${establishmentId}|${reservationDate}|${partySize}`;
}

function parseReservationFieldsFromUserText(userText, workingState = {}, messageHistory = []) {
  const text = String(userText || '').trim();
  const patch = {};
  if (!text) return patch;

  const missingForTime = getReservationMissingFields(workingState);
  const allowBareHour =
    !hasFieldValue(workingState, 'reservation_time') &&
    (assistantAskedForReservationTime(messageHistory) ||
      missingForTime.includes('reservation_time') ||
      missingForTime.length >= 2);
  const time = normalizeTimeHHmm(text, { allowBareHour });
  if (time && !hasFieldValue(workingState, 'reservation_time')) {
    patch.reservation_time = time;
  }

  const emailMatch = text.match(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i);
  if (emailMatch && !hasFieldValue(workingState, 'client_email')) {
    patch.client_email = emailMatch[0].toLowerCase();
  }

  const partyMatch =
    text.match(/\b(\d{1,3})\s*(pessoas?|convidados?|pax)\b/i) ||
    text.match(/\b(\d{1,3})\s+pessoas?\b/i);
  if (partyMatch && !hasFieldValue(workingState, 'quantidade_convidados')) {
    const n = Number(partyMatch[1]);
    if (n > 0 && n <= 200) patch.quantidade_convidados = n;
  }

  const dateParsed = parsePtBrDateFromText(text);
  if (dateParsed?.iso && !hasFieldValue(workingState, 'reservation_date')) {
    patch.reservation_date = dateParsed.iso;
    patch.reservation_date_confirmed = true;
    patch.pending_reservation_date_iso = null;
    patch.pending_reservation_date_label = null;
  }

  const birthParsed = parsePtBrDateFromText(text);
  if (
    birthParsed?.iso &&
    !hasFieldValue(workingState, 'data_nascimento') &&
    /\bnasc|\d{1,2}[\/-]\d{1,2}/i.test(text)
  ) {
    patch.data_nascimento = birthParsed.iso;
  }

  if (
    !hasFieldValue(workingState, 'client_name') &&
    !emailMatch &&
    !time &&
    !partyMatch &&
    text.length >= 3 &&
    text.length <= 60 &&
    /^[a-zA-ZÀ-ÿ\s'.-]+$/.test(text) &&
    text.split(/\s+/).length >= 2
  ) {
    patch.client_name = text
      .split(/\s+/)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(' ');
  }

  if (isAffirmativeConfirmation(text) && workingState.pending_reservation_date_iso) {
    patch.reservation_date = workingState.pending_reservation_date_iso;
    patch.reservation_date_confirmed = true;
    patch.pending_reservation_date_iso = null;
    patch.pending_reservation_date_label = null;
  }

  return patch;
}

function mergeContactHintsIntoWorkingState(workingState = {}, contact = {}) {
  const next = { ...workingState };
  if (!hasFieldValue(next, 'client_email') && contact?.client_email) {
    next.client_email = String(contact.client_email).trim().toLowerCase();
  }
  if (!hasFieldValue(next, 'client_name') && contact?.contact_name) {
    next.client_name = String(contact.contact_name).trim();
  }
  if (!hasFieldValue(next, 'data_nascimento') && contact?.birth_date) {
    const bd = String(contact.birth_date).slice(0, 10);
    if (bd) next.data_nascimento = bd;
  }
  return next;
}

function looksLikeDeferredAvailabilityCheck(text) {
  const normalized = String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  if (!normalized) return false;
  const defers =
    /\b(vou verificar|vou consultar|vou checar|deixa eu verificar|deixa eu consultar|um momento|aguarde|ja volto|já volto|ja retorno|já retorno)\b/.test(
      normalized
    );
  const aboutBooking =
    /\b(disponibil|vaga|horarios?|reservas?|mesas?|pessoas?)\b/.test(normalized) ||
    /\d{1,2}[\/-]\d{1,2}/.test(normalized);
  return defers && aboutBooking;
}

function canAutoCheckAvailability(workingState = {}, context = {}) {
  const establishmentId = Number(
    workingState.establishment_id || context.lockedEstablishmentId
  );
  const reservationDate = String(
    workingState.reservation_date || workingState.pending_reservation_date_iso || ''
  ).slice(0, 10);
  const partySize = Number(workingState.quantidade_convidados);
  return (
    Number.isFinite(establishmentId) &&
    establishmentId > 0 &&
    /^\d{4}-\d{2}-\d{2}$/.test(reservationDate) &&
    Number.isFinite(partySize) &&
    partySize > 0
  );
}

function looksLikeTimeOnlyAnswer(userText, workingState = {}, messageHistory = []) {
  const patch = parseReservationFieldsFromUserText(userText, workingState, messageHistory);
  return Boolean(patch.reservation_time) && String(userText || '').trim().length <= 8;
}

function shouldAutoRunAvailabilityCheck(
  workingState,
  context,
  toolTrace = [],
  draftReply = '',
  userText = '',
  messageHistory = []
) {
  if (!canAutoCheckAvailability(workingState, context)) return false;
  if (looksLikeTimeOnlyAnswer(userText, workingState, messageHistory)) return false;

  const fingerprint = buildAvailabilityFingerprint(workingState, context);
  const alreadyChecked =
    fingerprint && String(workingState.availability_checked_for || '') === fingerprint;

  if (looksLikeDeferredAvailabilityCheck(draftReply)) return true;
  if (alreadyChecked) return false;

  const ranCheckThisTurn = (toolTrace || []).some(
    (entry) => entry?.name === 'verificar_disponibilidade'
  );
  if (!ranCheckThisTurn && isReservationFunnelInProgress(workingState, messageHistory)) {
    return true;
  }
  return false;
}

function buildAvailabilityCheckedPatch(workingState = {}, context = {}, toolResult = {}) {
  const fingerprint = buildAvailabilityFingerprint(workingState, context);
  if (!fingerprint || !toolResult || toolResult.ok === false) return {};
  return { availability_checked_for: fingerprint };
}

function inferAvailabilityCheckedFromHistory(workingState = {}, messageHistory = [], context = {}) {
  if (workingState.availability_checked_for) return workingState;
  const lastAssistant = [...(messageHistory || [])]
    .reverse()
    .find((msg) => msg?.role === 'assistant');
  const normalized = String(lastAssistant?.content || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  if (!/\b(temos horarios|horarios:|qual horario fica melhor)\b/.test(normalized)) {
    return workingState;
  }
  const fingerprint = buildAvailabilityFingerprint(workingState, context);
  if (!fingerprint) return workingState;
  return { ...workingState, availability_checked_for: fingerprint };
}

function tryAdvanceFunnelFromUserMessage(workingState = {}, userText = '', messageHistory = []) {
  const patch = parseReservationFieldsFromUserText(userText, workingState, messageHistory);
  if (!patch.reservation_time) return null;

  const nextState = { ...workingState, ...patch };
  const fingerprint = buildAvailabilityFingerprint(nextState, {});
  if (!fingerprint || String(workingState.availability_checked_for || '') !== fingerprint) {
    return null;
  }

  const timeKey = `${fingerprint}|${patch.reservation_time}`;
  if (String(workingState.availability_time_checked_for || '') === timeKey) {
    const missing = getReservationMissingFields(nextState);
    if (missing.length === 0) {
      return {
        workingState: nextState,
        replyText: buildNextFieldQuestion(nextState),
      };
    }
    if (missing[0] === 'reservation_time') return null;
    return {
      workingState: nextState,
      replyText: buildNextFieldQuestion(nextState),
    };
  }

  const [hour, minute] = patch.reservation_time.split(':');
  const timeLabel = minute === '00' ? `${Number(hour)}h` : patch.reservation_time;
  const missing = getReservationMissingFields(nextState);
  const nextPrompt =
    missing.length > 0 && missing[0] !== 'reservation_time'
      ? buildNextFieldQuestion(nextState)
      : null;

  return {
    workingState: {
      ...nextState,
      availability_time_checked_for: timeKey,
    },
    replyText: nextPrompt
      ? `Perfeito, ${timeLabel} anotado. ${nextPrompt}`
      : `Perfeito, ${timeLabel} anotado. Vou registrar sua reserva agora.`,
  };
}

module.exports = {
  isReservationFunnelInProgress,
  shouldSkipFaqFirst,
  getReservationMissingFields,
  buildReservationFunnelPromptBlock,
  buildNextFieldQuestion,
  parseReservationFieldsFromUserText,
  mergeContactHintsIntoWorkingState,
  looksLikeDeferredAvailabilityCheck,
  canAutoCheckAvailability,
  shouldAutoRunAvailabilityCheck,
  buildAvailabilityFingerprint,
  buildAvailabilityCheckedPatch,
  tryAdvanceFunnelFromUserMessage,
  inferAvailabilityCheckedFromHistory,
  assistantAskedForReservationTime,
  looksLikeAdEntryGreeting,
  isFirstUserMessageInConversation,
  extractFirstName,
};
