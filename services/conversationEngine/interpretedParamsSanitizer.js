/**
 * Higieniza os params extraídos pelo LLM antes de validar/persistir.
 *
 * O LLM (gpt-4o, gpt-5.x) frequentemente "alucina" campos a partir de
 * contexto fraco — extrai data_nascimento de uma data de reserva, copia
 * a pergunta do cliente para client_name, etc. Esses params caem direto
 * no validador, geram FailureResults, e a mensagem técnica vaza pro
 * cliente ("Para reservar conosco é necessário ter 18 anos", "Preciso
 * de valor numérico para área"…).
 *
 * Este módulo é o "primeiro filtro": joga fora valores claramente
 * suspeitos ANTES de qualquer validação, evitando bloqueios falsos.
 */

const VERB_OR_QUESTION_HINTS = [
  /\b(quero|queria|gostaria|preciso|posso|seria|tenho|vou|fazer|saber|comemorar|reservar)\b/i,
  /\?$/,
  /\b(qual|como|onde|porque|por que|valores?|prec[oç]os?|horario|hor[aá]rio|funciona|aniversario|aniversário)\b/i,
];

const FORBIDDEN_NAME_TOKENS = [
  'cliente', 'usuario', 'usuário', 'comemorar', 'reserva', 'reservar',
  'aniversario', 'aniversário', 'sim', 'nao', 'não', 'ok', 'okay',
  'obrigado', 'obrigada', 'tchau', 'oi', 'ola', 'olá', 'boa', 'bom',
  'mais', 'tarde', 'noite', 'manhã', 'manha', 'dia', 'frente', 'depois',
  'beleza', 'show', 'top', 'gostaria', 'quero', 'queria', 'preciso',
  'pode', 'posso', 'saber', 'valores', 'preço', 'preco', 'preços',
];

/**
 * Decide se um candidato a client_name parece de fato ser um nome
 * humano. Retorna false para frases tipo "Gostaria de saber os valores"
 * ou "Mais para frente entro em contato".
 */
function looksLikeRealHumanName(value) {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (trimmed.length < 4 || trimmed.length > 80) return false;

  for (const re of VERB_OR_QUESTION_HINTS) {
    if (re.test(trimmed)) return false;
  }

  const normalized = trimmed
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  const tokens = normalized.split(/\s+/).filter(Boolean);

  if (tokens.length < 2) return false;

  let forbiddenHits = 0;
  for (const token of tokens) {
    if (FORBIDDEN_NAME_TOKENS.includes(token)) forbiddenHits += 1;
  }
  if (forbiddenHits >= 2) return false;
  if (forbiddenHits >= 1 && tokens.length <= 3) return false;

  const tokenChars = /^[a-zA-ZÀ-ÿ'.-]+$/;
  for (const token of trimmed.split(/\s+/)) {
    if (!tokenChars.test(token)) return false;
  }

  return true;
}

/**
 * Decide se um candidato a data_nascimento é plausível como nascimento
 * humano (idade entre 16 e 120 anos). Datas futuras, datas a 5 anos no
 * passado (alucinação típica de "20h" → "2020-05-XX"), etc. são rejeitadas.
 */
function looksLikePlausibleBirthDate(iso) {
  if (typeof iso !== 'string') return false;
  const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const year = Number(match[1]);
  const today = new Date();
  const currentYear = today.getFullYear();
  const age = currentYear - year;
  if (age < 16) return false;
  if (age > 120) return false;
  return true;
}

/**
 * Sanitiza params interpretados pelo LLM. Retorna um objeto com:
 *   - cleaned: novos params, sem os campos suspeitos
 *   - dropped: array de { field, reason } pra log/debug
 *
 * O contexto inclui:
 *   - userMessage: texto cru do turno do cliente (pra heurística de "campo
 *     alucinado": se data_nascimento veio mas a msg do cliente tem só
 *     uma data e horário, descarta).
 *   - lockedEstablishmentId: se a conversa já tem casa fixada, qualquer
 *     mudança de establishment_id que NÃO seja mencionada explicitamente
 *     na mensagem é descartada (bug do Highline → Reserva Rooftop).
 *   - establishmentMentionedInMessage: se a mensagem do cliente menciona
 *     uma casa pelo nome completo (sinaliza intenção real de troca).
 */
function sanitizeInterpretedParams(params, context = {}) {
  if (!params || typeof params !== 'object') {
    return { cleaned: {}, dropped: [] };
  }

  const cleaned = { ...params };
  const dropped = [];
  const userMessage = String(context.userMessage || '').trim();

  if (cleaned.client_name !== undefined && cleaned.client_name !== null) {
    if (!looksLikeRealHumanName(cleaned.client_name)) {
      dropped.push({ field: 'client_name', reason: 'not_humanlike', value: cleaned.client_name });
      delete cleaned.client_name;
    }
  }

  if (cleaned.data_nascimento !== undefined && cleaned.data_nascimento !== null) {
    if (!looksLikePlausibleBirthDate(String(cleaned.data_nascimento))) {
      dropped.push({
        field: 'data_nascimento',
        reason: 'implausible_birth_year',
        value: cleaned.data_nascimento,
      });
      delete cleaned.data_nascimento;
    } else if (userMessage && userMessage.length <= 24) {
      // Mensagem curta tipo "30/05 20h" / "13/06" — provavelmente o LLM
      // confundiu data de reserva com nascimento. Só aceita se o cliente
      // disse explicitamente "nasc", "nascimento" ou um ano de 4 dígitos.
      const userMsgHasBirthCue = /\b(nasc|nascimento|aniversari|ano de|\d{4})\b/i.test(userMessage);
      if (!userMsgHasBirthCue) {
        dropped.push({
          field: 'data_nascimento',
          reason: 'no_birth_cue_in_short_message',
          value: cleaned.data_nascimento,
          userMessage,
        });
        delete cleaned.data_nascimento;
      }
    }
  }

  if (cleaned.establishment_id !== undefined && cleaned.establishment_id !== null) {
    const newId = Number(cleaned.establishment_id);
    const lockedId = Number(context.lockedEstablishmentId);
    if (
      Number.isFinite(lockedId) &&
      lockedId > 0 &&
      Number.isFinite(newId) &&
      newId > 0 &&
      newId !== lockedId
    ) {
      const explicitlyMentioned = Boolean(context.establishmentMentionedInMessage);
      if (!explicitlyMentioned) {
        dropped.push({
          field: 'establishment_id',
          reason: 'silent_switch_blocked',
          from: lockedId,
          to: newId,
        });
        cleaned.establishment_id = lockedId;
      }
    }
  }

  return { cleaned, dropped };
}

module.exports = {
  sanitizeInterpretedParams,
  looksLikeRealHumanName,
  looksLikePlausibleBirthDate,
};
