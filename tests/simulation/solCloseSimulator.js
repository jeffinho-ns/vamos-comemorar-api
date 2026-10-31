const {
  parseReservationFieldsFromUserText,
  getReservationMissingFields,
  buildNextFieldQuestion,
  resetReservationSlotOnHouseChange,
  dropAvailabilityIfSlotChanged,
  mergeContactHintsIntoWorkingState,
  shouldHandoffLargeGroup,
  LARGE_GROUP_HANDOFF_REPLY,
  looksLikeAgeOnly,
  parseOccasionFromUserText,
} = require('../../services/agent/reservationFunnel');
const { buildReservationDateHint } = require('../../services/agent/reservationDateHint');
const { mergeWorkingState } = require('../../services/agent/agentMemoryService');
const { evaluateWorkingStateSlot } = require('../../services/agent/reservationSlotGuard');
const {
  listMentionedEstablishments,
  detectEstablishmentFromText,
  buildHouseChoiceQuestion,
  resolveEstablishmentForTurn,
} = require('../../services/conversationEngine/helpers');
const {
  shouldRefuseSecondCreate,
  secondCreateRefuseReply,
  isCreatableAreaLabel,
  reservationFunnelIsComplete,
} = require('../../services/agent/deterministicReservationClose');
const { evaluateAssistantBehavior } = require('../../services/agent/assistantBehaviorRuntime');
const { buildHappyScenarios, FILLED_SETTINGS } = require('./solCloseHappyScenarios');
const { buildConflictScenarios } = require('./solCloseConflictScenarios');

const HOUSES = [
  { id: 1, name: 'Seu Justino' },
  { id: 7, name: 'Highline' },
  { id: 8, name: 'Pracinha do Seu Justino' },
  { id: 17, name: 'Apê Pracinha' },
];

const REFERENCE_DATE = '2026-10-30';

function simulateTurn(input = {}) {
  const userText = String(input.userText || '').trim();
  const settings = input.settings || null;
  const contact = input.contact || {};
  const messageHistory = Array.isArray(input.messageHistory) ? input.messageHistory : [];
  const referenceDateIso = input.referenceDateIso || REFERENCE_DATE;
  let state = input.state && typeof input.state === 'object' ? { ...input.state } : {};

  const mentioned = listMentionedEstablishments(userText, HOUSES);
  if (mentioned.length > 1) {
    return {
      action: 'house_choice',
      wouldCreate: false,
      state,
      reply: buildHouseChoiceQuestion(userText, HOUSES),
      mentioned,
    };
  }

  const behavior = evaluateAssistantBehavior({
    settings,
    userText,
    houseIsOpen: input.houseIsOpen !== false,
    errorCode: input.errorCode || null,
  });
  if (behavior.action !== 'continue') {
    return {
      action: behavior.action,
      wouldCreate: false,
      state,
      reply: behavior.replyText,
      reason: behavior.reason,
    };
  }

  const houseId =
    resolveEstablishmentForTurn({
      messageText: userText,
      messageHistory,
      establishments: HOUSES,
      lockedEstablishmentId: state.establishment_id || null,
      conversationEstablishmentId: input.conversationEstablishmentId || null,
      collectedFields: state,
    }) ||
    detectEstablishmentFromText(userText, HOUSES) ||
    state.establishment_id ||
    null;

  const afterHouse = houseId ? resetReservationSlotOnHouseChange(state, houseId) : state;
  let next = houseId ? mergeWorkingState(afterHouse, { establishment_id: houseId }) : afterHouse;

  const dateHint = buildReservationDateHint({
    userText,
    referenceDateIso,
    workingState: next,
    messageHistory,
  });
  const textPatch = parseReservationFieldsFromUserText(userText, next, messageHistory);
  const occasion = parseOccasionFromUserText(userText, next, messageHistory) || {};
  next = mergeContactHintsIntoWorkingState(
    mergeWorkingState(next, dateHint.patch || {}, textPatch, occasion),
    contact
  );
  next = dropAvailabilityIfSlotChanged(state, next);

  if (shouldHandoffLargeGroup(userText, next)) {
    return {
      action: 'large_group_handoff',
      wouldCreate: false,
      state: next,
      reply: LARGE_GROUP_HANDOFF_REPLY,
    };
  }

  const slot = evaluateWorkingStateSlot(next);
  if (!slot.ok) {
    return {
      action: 'slot_guard',
      wouldCreate: false,
      state: next,
      reply: slot.replyText,
      reason: slot.reason,
    };
  }

  if (shouldRefuseSecondCreate(next, userText)) {
    return {
      action: 'second_create_refused',
      wouldCreate: false,
      state: next,
      reply: secondCreateRefuseReply(userText),
    };
  }

  const missing = getReservationMissingFields(next);
  const area =
    next.area_label || next.area_preferida || next.justino_zone || next.area || '';
  const creatable =
    reservationFunnelIsComplete(next) && isCreatableAreaLabel(area, next.establishment_id);

  return {
    action: creatable ? 'would_create' : 'collect',
    wouldCreate: creatable,
    missing,
    state: next,
    reply: buildNextFieldQuestion(next),
    ageOnly: looksLikeAgeOnly(userText),
  };
}

function simulateConversation(scenario) {
  let state = { ...(scenario.initialState || {}) };
  let history = Array.isArray(scenario.seedHistory) ? [...scenario.seedHistory] : [];
  const turns = [];
  for (const userText of scenario.turns || []) {
    const result = simulateTurn({
      state,
      userText,
      settings: scenario.settings || null,
      contact: scenario.contact || {},
      messageHistory: history,
      conversationEstablishmentId: scenario.conversationEstablishmentId || null,
      houseIsOpen: scenario.houseIsOpen,
      referenceDateIso: scenario.referenceDateIso || REFERENCE_DATE,
    });
    turns.push({ userText, ...result });
    state = result.state || state;
    history = [
      ...history,
      { role: 'user', content: userText },
      { role: 'assistant', content: result.reply || '' },
    ];
  }
  return { id: scenario.id, title: scenario.title, turns, final: turns[turns.length - 1] || null };
}

function checkExpect(actual, expect = {}) {
  const failures = [];
  if (expect.action && actual?.action !== expect.action) {
    failures.push(`action=${actual?.action} (queria ${expect.action})`);
  }
  if (expect.wouldCreate != null && Boolean(actual?.wouldCreate) !== expect.wouldCreate) {
    failures.push(`wouldCreate=${Boolean(actual?.wouldCreate)} (queria ${expect.wouldCreate})`);
  }
  if (expect.reason && actual?.reason !== expect.reason) {
    failures.push(`reason=${actual?.reason} (queria ${expect.reason})`);
  }
  if (expect.establishment_id && Number(actual?.state?.establishment_id) !== Number(expect.establishment_id)) {
    failures.push(`casa=${actual?.state?.establishment_id} (queria ${expect.establishment_id})`);
  }
  if (expect.reservation_date && actual?.state?.reservation_date !== expect.reservation_date) {
    failures.push(`data=${actual?.state?.reservation_date} (queria ${expect.reservation_date})`);
  }
  if (expect.reservation_time && actual?.state?.reservation_time !== expect.reservation_time) {
    failures.push(`hora=${actual?.state?.reservation_time} (queria ${expect.reservation_time})`);
  }
  if (expect.quantidade_convidados != null && Number(actual?.state?.quantidade_convidados) !== Number(expect.quantidade_convidados)) {
    failures.push(`pessoas=${actual?.state?.quantidade_convidados} (queria ${expect.quantidade_convidados})`);
  }
  if (expect.replyMatch && !expect.replyMatch.test(String(actual?.reply || ''))) {
    failures.push(`resposta não bate /${expect.replyMatch.source}/ → "${actual?.reply || ''}"`);
  }
  if (expect.replyNotMatch && expect.replyNotMatch.test(String(actual?.reply || ''))) {
    failures.push(`resposta não deveria bater /${expect.replyNotMatch.source}/`);
  }
  if (expect.missingIncludes) {
    const missing = actual?.missing || [];
    for (const field of expect.missingIncludes) {
      if (!missing.includes(field)) failures.push(`faltou missing ${field}`);
    }
  }
  if (expect.missingExcludes) {
    const missing = actual?.missing || [];
    for (const field of expect.missingExcludes) {
      if (missing.includes(field)) failures.push(`não deveria faltar ${field}`);
    }
  }
  if (expect.noReservationDate && actual?.state?.reservation_date) {
    failures.push(`data da reserva não deveria gravar (${actual.state.reservation_date})`);
  }
  if (expect.field && actual?.state?.[expect.field.key] !== expect.field.value) {
    failures.push(`${expect.field.key}=${actual?.state?.[expect.field.key]} (queria ${expect.field.value})`);
  }
  if (expect.client_phone && actual?.state?.client_phone !== expect.client_phone) {
    failures.push(`telefone=${actual?.state?.client_phone} (queria ${expect.client_phone})`);
  }
  return failures;
}

function runCheck(scenario) {
  if (typeof scenario.run === 'function') {
    const actual = scenario.run();
    return { id: scenario.id, title: scenario.title, ok: true, actual, failures: checkExpect(actual, scenario.expect), kind: 'check' };
  }
  const result = simulateConversation(scenario);
  const actual = result.final;
  return {
    id: scenario.id,
    title: scenario.title,
    ok: true,
    actual,
    failures: checkExpect(actual, scenario.expect),
    kind: 'conversation',
    turns: result.turns,
  };
}

function buildScenarios() {
  return [...buildHappyScenarios(), ...buildConflictScenarios()];
}
function runAll() {
  return buildScenarios().map((scenario) => {
    try {
      const result = runCheck(scenario);
      return { ...result, ok: result.failures.length === 0 };
    } catch (error) {
      return {
        id: scenario.id,
        title: scenario.title,
        ok: false,
        failures: [error.message],
        actual: null,
      };
    }
  });
}

function formatReport(results) {
  const passed = results.filter((row) => row.ok).length;
  const lines = [
    `Simulação Sol — ${passed}/${results.length} cenários ok`,
    '',
  ];
  for (const row of results) {
    const mark = row.ok ? 'OK' : 'FALHOU';
    const extra = row.ok
      ? row.actual?.action
        ? ` → ${row.actual.action}${row.actual.wouldCreate ? ' (fecharia)' : ''}`
        : ''
      : ` → ${row.failures.join('; ')}`;
    lines.push(`${mark.padEnd(6)} ${row.id.padEnd(24)} ${row.title}${extra}`);
  }
  return lines.join('\n');
}

module.exports = {
  HOUSES,
  FILLED_SETTINGS,
  simulateTurn,
  simulateConversation,
  buildScenarios,
  runAll,
  formatReport,
  REFERENCE_DATE,
};
