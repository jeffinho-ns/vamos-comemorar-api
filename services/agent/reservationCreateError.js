const { buildNextFieldQuestion, buildBirthFromAgeQuestion } = require('./reservationFunnel');

const DUPLICATE_REPLY =
  'Essa reserva já está no sistema. Quer que eu chame a equipe se precisar ajustar?';
const OCCUPIED_REPLY = 'Esse horário nessa área acabou de lotar. Prefere outro horário?';

function normalizeError(toolResult = {}) {
  return String(toolResult.error || toolResult.message || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function isDuplicate(toolResult = {}) {
  if (toolResult.duplicate === true) return true;
  return /\bduplic|ja tem reserva confirmada|ja esta anotada/.test(normalizeError(toolResult));
}

function isOccupied(toolResult = {}) {
  if (toolResult.todas_areas_cheias === true) return true;
  return /\b(cheia|cheio|sem mesa|lotad|ocupad|nao comporta|todas as areas)\b/.test(
    normalizeError(toolResult)
  );
}

function isBirthValidation(toolResult = {}) {
  return /\+18|nascimento|maiores de 18/.test(normalizeError(toolResult));
}

function isAreaValidation(toolResult = {}) {
  const err = normalizeError(toolResult);
  if (isOccupied(toolResult)) return false;
  return /\barea\b|coberta|descoberta|balcao|praca|invalida/.test(err);
}

function areaUnlockQuestion(workingState = {}) {
  const id = Number(workingState.establishment_id);
  if (id === 1) return 'Prefere área coberta ou área descoberta?';
  if (id === 8) return 'Prefere Balcão ou Praça?';
  return 'Qual área você prefere?';
}

function birthUnlockQuestion(workingState = {}) {
  if (workingState.pending_birth_from_age) return buildBirthFromAgeQuestion();
  return 'Por último, sua data de nascimento (DD/MM/AAAA) pra eu confirmar +18.';
}

function humanizeCreateError(toolResult = {}, workingState = {}) {
  if (isDuplicate(toolResult)) {
    return { replyText: DUPLICATE_REPLY };
  }
  if (toolResult.needs_area_switch && toolResult.error) {
    return { replyText: String(toolResult.error).trim() };
  }
  if (isOccupied(toolResult)) {
    return { replyText: OCCUPIED_REPLY };
  }
  if (isBirthValidation(toolResult)) {
    return { replyText: birthUnlockQuestion(workingState) };
  }
  if (isAreaValidation(toolResult)) {
    return { replyText: areaUnlockQuestion(workingState) };
  }
  const question = buildNextFieldQuestion(workingState);
  if (question) {
    return { replyText: `Não consegui fechar a reserva agora. ${question}` };
  }
  return { replyText: 'Não consegui fechar a reserva agora. Prefere outro horário?' };
}

module.exports = { humanizeCreateError };
