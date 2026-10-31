const {
  getReservationMissingFields,
  shouldAskOccasion,
  buildNextFieldQuestion,
} = require('./reservationFunnel');

function normalizeLoose(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Funil curto: trio operacional, depois identidade. Área só se a casa pedir.
 */
function buildSalesPullQuestion(workingState = {}) {
  const state = workingState && typeof workingState === 'object' ? workingState : {};
  const missing = getReservationMissingFields(state);
  if (missing.length === 0 && shouldAskOccasion(state)) {
    return 'É alguma data especial, tipo aniversário?';
  }
  return buildNextFieldQuestion(state) || '';
}

function alreadyAsks(replyText, question) {
  const reply = normalizeLoose(replyText);
  const normalizedQuestion = normalizeLoose(question);
  const probe = normalizedQuestion.slice(0, 28);
  if (probe && reply.includes(probe)) return true;
  if (normalizedQuestion.includes('coberta') && normalizedQuestion.includes('descoberta')) {
    return reply.includes('coberta') && reply.includes('descoberta');
  }
  if (normalizedQuestion.includes('balcao') && normalizedQuestion.includes('praca')) {
    return reply.includes('balcao') && reply.includes('praca');
  }
  return false;
}

function appendSalesPull(replyText, workingState, { skip = false } = {}) {
  const reply = String(replyText || '').trim();
  if (skip) return reply;
  const question = buildSalesPullQuestion(workingState);
  if (!question || alreadyAsks(reply, question)) return reply;
  if (!reply) return question;
  return `${reply} ${question}`;
}

function keepFunnelState(memoryState, establishmentId, dayProgram) {
  const base = {
    ...(memoryState && typeof memoryState === 'object' ? memoryState : {}),
    establishment_id: establishmentId,
  };
  if (base.reservation_date || base.pending_reservation_date_iso || !dayProgram?.iso) {
    return base;
  }
  return {
    ...base,
    pending_reservation_date_iso: dayProgram.iso,
    pending_reservation_date_label: dayProgram.label || dayProgram.iso,
    reservation_date_confirmed: false,
  };
}

function shouldSkipSalesPull(topicHints = []) {
  return (topicHints || []).includes('eventos_corporativos');
}

module.exports = {
  buildSalesPullQuestion,
  appendSalesPull,
  keepFunnelState,
  shouldSkipSalesPull,
};
