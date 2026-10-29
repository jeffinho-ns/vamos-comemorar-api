const { getReservationMissingFields, shouldAskOccasion } = require('./reservationFunnel');

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

function joinPt(parts) {
  const items = (parts || []).filter(Boolean);
  if (items.length <= 1) return items[0] || '';
  if (items.length === 2) return `${items[0]} e ${items[1]}`;
  return `${items.slice(0, -1).join(', ')} e ${items[items.length - 1]}`;
}

/**
 * Poucas perguntas, juntando o que ainda falta.
 * No Seu Justino o cliente só escolhe coberta ou descoberta.
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

  const houseId = Number(state.establishment_id);
  const hasArea = hasText(state.area_label) || hasText(state.area_preferida) || hasText(state.justino_zone);
  const ops = [];
  if (missing.includes('reservation_time')) ops.push('qual horário');
  if (missing.includes('quantidade_convidados')) ops.push('para quantas pessoas');
  if (houseId === 1 && !hasArea) ops.push('se prefere área coberta ou descoberta');
  if (ops.length > 0) {
    if (ops.length === 1 && missing.includes('reservation_time')) {
      return 'Qual horário fica melhor pra você?';
    }
    if (ops.length === 1 && missing.includes('quantidade_convidados')) {
      return 'Para quantas pessoas?';
    }
    if (ops.length === 1) {
      return 'Você prefere área coberta ou área descoberta?';
    }
    return `Pra eu já deixar a mesa, me conta ${joinPt(ops)}?`;
  }

  const identity = [];
  if (missing.includes('client_name')) identity.push('nome completo');
  if (missing.includes('client_email')) identity.push('e-mail');
  if (missing.includes('data_nascimento')) identity.push('data de nascimento (DD/MM/AAAA)');
  if (shouldAskOccasion(state)) identity.push('se é alguma data especial, tipo aniversário');
  if (identity.length > 0) {
    const next = identity[0];
    if (next.startsWith('nome')) return 'Me passa seu nome completo?';
    if (next.startsWith('e-mail')) return 'Qual o seu e-mail?';
    if (next.startsWith('data de nascimento')) return 'Qual a data de nascimento?';
    return 'É alguma data especial, tipo aniversário?';
  }
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
