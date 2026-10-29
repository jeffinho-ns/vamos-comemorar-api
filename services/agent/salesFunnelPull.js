const { getReservationMissingFields } = require('./reservationFunnel');
const { listJustinoAreaQuestion } = require('./seuJustinoReservationAreas');

function hasText(value) {
  return String(value || '').trim().length > 0;
}

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
 * Uma pergunta só, no ponto em que a reserva parou.
 * No Seu Justino, a área coberta ou descoberta entra antes do nome.
 */
function buildSalesPullQuestion(workingState = {}) {
  const state = workingState && typeof workingState === 'object' ? workingState : {};
  const missing = getReservationMissingFields(state);
  const next = missing.find((key) => key !== 'establishment_id') || '';

  if (next === 'reservation_date_confirm' || (!state.reservation_date && state.pending_reservation_date_iso)) {
    const label = state.pending_reservation_date_label || state.pending_reservation_date_iso;
    return label ? `Quer que eu reserve para ${label}?` : 'Pra quando seria a reserva?';
  }
  if (next === 'reservation_date') return 'Pra quando seria a reserva?';
  if (next === 'reservation_time') return 'Qual horário fica melhor pra você?';
  if (next === 'quantidade_convidados') return 'Quantas pessoas vão?';

  const houseId = Number(state.establishment_id);
  const hasArea = hasText(state.area_label) || hasText(state.area_preferida);
  if (houseId === 1 && !hasArea) {
    return listJustinoAreaQuestion(state.justino_zone);
  }
  if (next === 'client_name') return 'Me confirma seu nome completo?';
  if (next === 'client_email') return 'Qual seu e-mail?';
  if (next === 'data_nascimento') return 'E sua data de nascimento?';
  return '';
}

function alreadyAsks(replyText, question) {
  const reply = normalizeLoose(replyText);
  const probe = normalizeLoose(question).slice(0, 28);
  return Boolean(probe) && reply.includes(probe);
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
