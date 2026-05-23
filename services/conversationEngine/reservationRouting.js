const stateManager = require('../stateManager/stateManager');
const { isTerminalStep } = require('../stateManager/conversationSteps');
const { getMemory } = require('../agent/agentMemoryService');
const { isReservationFunnelInProgress } = require('../agent/reservationFunnel');
const { looksLikeReservationIntent } = require('../agent/reservationDateHint');
const { isLikelyReservationIntent } = require('../aiService');
const { extractEstablishmentToken } = require('./helpers');

const LEGACY_FIELD_KEYS = [
  'establishment_id',
  'reservation_date',
  'reservation_time',
  'quantidade_convidados',
  'area_id',
  'client_name',
  'client_email',
  'data_nascimento',
];

function isLegacyReservationFunnelEnabled() {
  const raw = String(process.env.WHATSAPP_LEGACY_RESERVATION_FUNNEL ?? 'true')
    .trim()
    .toLowerCase();
  return !['0', 'false', 'no', 'off'].includes(raw);
}

function hasLegacyCollectedFields(collectedFields = {}) {
  return LEGACY_FIELD_KEYS.some((key) => {
    const value = collectedFields[key];
    if (value === undefined || value === null || value === '') return false;
    return true;
  });
}

function shouldUseLegacyReservationFunnelSync({
  messageText = '',
  conversationState = null,
  workingState = {},
  messageHistory = [],
}) {
  if (!isLegacyReservationFunnelEnabled()) return false;

  const step = conversationState?.currentStep;
  if (step && step !== 'greeting' && !isTerminalStep(step)) {
    return true;
  }

  if (hasLegacyCollectedFields(conversationState?.collectedFields)) {
    return true;
  }

  if (isReservationFunnelInProgress(workingState, messageHistory)) {
    return true;
  }

  const text = String(messageText || '').trim();
  if (!text) return false;

  if (extractEstablishmentToken(text)) return true;
  if (looksLikeReservationIntent(text) || isLikelyReservationIntent(text)) {
    return true;
  }

  return false;
}

async function shouldUseLegacyReservationFunnel(pool, {
  conversationId,
  messageText,
  messageHistory = [],
}) {
  if (!isLegacyReservationFunnelEnabled()) return false;

  let conversationState = null;
  if (pool && conversationId) {
    try {
      conversationState = await stateManager.getByConversationId(pool, conversationId);
    } catch (_error) {
      conversationState = null;
    }
  }

  let workingState = {};
  if (pool && conversationId) {
    try {
      const memory = await getMemory(pool, conversationId);
      workingState = memory?.workingState || {};
    } catch (_error) {
      workingState = {};
    }
  }

  return shouldUseLegacyReservationFunnelSync({
    messageText,
    conversationState,
    workingState,
    messageHistory,
  });
}

function mapAgentWorkingStateToLegacyFields(workingState = {}) {
  const patch = {};
  for (const key of LEGACY_FIELD_KEYS) {
    const value = workingState[key];
    if (value === undefined || value === null || value === '') continue;
    patch[key] = value;
  }
  return patch;
}

async function hydrateLegacyStateFromAgent(pool, conversationId, waId, workingState = {}) {
  const patch = mapAgentWorkingStateToLegacyFields(workingState);
  if (!pool || !conversationId || Object.keys(patch).length === 0) return;

  await stateManager.ensureSession(pool, { conversationId, waId });
  await stateManager.mergeCollectedFields(pool, conversationId, patch, {
    lockedEstablishmentId: patch.establishment_id || undefined,
  });
}

module.exports = {
  isLegacyReservationFunnelEnabled,
  shouldUseLegacyReservationFunnel,
  shouldUseLegacyReservationFunnelSync,
  hydrateLegacyStateFromAgent,
  mapAgentWorkingStateToLegacyFields,
};
