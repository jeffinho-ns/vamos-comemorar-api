const { parsePtBrDateFromText } = require('../conversationEngine/helpers');
const { looksLikeReservationIntent, isAffirmativeConfirmation } = require('./reservationDateHint');
const {
  isInformationalFaqTurn,
  looksLikeEventProgramQuestion,
} = require('./faqTopicCanonical');
const {
  buildCollectBundlePrompt,
  BUNDLE_FIELD_ORDER,
  OBSERVATIONS_STEP,
  getStepPrompt,
} = require('../stateManager/conversationSteps');
const { resolveHighlineSubarea } = require('./highlineReservationAreas');
const { resolveJustinoGuestZone, resolveJustinoSubarea, guestZoneLabel } = require('./seuJustinoReservationAreas');
const { resolvePracinhaGuestArea } = require('./pracinhaReservationAreas');

/**
 * Detecta a mensagem padronizada gerada por anúncio/tráfego pago.
 * Ex.: "Olá! Quero fazer uma reserva no HighLine.", "Quero fazer uma reserva
 * no Pracinha", etc. São mensagens curtas que só anunciam a intenção sem
 * dar nenhum dado real — é o lead frio que precisa ser puxado para conversa.
 */
function normalizeForGreetingDetection(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[!.?,]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function looksLikeAdEntryGreeting(text) {
  const raw = String(text || '').trim();
  if (!raw) return false;
  if (raw.length > 160) return false;
  const normalized = normalizeForGreetingDetection(raw);
  if (!normalized) return false;

  const askingReservation =
    /\b(quero|gostaria|preciso|posso|consigo|pode|poderia|me ajude|me ajuda|ajude-me|ajuda)\b.*\b(fazer (uma )?reserva|reservar|reserva|reservas)\b/.test(
      normalized
    ) ||
    /\b(fazer|nova|uma) (uma )?reserva\b/.test(normalized) ||
    /\bquero (uma )?reserva\b/.test(normalized) ||
    /\breservar\b/.test(normalized);

  const hasNoRealData =
    !/\d/.test(normalized) &&
    !/\b(hoje|amanha|amanhã|sexta|sabado|sábado|domingo|segunda|terca|terça|quarta|quinta|aniversario|aniversário|niver|jantar|almoco|almoço|brunch)\b/.test(
      normalized
    );

  return askingReservation && hasNoRealData;
}

/**
 * Detecta o cumprimento do cliente (oi/boa noite/bom dia/boa tarde) — usado
 * para fazer a IA ECOAR a saudação na primeira resposta. Captura saudações
 * combinadas com intenção de reserva ("boa noite, me ajude com uma reserva").
 */
/**
 * Detecta quando o cliente está apontando erro na confirmação anterior da IA
 * (data, ano, área, quantidade etc.). Quando isso acontece, o agente DEVE
 * resetar o estado de confirmação e pedir desculpas antes de tentar novamente.
 */
function detectClientCorrectingPreviousReply(text) {
  const normalized = normalizeForGreetingDetection(text);
  if (!normalized) return null;
  // Padrões: "errou", "está errado", "data errada", "não estamos em 2027",
  // "não é esse ano", "ano errado", "veja a data", "ainda não chegou em".
  const dateError =
    /\b(errou|esta? errad|data errada|ano errado|nao (estamos|chegou)|ainda nao (estamos|e)|ano (errad|de) 20\d{2})\b/.test(
      normalized
    ) ||
    /\bnao e (esse|esta|essa)\b/.test(normalized) ||
    /\bdata (esta|ta|t[áa]) errada\b/.test(normalized);
  if (dateError) {
    return { kind: 'date_error', text };
  }
  const generalCorrection =
    /\bvc errou\b|\bvoce errou\b|\bnao foi (isso|esse|essa|esses)\b|\bnao e (isso|esse|essa)\b|\bcorrige\b|\bcorrigir\b/.test(
      normalized
    );
  if (generalCorrection) {
    return { kind: 'general_correction', text };
  }
  return null;
}

function detectOpeningGreeting(text) {
  const normalized = normalizeForGreetingDetection(text);
  if (!normalized) return null;
  if (/\bboa noite\b/.test(normalized)) return 'Boa noite';
  if (/\bboa tarde\b/.test(normalized)) return 'Boa tarde';
  if (/\bbom dia\b/.test(normalized)) return 'Bom dia';
  if (/^(oi|ola|olá|opa|e ai|eai|hey|hi|hello)\b/.test(normalized)) return 'Oi';
  return null;
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
  if (first.length < 3 || first.length > 20) return '';
  if (/[-_0-9]/.test(first)) return '';
  if (!/^[a-zA-ZÀ-ÿ']+$/.test(first)) return '';
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
}

function prefixReplyWithContactName(replyText, { messageHistory = [], contactName = '' } = {}) {
  const userTurns = (messageHistory || []).filter((msg) => msg?.role === 'user');
  if (userTurns.length > 1) return String(replyText || '').trim();
  const firstName = extractFirstName(contactName);
  const text = String(replyText || '').trim();
  if (!firstName || !text) return text;
  const normalizedReply = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const normalizedName = firstName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (normalizedReply.includes(normalizedName)) return text;
  if (/^(oi|ola|opa|bom dia|boa tarde|boa noite)\b/.test(normalizedReply)) {
    return text.replace(/^(oi|ol[aá]|opa)\b[!.,\s]*/i, `Oi, ${firstName}! `);
  }
  return `Oi, ${firstName}! ${text}`;
}

function parseCompactBirthIso(text) {
  const match = String(text || '').match(/(?:^|\D)(\d{2})(\d{2})(\d{4})(?:\D|$)/);
  if (!match) return '';
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return '';
  const currentYear = new Date().getFullYear();
  if (year < 1900 || year > currentYear) return '';
  const check = new Date(Date.UTC(year, month - 1, day));
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    return '';
  }
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function extractFullNameBeforeEmail(text) {
  const source = String(text || '');
  const email = source.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  if (!email || email.index == null) return '';
  const before = source.slice(0, email.index).replace(/[,:;|/]+/g, ' ').trim();
  const words = before.split(/\s+/).filter((word) => /^[A-Za-zÀ-ÿ'.-]{2,}$/.test(word));
  if (words.length < 2) return '';
  return words
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

function looksLikeClosingThanks(text) {
  const raw = String(text || '').trim();
  if (!raw || raw.length > 100) return false;
  if (/\?/.test(raw)) return false;
  const normalized = raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!normalized) return false;
  if (/\b(reserva|horario|pessoas|area coberta|area descoberta|e-mail|email|nascimento)\b/.test(normalized)) {
    return false;
  }
  return (
    /\bobrigad/.test(normalized) ||
    /^(valeu|vlw|tmj|entendi|show|perfeito|ok|okay|blz|beleza|combinado|fechado|top)(\s|$)/.test(
      normalized
    )
  );
}

function reservationAlreadyCreated(workingState = {}) {
  return (
    workingState.reservation_created === true ||
    Boolean(workingState.reservation_id)
  );
}

function lastAssistantClosedReservation(messageHistory = []) {
  const lastAssistant = [...(messageHistory || [])]
    .reverse()
    .find((msg) => msg?.role === 'assistant');
  const text = String(lastAssistant?.content || '');
  return /fechado!|sua reserva ficou pra|lista de convidados/i.test(text);
}

function looksLikeIdentityPayload(text) {
  const raw = String(text || '');
  return (
    /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(raw) ||
    Boolean(parseCompactBirthIso(raw))
  );
}

const MISSING_FIELD_PROMPTS = {
  establishment_id: 'Em qual casa você quer reservar?',
  reservation_date: 'Pra quando seria a reserva?',
  reservation_time: 'E qual horário fica melhor pra você?',
  quantidade_convidados: 'Quantas pessoas vão com você?',
  client_name: 'Me confirma seu nome completo, por favor?',
  client_email: 'E seu e-mail?',
  data_nascimento: 'Por último, sua data de nascimento (DD/MM/AAAA) pra eu confirmar +18.',
  area_id: 'Tem alguma área preferida (deck, bar, rooftop)? Se não, eu te indico a melhor disponível.',
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

function isAdultBirthIso(isoDateStr) {
  const match = String(isoDateStr || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const birth = new Date(Date.UTC(year, month - 1, day));
  if (
    birth.getUTCFullYear() !== year ||
    birth.getUTCMonth() !== month - 1 ||
    birth.getUTCDate() !== day
  ) {
    return false;
  }
  const today = new Date();
  let age = today.getUTCFullYear() - year;
  const monthDelta = today.getUTCMonth() - (month - 1);
  if (monthDelta < 0 || (monthDelta === 0 && today.getUTCDate() < day)) age -= 1;
  return age >= 18 && age <= 110;
}

function hasFieldValue(state, key) {
  const value = state[key];
  if (value === undefined || value === null || value === '') return false;
  if (key === 'data_nascimento') return isAdultBirthIso(value);
  if (['establishment_id', 'quantidade_convidados', 'area_id'].includes(key)) {
    const n = Number(value);
    return Number.isFinite(n) && n > 0;
  }
  return true;
}

const LARGE_GROUP_THRESHOLD = 60;
const LARGE_GROUP_HANDOFF_REPLY =
  'Pra um grupo desse tamanho eu chamo a equipe, que monta o melhor encaixe. Já passei seu contato, beleza?';
const MONTHS_PT = [
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

function extractPartySizeFromText(text) {
  const raw = String(text || '');
  const partyMatch =
    raw.match(/\b(\d{1,3})\s*(pessoas?|convidados?|pax)\b/i) ||
    raw.match(/\b(\d{1,3})\s+pessoas?\b/i) ||
    raw.match(/\b(?:somos|vamos|seremos)\s+(?:em\s+)?(\d{1,3})(?!\s*h|\s*:)\b/i);
  if (!partyMatch) return null;
  const n = Number(partyMatch[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function shouldHandoffLargeGroup(text, workingState = {}) {
  const fromText = extractPartySizeFromText(text);
  if (Number.isFinite(fromText) && fromText > LARGE_GROUP_THRESHOLD) return true;
  const fromState = Number(workingState?.quantidade_convidados);
  return Number.isFinite(fromState) && fromState > LARGE_GROUP_THRESHOLD;
}

function extractMonthDayWithoutYear(text) {
  const raw = String(text || '').trim();
  if (/\b\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\b/.test(raw)) return null;
  if (/\b(19\d{2}|20\d{2})\b/.test(raw)) return null;
  const match = raw.match(/\b(\d{1,2})[\/\-](\d{1,2})\b/);
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  if (day < 1 || day > 31 || month < 1 || month > 12) return null;
  return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}`;
}

function formatIsoToBr(iso) {
  const [year, month, day] = String(iso || '').slice(0, 10).split('-');
  if (!year || !month || !day) return '';
  return `${day}/${month}/${year}`;
}

function buildContactBirthConfirmQuestion(iso) {
  const label = formatIsoToBr(iso);
  if (!label) return 'A data de nascimento que tenho aqui está certa?';
  return `A data de nascimento que tenho aqui é ${label} — tá certo?`;
}

function buildBirthYearQuestion(pendingMd) {
  const match = String(pendingMd || '').match(/^(\d{1,2})[\/\-](\d{1,2})$/);
  if (!match) return 'De qual ano você nasceu?';
  const day = Number(match[1]);
  const month = Number(match[2]);
  const monthName = MONTHS_PT[month - 1];
  if (!monthName) return 'De qual ano você nasceu?';
  return `${day} de ${monthName} de qual ano você nasceu?`;
}

function looksLikeAgeOnly(text) {
  const raw = String(text || '').trim();
  if (!raw) return false;
  if (/\b\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\b/.test(raw)) return false;
  if (parseCompactBirthIso(raw)) return false;
  const normalized = raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return /^(eu\s+)?(tenho\s+)?\d{1,3}\s+anos?$/.test(normalized);
}

function buildBirthFromAgeQuestion() {
  return 'Me passa o dia, o mês e o ano em que você nasceu?';
}

function composeBirthIsoFromMdAndYear(pendingMd, yearText) {
  const md = String(pendingMd || '').match(/^(\d{1,2})[\/\-](\d{1,2})$/);
  const yearMatch = String(yearText || '').trim().match(/\b(19\d{2}|20\d{2})\b/);
  if (!md || !yearMatch) return '';
  const day = Number(md[1]);
  const month = Number(md[2]);
  const year = Number(yearMatch[1]);
  const iso = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return isAdultBirthIso(iso) ? iso : '';
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
  const text = String(userText || '');
  const partyMatch = text.match(/\b(\d{1,3})\s*(pessoas?|convidados?|pax)\b/i);
  const bookingDataTurn =
    Boolean(partyMatch) &&
    (/\b\d{1,2}\s*(?:h|:|hrs?)\b/i.test(text) ||
      /\bdia\s+\d{1,2}\b/i.test(text) ||
      /\b\d{1,2}[\/\-]\d{1,2}\b/.test(text));
  if (bookingDataTurn) return true;

  if (isInformationalFaqTurn(userText) && !looksLikeReservationIntent(userText)) {
    return false;
  }
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
  if (workingState.pending_birth_md && missing.includes('data_nascimento')) {
    return buildBirthYearQuestion(workingState.pending_birth_md);
  }
  if (workingState.pending_birth_from_age && missing.includes('data_nascimento')) {
    return buildBirthFromAgeQuestion();
  }
  const operationalMissing = ['reservation_date', 'reservation_time', 'quantidade_convidados'].some(
    (key) => missing.includes(key)
  );
  const firstIdentity = ['client_name', 'client_email', 'data_nascimento'].find((key) =>
    missing.includes(key)
  );
  if (firstIdentity && !operationalMissing) {
    if (firstIdentity === 'data_nascimento' && workingState.pending_contact_birth_iso) {
      return buildContactBirthConfirmQuestion(workingState.pending_contact_birth_iso);
    }
    return MISSING_FIELD_PROMPTS[firstIdentity] || buildCollectBundlePrompt(workingState, options);
  }
  if (missing.length >= 2 || missing.some((key) => BUNDLE_FIELD_ORDER.includes(key))) {
    return buildCollectBundlePrompt(workingState, options);
  }
  const first = missing[0];
  return MISSING_FIELD_PROMPTS[first] || buildCollectBundlePrompt(workingState, options);
}

function buildReservationFunnelPromptBlock(workingState = {}, messageHistory = []) {
  if (reservationAlreadyCreated(workingState) || lastAssistantClosedReservation(messageHistory)) {
    return (
      'RESERVA JÁ CRIADA: não chame criar_pre_reserva de novo. ' +
      'Se o cliente só agradeceu, agradeça de volta em uma frase e encerre. ' +
      'Se perguntou algo, responda em prosa e feche (a reserva já está confirmada).'
    );
  }

  if (!isReservationFunnelInProgress(workingState, messageHistory)) return '';

  const missing = getReservationMissingFields(workingState);
  const collected = RESERVATION_FIELD_ORDER.filter((key) => hasFieldValue(workingState, key)).map(
    (key) => `${key}=${workingState[key]}`
  );

  // Bloco curto: estado + 1 missão. Fatos estáticos não entram aqui (FAQ já foi filtrada).
  const paragraph =
    'FUNIL ATIVO: avance a reserva neste turno. Uma pergunta só, em prosa. ' +
    'Não reconfirme data, horário ou pessoas que já estão em Coletado. ' +
    'Não repita a pergunta que você acabou de fazer. ' +
    'Não diga "confirmada" antes de criar_pre_reserva ok. ' +
    'Ordem: data+horário+pessoas (se já vieram juntos, siga) → área, se faltar → nome → e-mail → nascimento → criar_pre_reserva. ' +
    'Ocasião só depois de um nascimento válido, e só se ainda não souber.';

  const lines = [paragraph];

  if (collected.length) {
    lines.push(`Coletado: ${collected.join('; ')}.`);
  }
  if (missing.length) {
    lines.push(`Falta: ${missing.join(', ')}.`);
    lines.push(`Próximo (adapte): ${buildNextFieldQuestion(workingState)}`);
  } else {
    lines.push('Campos ok → criar_pre_reserva agora.');
  }

  return lines.join('\n');
}

function assistantAskedForClientName(messageHistory = []) {
  const lastAssistant = [...(messageHistory || [])]
    .reverse()
    .find((msg) => msg?.role === 'assistant');
  const normalized = String(lastAssistant?.content || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  return /\bnome completo\b|\bseu nome\b|\bqual o seu nome\b|\bme confirma seu nome\b/.test(
    normalized
  );
}

function lastAssistantNormalized(messageHistory = []) {
  const lastAssistant = [...(messageHistory || [])]
    .reverse()
    .find((msg) => msg?.role === 'assistant');
  return String(lastAssistant?.content || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function assistantAskedForBirthDate(messageHistory = []) {
  const normalized = lastAssistantNormalized(messageHistory);
  return /\bnascimento\b|\bdata de nasc|\bmaior de 18\b|\b\+18\b|\bqual ano\b.*\bnasceu\b|\bano voce nasceu\b/.test(
    normalized
  );
}

function assistantAskedForContactBirthConfirm(messageHistory = [], workingState = {}) {
  const normalized = lastAssistantNormalized(messageHistory);
  if (!normalized) return false;
  const label = String(workingState.pending_contact_birth_label || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  if (label && normalized.includes(label)) return true;
  return /nascimento que tenho|data de nascimento que tenho/.test(normalized);
}

function assistantAskedForOccasion(messageHistory = []) {
  const normalized = lastAssistantNormalized(messageHistory);
  if (!normalized) return false;
  const askedOccasion =
    /\bdata especial\b/.test(normalized) ||
    /\btipo aniversario\b/.test(normalized) ||
    /\be aniversario\b/.test(normalized) ||
    /\b(ocasiao|niver)\b/.test(normalized);
  if (!askedOccasion) return false;
  const looksLikeDateConfirm =
    /\b(so confirmando|e para sexta|sexta dia|sabado dia|domingo dia)\b/.test(normalized) &&
    !/\b(aniversario|niver|data especial|ocasiao)\b/.test(normalized);
  return !looksLikeDateConfirm;
}

function extractOccasionHonoree(normalized) {
  const withPossessive = String(normalized || '').match(
    /\b(?:aniversario|niver)\s+d(?:a|o)\s+(?:minha|meu|nossa|nosso)\s+(\w+)/
  );
  const bare = String(normalized || '').match(/\b(?:aniversario|niver)\s+d(?:a|o)\s+(\w+)/);
  const word = String((withPossessive || bare || [])[1] || '').trim();
  if (!word || ['minha', 'meu', 'nossa', 'nosso', 'o', 'a'].includes(word)) return '';
  return word;
}

function shouldAskOccasion(workingState = {}) {
  const party = Number(workingState.quantidade_convidados);
  if (!Number.isFinite(party) || party <= 4) return false;
  if (workingState.occasion_declined === true) return false;
  if (String(workingState.event_type || '').trim()) return false;
  return true;
}

function parseOccasionFromUserText(userText, workingState = {}, messageHistory = []) {
  if (workingState.event_type || workingState.occasion_declined === true) return {};
  if (isInformationalFaqTurn(userText) && !looksLikeReservationIntent(userText)) return {};
  const normalized = String(userText || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  if (/\b(aniversario|niver|aniversariante)\b/.test(normalized)) {
    const honoree = extractOccasionHonoree(normalized);
    const patch = { event_type: 'aniversario', is_birthday: true };
    if (honoree) {
      patch.occasion_honoree = honoree;
      patch.occasion_notes = `ocasião: aniversário da ${honoree}`;
    }
    return patch;
  }
  if (/\bdespedida\b/.test(normalized)) {
    return { event_type: 'despedida' };
  }
  if (!assistantAskedForOccasion(messageHistory)) return {};
  const identityStillMissing = getReservationMissingFields(workingState).some((key) =>
    ['client_name', 'client_email', 'data_nascimento'].includes(key)
  );
  if (isAffirmativeConfirmation(userText)) {
    if (identityStillMissing) return {};
    return { event_type: 'aniversario', is_birthday: true };
  }
  if (
    /^(nao|nada|nenhuma|so isso|so a reserva|nao e|nao tem)(\s|$|[!.?,])/i.test(normalized) ||
    /\bnada especial\b|\bnao e aniversario\b|\bnao vai ser aniversario\b/.test(normalized)
  ) {
    return { occasion_declined: true };
  }
  return {};
}

function buildOccasionNotes(workingState = {}) {
  const eventType = String(workingState.event_type || '').trim();
  if (eventType === 'aniversario') {
    const honoree = String(workingState.occasion_honoree || '').trim();
    const stored = String(workingState.occasion_notes || '').trim();
    const occasionBit = honoree
      ? `ocasião: aniversário da ${honoree}`
      : stored;
    const head = occasionBit
      ? `Aniversário — ${occasionBit}.`
      : 'Aniversário — tipo de evento aniversario.';
    const party = Number(workingState.quantidade_convidados);
    if (Number.isFinite(party) && party > 5) {
      return `${head} Lista de convidados para compartilhamento. Brinde: drink especial se os convidados fizerem check-in na entrada pelo QR Code da lista.`;
    }
    return `${head} Lista de convidados para compartilhamento. Brinde de drink somente se o grupo tiver mais de 5 convidados.`;
  }
  if (eventType === 'despedida') {
    return 'Despedida — tipo de evento despedida. Lista de convidados para compartilhamento.';
  }
  return '';
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

  const aroundHour = raw.match(
    /\b(?:umas?|uns|por volta das?|mais ou menos)\s+(\d{1,2})\b/i
  );
  if (aroundHour) {
    const h = Number(aroundHour[1]);
    if (h >= 12 && h <= 23) {
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

  if (looksLikeAgeOnly(text)) {
    if (!hasFieldValue(workingState, 'data_nascimento')) {
      patch.pending_birth_from_age = true;
    }
    return patch;
  }

  const missingForTime = getReservationMissingFields(workingState);
  const allowBareHour =
    !hasFieldValue(workingState, 'reservation_time') &&
    (assistantAskedForReservationTime(messageHistory) ||
      missingForTime.includes('reservation_time') ||
      missingForTime.length >= 2);
  const time = normalizeTimeHHmm(text, { allowBareHour });
  const currentTime = String(workingState.reservation_time || '').slice(0, 5);
  if (time && (!hasFieldValue(workingState, 'reservation_time') || currentTime !== time)) {
    patch.reservation_time = time;
  }

  const emailMatch = text.match(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i);
  if (emailMatch && !hasFieldValue(workingState, 'client_email')) {
    patch.client_email = emailMatch[0].toLowerCase();
  }
  if (!hasFieldValue(workingState, 'client_name')) {
    const nameBeforeEmail = extractFullNameBeforeEmail(text);
    if (nameBeforeEmail) patch.client_name = nameBeforeEmail;
  }

  const compactBirth = parseCompactBirthIso(text);
  if (
    compactBirth &&
    isAdultBirthIso(compactBirth) &&
    !hasFieldValue(workingState, 'data_nascimento') &&
    (emailMatch || /\bnasc/i.test(text) || assistantAskedForBirthDate(messageHistory))
  ) {
    patch.data_nascimento = compactBirth;
    patch.pending_birth_from_age = null;
  }

  const partySize = extractPartySizeFromText(text);
  const partyMatch = partySize != null;
  if (partySize && partySize <= 200) {
    const currentParty = Number(workingState.quantidade_convidados);
    if (!hasFieldValue(workingState, 'quantidade_convidados') || currentParty !== partySize) {
      patch.quantidade_convidados = partySize;
    }
  }

  const askedBirth = assistantAskedForBirthDate(messageHistory);
  const birthMdOnly = extractMonthDayWithoutYear(text);
  if (askedBirth && birthMdOnly && !hasFieldValue(workingState, 'data_nascimento')) {
    patch.pending_birth_md = birthMdOnly;
  }

  if (
    workingState.pending_birth_md &&
    !hasFieldValue(workingState, 'data_nascimento') &&
    askedBirth
  ) {
    const composedBirth = composeBirthIsoFromMdAndYear(workingState.pending_birth_md, text);
    if (composedBirth) {
      patch.data_nascimento = composedBirth;
      patch.pending_birth_md = null;
      patch.pending_birth_from_age = null;
    }
  }

  const dateParsed = parsePtBrDateFromText(text);
  const informationalDateQuestion =
    (isInformationalFaqTurn(text) || looksLikeEventProgramQuestion(text)) &&
    !looksLikeReservationIntent(text);
  const parsedYear = Number(dateParsed?.year);
  const birthCalendarDate =
    Number.isFinite(parsedYear) && parsedYear < new Date().getFullYear();
  const skipDateAsBirthMonthDay = Boolean(askedBirth && birthMdOnly);
  const currentDate = String(workingState.reservation_date || '').slice(0, 10);
  if (
    dateParsed?.iso &&
    !informationalDateQuestion &&
    !emailMatch &&
    !birthCalendarDate &&
    !skipDateAsBirthMonthDay &&
    (!hasFieldValue(workingState, 'reservation_date') || currentDate !== dateParsed.iso)
  ) {
    patch.reservation_date = dateParsed.iso;
    patch.reservation_date_confirmed = true;
    patch.pending_reservation_date_iso = null;
    patch.pending_reservation_date_label = null;
  }

  const birthParsed = parsePtBrDateFromText(text);
  const birthContext = /\bnasc/i.test(text) || Boolean(emailMatch) || askedBirth;
  if (
    birthParsed?.iso &&
    isAdultBirthIso(birthParsed.iso) &&
    birthContext &&
    !hasFieldValue(workingState, 'data_nascimento') &&
    !skipDateAsBirthMonthDay &&
    String(birthParsed.iso).slice(0, 10) !==
      String(workingState.reservation_date || patch.reservation_date || '').slice(0, 10)
  ) {
    patch.data_nascimento = birthParsed.iso;
    patch.pending_birth_from_age = null;
  }

  if (
    !hasFieldValue(workingState, 'client_name') &&
    !emailMatch &&
    !time &&
    !partyMatch &&
    assistantAskedForClientName(messageHistory) &&
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

  if (
    isAffirmativeConfirmation(text) &&
    workingState.pending_contact_birth_iso &&
    assistantAskedForContactBirthConfirm(messageHistory, workingState)
  ) {
    patch.data_nascimento = workingState.pending_contact_birth_iso;
    patch.pending_contact_birth_iso = null;
    patch.pending_contact_birth_label = null;
    patch.pending_birth_from_age = null;
  } else if (isAffirmativeConfirmation(text) && workingState.pending_reservation_date_iso) {
    patch.reservation_date = workingState.pending_reservation_date_iso;
    patch.reservation_date_confirmed = true;
    patch.pending_reservation_date_iso = null;
    patch.pending_reservation_date_label = null;
  }

  // Sempre atualiza quando a fala resolve uma subárea — permite trocar de área no meio do funil.
  const justinoHouse = Number(workingState.establishment_id) === 1;
  const justinoSubarea = justinoHouse ? resolveJustinoSubarea(text) : null;
  if (justinoSubarea) {
    patch.area_preferida = guestZoneLabel(justinoSubarea.zone);
    patch.area_label = guestZoneLabel(justinoSubarea.zone);
    patch.area_id = justinoSubarea.area_id;
    patch.justino_subarea_key = justinoSubarea.key;
    patch.justino_zone = justinoSubarea.zone;
  } else if (Number(workingState.establishment_id) === 8) {
    const pracinhaArea = resolvePracinhaGuestArea(text);
    if (pracinhaArea) {
      patch.area_preferida = pracinhaArea.label;
      patch.area_label = pracinhaArea.label;
    }
  } else if (justinoHouse) {
    const justinoZone = resolveJustinoGuestZone(text);
    if (justinoZone && justinoZone !== 'qualquer') {
      const label = guestZoneLabel(justinoZone);
      patch.justino_zone = justinoZone;
      patch.area_preferida = label;
      patch.area_label = label;
      patch.area_id = justinoZone === 'coberta' ? 1 : 2;
    } else if (justinoZone === 'qualquer') {
      patch.justino_zone = 'qualquer';
      patch.area_preferida = 'qualquer';
      patch.area_label = 'qualquer';
    }
  }

  Object.assign(patch, parseOccasionFromUserText(text, workingState, messageHistory));

  const subarea = justinoHouse ? null : resolveHighlineSubarea(text);
  if (subarea?.label) {
    const current = resolveHighlineSubarea(
      workingState.area_label || workingState.area_preferida || ''
    );
    if (!current || current.key !== subarea.key) {
      patch.area_preferida = subarea.label;
      patch.area_label = subarea.label;
      if (subarea.area_id) patch.area_id = subarea.area_id;
    }
  }

  return patch;
}

function mergeContactHintsIntoWorkingState(workingState = {}, contact = {}) {
  const next = { ...workingState };
  if (!hasFieldValue(next, 'client_email') && contact?.client_email) {
    next.client_email = String(contact.client_email).trim().toLowerCase();
  }
  const contactName = String(contact?.contact_name || '').trim();
  const contactLooksLikePerson =
    contactName.split(/\s+/).length >= 2 &&
    contactName.split(/\s+/).every((word) => /^[A-Za-zÀ-ÿ']{2,}$/.test(word));
  if (!hasFieldValue(next, 'client_name') && contactLooksLikePerson) {
    next.client_name = contactName;
  }
  if (
    !hasFieldValue(next, 'data_nascimento') &&
    !next.pending_contact_birth_iso &&
    contact?.birth_date
  ) {
    const bd = String(contact.birth_date).slice(0, 10);
    if (isAdultBirthIso(bd)) {
      next.pending_contact_birth_iso = bd;
      next.pending_contact_birth_label = formatIsoToBr(bd);
    }
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
  if (
    (isInformationalFaqTurn(userText) || looksLikeEventProgramQuestion(userText)) &&
    !looksLikeReservationIntent(userText)
  ) {
    return false;
  }
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

function scrubReservationStateForInformationalTurn(workingState = {}) {
  const next = { ...(workingState && typeof workingState === 'object' ? workingState : {}) };
  for (const key of [
    'reservation_date',
    'reservation_date_confirmed',
    'pending_reservation_date_iso',
    'pending_reservation_date_label',
    'reservation_time',
    'quantidade_convidados',
    'availability_checked_for',
    'availability_time_checked_for',
  ]) {
    delete next[key];
  }
  return next;
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

const RESERVATION_SLOT_KEYS = [
  'reservation_date',
  'reservation_date_confirmed',
  'pending_reservation_date_iso',
  'pending_reservation_date_label',
  'reservation_time',
  'quantidade_convidados',
  'area_id',
  'area_label',
  'area_preferida',
  'justino_subarea_key',
  'justino_zone',
  'availability_checked_for',
  'availability_time_checked_for',
];

function resetReservationSlotOnHouseChange(workingState = {}, nextHouseId) {
  const previousId = Number(workingState.establishment_id);
  const nextId = Number(nextHouseId);
  if (!Number.isFinite(nextId) || nextId <= 0 || previousId === nextId) {
    return workingState;
  }
  const next = { ...workingState, establishment_id: nextId };
  for (const key of RESERVATION_SLOT_KEYS) {
    delete next[key];
  }
  return next;
}

function dropAvailabilityIfSlotChanged(previous = {}, next = {}) {
  const prevDate = String(previous.reservation_date || previous.pending_reservation_date_iso || '').slice(0, 10);
  const nextDate = String(next.reservation_date || next.pending_reservation_date_iso || '').slice(0, 10);
  const slotChanged =
    Number(previous.establishment_id || 0) !== Number(next.establishment_id || 0) ||
    prevDate !== nextDate ||
    String(previous.reservation_time || '').slice(0, 5) !== String(next.reservation_time || '').slice(0, 5) ||
    Number(previous.quantidade_convidados || 0) !== Number(next.quantidade_convidados || 0);
  if (!slotChanged) return next;
  const cleaned = { ...next };
  delete cleaned.availability_checked_for;
  delete cleaned.availability_time_checked_for;
  return cleaned;
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
  resetReservationSlotOnHouseChange,
  dropAvailabilityIfSlotChanged,
  mergeContactHintsIntoWorkingState,
  looksLikeDeferredAvailabilityCheck,
  canAutoCheckAvailability,
  shouldAutoRunAvailabilityCheck,
  buildAvailabilityFingerprint,
  buildAvailabilityCheckedPatch,
  tryAdvanceFunnelFromUserMessage,
  inferAvailabilityCheckedFromHistory,
  scrubReservationStateForInformationalTurn,
  assistantAskedForReservationTime,
  looksLikeAdEntryGreeting,
  detectOpeningGreeting,
  detectClientCorrectingPreviousReply,
  isFirstUserMessageInConversation,
  extractFirstName,
  looksLikeIdentityPayload,
  looksLikeClosingThanks,
  reservationAlreadyCreated,
  lastAssistantClosedReservation,
  prefixReplyWithContactName,
  resolvePracinhaGuestArea,
  shouldAskOccasion,
  parseOccasionFromUserText,
  buildOccasionNotes,
  shouldHandoffLargeGroup,
  LARGE_GROUP_HANDOFF_REPLY,
  LARGE_GROUP_THRESHOLD,
  buildContactBirthConfirmQuestion,
  assistantAskedForBirthDate,
  assistantAskedForOccasion,
  looksLikeAgeOnly,
  buildBirthFromAgeQuestion,
};
