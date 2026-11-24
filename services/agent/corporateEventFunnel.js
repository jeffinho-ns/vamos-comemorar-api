'use strict';

const { isAffirmativeConfirmation } = require('./reservationDateHint');

const CORPORATE_RE =
  /\b(evento\s+(da\s+)?empresa|evento\s+corporativo|corporativ[oa]|confraterniz|pacote fechado|festa da empresa|happy hour (da )?empresa|workshop|congresso|formatura)\b/i;
const EVENTO_ALONE_RE = /^(evento|um evento|e um evento|eh um evento|é um evento)(\s|$|[!.?,])/i;
const PACKAGE_RE = /\b(pacotes? fechados?|evento fechado|casa fechada|alugar a casa|locacao|loca[cç][aã]o)\b/i;
const SIMPLE_MESA_RE =
  /\b(reserva simples|comandas?\s+individuais?|so (a )?mesa|só (a )?mesa|mesa normal|nao (e|é) pacote)\b/i;

function normalizeLoose(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function looksLikeCorporateEvent(text) {
  const raw = String(text || '').trim();
  if (!raw) return false;
  if (PACKAGE_RE.test(raw) || CORPORATE_RE.test(raw)) return true;
  const normalized = normalizeLoose(raw);
  if (EVENTO_ALONE_RE.test(normalized)) return true;
  if (/\b(evento)\b/.test(normalized) && /\b(empresa|equipe|time|corporativ)/.test(normalized)) {
    return true;
  }
  return false;
}

function isCorporateEventState(workingState = {}) {
  const type = String(workingState.event_type || '').trim().toLowerCase();
  return type === 'corporativo' || type === 'confraternizacao' || workingState.is_corporate_event === true;
}

function recentUserText(messageHistory = [], userText = '') {
  const users = (messageHistory || [])
    .filter((msg) => msg?.role === 'user')
    .slice(-4)
    .map((msg) => String(msg.content || ''));
  return `${users.join(' ')} ${userText || ''}`.trim();
}

function parseCorporateEventPatch(userText, workingState = {}, messageHistory = []) {
  if (workingState.occasion_declined === true) return {};
  const text = String(userText || '').trim();
  const combined = recentUserText(messageHistory, text);
  const alreadyCorporate = isCorporateEventState(workingState);
  const askedOccasion = assistantAskedForOccasionCue(messageHistory);
  const patch = {};

  if (looksLikeCorporateEvent(text)) {
    patch.event_type = 'corporativo';
    patch.is_corporate_event = true;
    patch.is_birthday = false;
  } else if (
    askedOccasion &&
    isAffirmativeConfirmation(text) &&
    looksLikeCorporateEvent(combined)
  ) {
    patch.event_type = 'corporativo';
    patch.is_corporate_event = true;
    patch.is_birthday = false;
  }

  if (PACKAGE_RE.test(text)) {
    patch.event_mode = 'pacote_fechado';
    patch.event_type = patch.event_type || 'corporativo';
    patch.is_corporate_event = true;
    patch.is_birthday = false;
  }

  if (SIMPLE_MESA_RE.test(text)) {
    patch.event_mode = 'mesa';
    if (alreadyCorporate || looksLikeCorporateEvent(combined)) {
      patch.event_type = 'corporativo';
      patch.is_corporate_event = true;
      patch.is_birthday = false;
    }
  }

  const askedMode = assistantAskedCorporateMode(messageHistory);
  if (askedMode && SIMPLE_MESA_RE.test(text)) {
    patch.event_mode = 'mesa';
  } else if (askedMode && (PACKAGE_RE.test(text) || isAffirmativeConfirmation(text))) {
    patch.event_mode = 'pacote_fechado';
  }

  return patch;
}

function assistantAskedForOccasionCue(messageHistory = []) {
  const lastAssistant = [...(messageHistory || [])]
    .reverse()
    .find((msg) => msg?.role === 'assistant');
  const normalized = normalizeLoose(lastAssistant?.content || '');
  if (!normalized) return false;
  return (
    normalized.includes('data especial') ||
    normalized.includes('tipo aniversario') ||
    normalized.includes('e aniversario')
  );
}

function assistantAskedCorporateMode(messageHistory = []) {
  const lastAssistant = [...(messageHistory || [])]
    .reverse()
    .find((msg) => msg?.role === 'assistant');
  const normalized = normalizeLoose(lastAssistant?.content || '');
  if (!normalized) return false;
  return (
    normalized.includes('pacote fechado') &&
    (normalized.includes('reserva simples') || normalized.includes('comandas individuais'))
  );
}

function shouldAskCorporateMode(workingState = {}) {
  if (!isCorporateEventState(workingState)) return false;
  return !String(workingState.event_mode || '').trim();
}

function shouldCollectCorporatePackage(workingState = {}) {
  return isCorporateEventState(workingState) && workingState.event_mode === 'pacote_fechado';
}

function shouldCreateNormalReservationForEvent(workingState = {}) {
  if (!isCorporateEventState(workingState)) return true;
  return String(workingState.event_mode || '') === 'mesa';
}

function buildCorporateEventQuestion(workingState = {}) {
  if (shouldAskCorporateMode(workingState)) {
    return 'Entendi, é um evento da empresa. Vocês preferem um pacote fechado de comidas e bebidas, ou uma reserva de mesa com comandas individuais?';
  }
  if (shouldCollectCorporatePackage(workingState)) {
    const missing = [];
    if (!String(workingState.company_name || '').trim()) missing.push('o nome da empresa');
    if (!String(workingState.event_expectations || '').trim()) missing.push('o que vocês esperam do evento');
    if (!String(workingState.contact_preference || '').trim()) {
      missing.push('se prefere retorno por WhatsApp, e-mail ou ligação');
    }
    if (missing.length === 0) {
      return 'Perfeito. Já passei esses dados para a equipe de eventos — eles montam a proposta e te retornam por aqui.';
    }
    if (missing.length === 1) return `Pra equipe montar a proposta, me manda ${missing[0]}?`;
    return `Pra equipe montar a proposta, me manda ${missing[0]} e ${missing[1]}?`;
  }
  return '';
}

function parseCorporatePackageFields(userText, workingState = {}) {
  if (!shouldCollectCorporatePackage(workingState) && !PACKAGE_RE.test(userText || '')) {
    return {};
  }
  const text = String(userText || '').trim();
  if (!text || text.length < 3) return {};
  const patch = {};
  const pref = normalizeLoose(text);
  if (/\b(whats?|zap|ligacao|liga[cç]ao|e-?mail|email)\b/.test(pref) && !workingState.contact_preference) {
    if (/\blig/.test(pref)) patch.contact_preference = 'ligacao';
    else if (/e-?mail|email/.test(pref)) patch.contact_preference = 'email';
    else patch.contact_preference = 'whatsapp';
  }
  if (!workingState.company_name && text.length <= 80 && !looksLikeCorporateEvent(text) && !PACKAGE_RE.test(text)) {
    const companyLine = text.split('\n').find((line) =>
      /\b(empresa|club|ltda|s\.?a\.?)\b/i.test(line)
    );
    if (companyLine) patch.company_name = companyLine.replace(/empresa\s*:?\s*/i, '').trim();
  }
  if (!workingState.event_expectations && text.length >= 12 && !EVENTO_ALONE_RE.test(normalizeLoose(text))) {
    if (!isAffirmativeConfirmation(text)) {
      patch.event_expectations = text.slice(0, 400);
    }
  }
  return patch;
}

module.exports = {
  looksLikeCorporateEvent,
  isCorporateEventState,
  parseCorporateEventPatch,
  parseCorporatePackageFields,
  shouldAskCorporateMode,
  shouldCollectCorporatePackage,
  shouldCreateNormalReservationForEvent,
  buildCorporateEventQuestion,
  assistantAskedCorporateMode,
};
