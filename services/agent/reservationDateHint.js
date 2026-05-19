const {
  resolveDateFromText,
  resolveDateFromConversation,
  formatReservationDateLabels,
  buildTodayCalendarLabels,
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

function looksLikeRelativeDateQuestion(text) {
  const normalized = String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  if (!normalized) return false;
  const asksCalendar =
    /\b(qual dia|que dia|dia do mes|data seria|data e|data é|quando e|quando é|que data|em que dia)\b/.test(
      normalized
    );
  const mentionsWeekday =
    /\b(domingo|segunda|terca|quarta|quinta|sexta|sabado|proximo|proxima|essa|nesta)\b/.test(
      normalized
    );
  return asksCalendar || (mentionsWeekday && /\b(proximo|proxima|essa|nesta|sabado|sexta)\b/.test(normalized));
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

function buildCalendarFactsBlock(referenceDateIso, parsedIso = null) {
  const today = buildTodayCalendarLabels(referenceDateIso);
  const lines = [
    'CALENDÁRIO DO SISTEMA (America/Sao_Paulo — use SOMENTE estes fatos para falar de datas; nunca invente ano ou dia):',
    `- Hoje: ${today.confirmationPhrase || today.fullDate} (ISO ${today.iso}).`,
    `- Ano atual da operação: ${String(referenceDateIso || today.iso).slice(0, 4)}.`,
    '- Proibido citar datas em 2023, 2024 ou 2025 salvo se o cliente escrever essa data explicitamente.',
  ];
  if (parsedIso) {
    const target = formatReservationDateLabels(parsedIso);
    lines.push(
      `- Data relativa interpretada pelo sistema: ${target.confirmationPhrase || target.fullDate} (ISO ${parsedIso}).`
    );
    lines.push(
      `- Se o cliente perguntar "qual dia do mês" ou "que data é", responda com: ${target.confirmationPhrase || target.fullDate}.`
    );
  }
  return lines.join('\n');
}

/**
 * Interpreta data relativa na mensagem (e no histórico recente) e orienta o agente.
 */
function buildReservationDateHint({
  userText,
  referenceDateIso,
  workingState = {},
  messageHistory = [],
} = {}) {
  const text = String(userText || '').trim();
  const state = workingState && typeof workingState === 'object' ? workingState : {};
  const calendarBase = buildCalendarFactsBlock(referenceDateIso);

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
      promptBlock: `${calendarBase}\n\nDATA CONFIRMADA pelo cliente: ${label} (${state.pending_reservation_date_iso}). Pode usar esta data em verificar_disponibilidade e criar_pre_reserva.`,
      confirmed: true,
    };
  }

  const inReservationFlow =
    looksLikeReservationIntent(text) ||
    Boolean(state.pending_reservation_date_iso) ||
    Boolean(state.reservation_date) ||
    looksLikeRelativeDateQuestion(text);

  const parsed = resolveDateFromConversation(text, messageHistory);
  const activeIso =
    (parsed.ok && parsed.iso) ||
    state.pending_reservation_date_iso ||
    (state.reservation_date_confirmed ? state.reservation_date : null);

  if (looksLikeRelativeDateQuestion(text) && activeIso) {
    const labels = formatReservationDateLabels(activeIso);
    return {
      patch: parsed.ok
        ? {
            pending_reservation_date_iso: activeIso,
            pending_reservation_date_label: labels.confirmationPhrase,
            reservation_date_confirmed: false,
          }
        : {},
      promptBlock: `${buildCalendarFactsBlock(referenceDateIso, activeIso)}\n\nO cliente quer saber o dia no calendário. Responda de forma direta usando a data acima (ex.: "${labels.confirmationPhrase}"). Não invente outra data.`,
      confirmed: false,
    };
  }

  if (!parsed.ok || !inReservationFlow) {
    if (state.reservation_date_confirmed && state.reservation_date) {
      const labels = formatReservationDateLabels(state.reservation_date);
      return {
        patch: {},
        promptBlock: `${calendarBase}\n\nData já confirmada nesta conversa: ${labels.confirmationPhrase || state.reservation_date} (${state.reservation_date}).`,
        confirmed: true,
      };
    }
    if (inReservationFlow) {
      return {
        patch: {},
        promptBlock: `${calendarBase}\n\nSe o cliente mencionar dia da semana (sexta, próximo sábado, etc.), use o calendário do sistema — nunca chute datas de memória do modelo.`,
        confirmed: false,
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
      promptBlock: `${buildCalendarFactsBlock(referenceDateIso, parsed.iso)}\n\nINTERPRETAÇÃO DE DATA (confirme com o cliente ANTES de verificar_disponibilidade ou criar_pre_reserva):
Pergunte de forma natural, por exemplo: "Você quer dizer ${phrase}?"
NÃO chame ferramentas de reserva até o cliente confirmar (sim, isso, pode ser, confirmo).
Se ele perguntar qual dia do mês é, responda: ${labels.confirmationPhrase}.`,
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
    promptBlock: `${buildCalendarFactsBlock(referenceDateIso, parsed.iso)}\n\nData interpretada: ${labels.confirmationPhrase || parsed.iso} (${parsed.iso}).`,
    confirmed: true,
  };
}

module.exports = {
  buildReservationDateHint,
  looksLikeReservationIntent,
  looksLikeRelativeDateQuestion,
  isAffirmativeConfirmation,
  buildCalendarFactsBlock,
};
