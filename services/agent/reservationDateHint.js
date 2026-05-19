const {
  resolveDateFromText,
  formatReservationDateLabels,
} = require('../../nlp/dateResolver');

function looksLikeReservationIntent(text) {
  const normalized = String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  if (!normalized) return false;
  return /\b(reserva|reservar|mesa|horario|horário|convidados|pessoas|lista|aniversario|niver)\b/.test(
    normalized
  );
}

function isAffirmativeConfirmation(text) {
  const normalized = String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
  if (!normalized) return false;
  if (normalized.length > 80) return false;
  return /^(sim|isso|isso mesmo|pode ser|confirmo|confirmado|ok|okay|blz|beleza|perfeito|exato|certo|essa mesma|esse mesmo|ta bom|tá bom|ta certo|tá certo|fechado|combinado|pode|bora)(\s|$|[!.?,])/i.test(
    normalized
  );
}

/**
 * Interpreta data relativa na mensagem e orienta o agente a confirmar com o cliente
 * antes de chamar ferramentas de disponibilidade ou pré-reserva.
 */
function buildReservationDateHint({
  userText,
  referenceDateIso,
  workingState = {},
} = {}) {
  const text = String(userText || '').trim();
  const state = workingState && typeof workingState === 'object' ? workingState : {};

  if (
    isAffirmativeConfirmation(text) &&
    state.pending_reservation_date_iso &&
    !state.reservation_date_confirmed
  ) {
    const label =
      state.pending_reservation_date_label ||
      formatReservationDateLabels(state.pending_reservation_date_iso).confirmationPhrase;
    return {
      patch: {
        reservation_date: state.pending_reservation_date_iso,
        reservation_date_confirmed: true,
        pending_reservation_date_iso: null,
        pending_reservation_date_label: null,
      },
      promptBlock: `DATA CONFIRMADA pelo cliente: ${label} (${state.pending_reservation_date_iso}). Pode usar esta data em verificar_disponibilidade e criar_pre_reserva.`,
      confirmed: true,
    };
  }

  const hasReservationContext =
    looksLikeReservationIntent(text) ||
    Boolean(state.pending_reservation_date_iso) ||
    Boolean(state.reservation_date);

  const parsed = resolveDateFromText(text);
  if (!parsed.ok || !hasReservationContext) {
    if (state.reservation_date_confirmed && state.reservation_date) {
      const labels = formatReservationDateLabels(state.reservation_date);
      return {
        patch: {},
        promptBlock: `Data já confirmada nesta conversa: ${labels.confirmationPhrase || state.reservation_date} (${state.reservation_date}).`,
        confirmed: true,
      };
    }
    return { patch: {}, promptBlock: '', confirmed: false };
  }

  const labels = formatReservationDateLabels(parsed.iso);
  const mustConfirm =
    parsed.needsConfirmation === true ||
    parsed.source === 'weekday_relative' ||
    parsed.confidence === 'medium' ||
    parsed.ambiguous === true;

  if (mustConfirm && !state.reservation_date_confirmed) {
    const phrase = labels.weekdayWithDate || labels.confirmationPhrase || parsed.iso;
    return {
      patch: {
        pending_reservation_date_iso: parsed.iso,
        pending_reservation_date_label: labels.confirmationPhrase || phrase,
        reservation_date_confirmed: false,
      },
      promptBlock: `INTERPRETAÇÃO DE DATA (confirme com o cliente ANTES de verificar_disponibilidade ou criar_pre_reserva):
Leitura do sistema para a mensagem atual: ${labels.confirmationPhrase || phrase} (ISO ${parsed.iso}; hoje no sistema: ${referenceDateIso || 'n/d'}).
Pergunte de forma natural, por exemplo: "Você quer dizer ${phrase}?"
NÃO chame ferramentas de reserva até o cliente confirmar (sim, isso, pode ser, confirmo).
Nesta pergunta de confirmação, não use emojis.`,
      confirmed: false,
    };
  }

  return {
    patch: {
      reservation_date: parsed.iso,
      reservation_date_confirmed: true,
      pending_reservation_date_iso: null,
      pending_reservation_date_label: null,
    },
    promptBlock: `Data interpretada da mensagem: ${labels.confirmationPhrase || parsed.iso} (${parsed.iso}).`,
    confirmed: true,
  };
}

module.exports = {
  buildReservationDateHint,
  looksLikeReservationIntent,
  isAffirmativeConfirmation,
};
