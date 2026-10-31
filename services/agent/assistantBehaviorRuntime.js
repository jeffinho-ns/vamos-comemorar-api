const { looksLikeReservationIntent } = require('./reservationDateHint');
const { isInformationalFaqTurn } = require('./faqTopicCanonical');

const DEFAULT_HANDOFF =
  'Já chamei alguém da equipe pra continuar com você por aqui, beleza?';

function asRecord(value) {
  return value && typeof value === 'object' ? value : {};
}

function behaviorConfig(settings) {
  return asRecord(asRecord(settings).behavior_config);
}

function handoffMessage(settings) {
  const custom = String(behaviorConfig(settings).mensagem_atendimento_humano || '').trim();
  return custom || DEFAULT_HANDOFF;
}

function normalize(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function looksLikeInsistence(text) {
  const n = normalize(text);
  if (!n) return false;
  return (
    /\b(atendente|gerente|humano|pessoa real|falar com (alguem|a equipe|voces))\b/.test(n) ||
    /\b(quero falar com|me passa|chama) (o |a )?(atendente|gerente|equipe)\b/.test(n) ||
    /\b(nao (esta|ta) adiantando|ninguem me responde|so quero um humano)\b/.test(n)
  );
}

function looksLikeOffArea(text) {
  const n = normalize(text);
  if (!n) return false;
  return (
    /\b(vaga de emprego|curriculo|trabalhar (ai|ai|com voces)|fornecedor|orcamento de locacao|imprensa|assessoria)\b/.test(
      n
    ) || /\b(evento corporativo|formatura|festa fechada|alugar a casa)\b/.test(n)
  );
}

function looksLikeVisitWithoutReservation(text) {
  const n = normalize(text);
  if (!n) return false;
  return /\b(sem reserva|entrar sem|ir sem reservar|posso (so )?chegar|fila da porta)\b/.test(n);
}

function looksLikeCancel(text) {
  const n = normalize(text);
  if (!n) return false;
  return /\b(cancelar|desmarcar|desistir da reserva|nao quero mais (ir|a reserva))\b/.test(n);
}

function looksLikeMenuAsk(text) {
  const n = normalize(text);
  return /\b(cardapio|menu|o que (tem|serve) pra (comer|beber)|tem drink)\b/.test(n);
}

/**
 * Aplica as flags da aba Comportamento. Não mexe em reserva já criada
 * nem substitui os guards de vaga/área.
 */
function evaluateAssistantBehavior({
  settings = null,
  userText = '',
  errorCode = null,
  houseIsOpen = true,
} = {}) {
  const cfg = behaviorConfig(settings);
  const text = String(userText || '').trim();
  const afterHours = String(cfg.fora_horario_comportamento || 'padrao').trim();

  if (errorCode && cfg.chamar_humano_erro === true) {
    return { action: 'handoff', replyText: handoffMessage(settings), reason: 'chamar_humano_erro' };
  }

  if (houseIsOpen === false && afterHours === 'silencio') {
    return { action: 'silence', replyText: '', reason: 'fora_horario_silencio' };
  }
  if (houseIsOpen === false && afterHours === 'encaminhar_humano') {
    return {
      action: 'handoff',
      replyText: handoffMessage(settings),
      reason: 'fora_horario_humano',
    };
  }
  if (houseIsOpen === false && afterHours === 'avisar_horario') {
    return {
      action: 'reply',
      replyText:
        'Agora a casa está fora do horário de atendimento. Assim que a equipe estiver por aqui a gente te responde, tá bem?',
      reason: 'fora_horario_aviso',
    };
  }

  if (cfg.nao_informar_reservas === true && looksLikeReservationIntent(text)) {
    return {
      action: 'handoff',
      replyText: handoffMessage(settings),
      reason: 'nao_informar_reservas',
    };
  }

  if (cfg.bloquear_visita_sem_reserva === true && looksLikeVisitWithoutReservation(text)) {
    return {
      action: 'reply',
      replyText:
        'Pra entrar a gente precisa de reserva. Me diz a data, o horário que pretende chegar e quantas pessoas vai levar?',
      reason: 'bloquear_visita_sem_reserva',
    };
  }

  if (cfg.bloquear_info_menu === true && looksLikeMenuAsk(text) && !looksLikeReservationIntent(text)) {
    return {
      action: 'reply',
      replyText: 'O cardápio completo eu te mando no link oficial da casa, tá?',
      reason: 'bloquear_info_menu',
    };
  }

  if (cfg.chamar_humano_insistencia === true && looksLikeInsistence(text)) {
    return { action: 'handoff', replyText: handoffMessage(settings), reason: 'insistencia' };
  }

  if (
    cfg.chamar_humano_fora_area === true &&
    looksLikeOffArea(text) &&
    !looksLikeReservationIntent(text) &&
    !isInformationalFaqTurn(text)
  ) {
    return { action: 'handoff', replyText: handoffMessage(settings), reason: 'fora_area' };
  }

  if (cfg.cancelador_sutil === true && looksLikeCancel(text)) {
    return {
      action: 'reply',
      replyText:
        'Sem problema. Se quiser só ajustar, eu chamo a equipe e eles resolvem com calma. Pode ser?',
      reason: 'cancelador_sutil',
    };
  }

  return { action: 'continue', replyText: '', reason: null };
}

function shouldSendStickers(settings) {
  const cfg = behaviorConfig(settings);
  return cfg.considerar_figurinhas !== false;
}

function shouldIgnoreInstagramComments(settings) {
  return behaviorConfig(settings).ignorar_comentarios_instagram === true;
}

function inactivityLimitMinutes(settings) {
  const raw = Number(behaviorConfig(settings).tempo_limite_inatividade);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 0;
}

module.exports = {
  evaluateAssistantBehavior,
  handoffMessage,
  looksLikeInsistence,
  looksLikeOffArea,
  looksLikeVisitWithoutReservation,
  looksLikeCancel,
  shouldSendStickers,
  shouldIgnoreInstagramComments,
  inactivityLimitMinutes,
};
