'use strict';

/**
 * Uma ficha de Informações adicionais pode ser duas coisas:
 * - resposta pronta para o cliente (endereço, preço, horário, link);
 * - orientação para a SOL (pergunte, ofereça, não envie, só depois).
 * Orientação não pode ir copiada no WhatsApp.
 */

const COACHING_PATTERNS = [
  /^(se (?:pedirem|perguntarem|solicitarem|o cliente (?:quiser|pedir|perguntar|solicitar)))\b/i,
  /^quando (?:pedirem|couber|a reserva)\b/i,
  /\b(primeiro pergunte|pergunte o motivo|pergunte se|sempre pergunt\w*|peça |pede |ofereça remarcar|ofereca remarcar|lembre um benef[ií]cio)\b/i,
  /\b(não ofereça|nao ofereça|nunca ofereça|não envie|nao envie|só sai depois|so sai depois|só cancele|so cancele)\b/i,
  /\b(cite s[oó]|diga s[oó]|passe na hora|passe o atendimento|pare de responder|siga o fluxo|avise que)/i,
  /\b(após se apresentar|depois de se apresentar)\b/i,
  /\bantes de (enviar|passar|confirmar o link|mandar)\b/i,
];

const FACT_RE = /R\$\s?\d|https?:\/\/|\b\d{1,2}h\b|\b\d{1,2}:\d{2}\b|\brua\b|\bavenida\b|@[\w.-]+\.[a-z]{2,}/i;

const INSTRUCTION_PREFIX_RE = /^(?:REGRA|INSTRU(?:Ç|C)ÃO|ORIENTA(?:Ç|C)ÃO)\s*:\s*/i;

function stripInstructionPrefix(answer) {
  return String(answer || '').replace(INSTRUCTION_PREFIX_RE, '').trim();
}

function splitFaqSentences(text) {
  const raw = String(text || '').replace(/\r/g, '').trim();
  if (!raw) return [];
  return raw
    .split(/\n+/)
    .flatMap((line) => {
      const trimmed = line.trim();
      if (!trimmed) return [];
      return trimmed.split(/(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚÂÊÔÃÕÇ0-9"“])/);
    })
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function isCoachingSentence(sentence) {
  const text = String(sentence || '').trim();
  if (!text) return false;
  const coaching = COACHING_PATTERNS.some((pattern) => pattern.test(text));
  if (!coaching) return false;
  const startsAsInstruction = /^(se pedirem|se perguntarem|se o cliente|quando couber|quando pedirem|cite s[oó]|diga s[oó]|não ofereça|nao ofereça)/i.test(
    text
  );
  if (FACT_RE.test(text) && !startsAsInstruction) return false;
  return true;
}

function analyzeFaqAnswer(answer) {
  const cleaned = stripInstructionPrefix(answer);
  const sentences = splitFaqSentences(cleaned);
  const coaching = [];
  const speech = [];
  for (const sentence of sentences) {
    if (isCoachingSentence(sentence)) coaching.push(sentence);
    else speech.push(sentence);
  }
  const mode = !coaching.length ? 'reply' : !speech.length ? 'instruction' : 'mixed';
  const execute =
    mode === 'instruction' ||
    (mode === 'mixed' &&
      coaching.length >= speech.length &&
      isCoachingSentence(sentences[0] || ''));
  return {
    mode,
    execute,
    speech: speech.join(' ').trim(),
    coaching: coaching.join(' ').trim(),
    cleaned,
  };
}

function shouldExecuteAsInstruction(answer) {
  return analyzeFaqAnswer(answer).execute;
}

function customerFacingFaqText(answer) {
  const analyzed = analyzeFaqAnswer(answer);
  if (analyzed.execute) return '';
  if (analyzed.mode === 'reply') return String(answer || '').trim();
  return analyzed.speech;
}

function looksLikePolicyQuestion(text) {
  const line = String(text || '').trim();
  if (!line) return true;
  if (line.length < 90 && /pode me explicar|o que (é|e)|como funciona|me fala sobre|sobre cancelamento/i.test(line)) {
    return true;
  }
  return false;
}

function userLines(userText, history = []) {
  return [...(history || []), { role: 'user', content: userText }]
    .filter((item) => item && item.role !== 'assistant')
    .map((item) => String(item.content || '').trim())
    .filter(Boolean);
}

function clientAlreadyExplained(userText, history) {
  return userLines(userText, history).some((line) => !looksLikePolicyQuestion(line) && line.length > 18);
}

function assistantAlreadyAskedToConfirm(history) {
  return (history || []).some(
    (item) =>
      item?.role === 'assistant' &&
      /quer mesmo cancelar|remarcar/i.test(String(item.content || ''))
  );
}

function isCancelConfirmation(line) {
  const text = String(line || '').trim();
  if (!text || looksLikePolicyQuestion(text)) return false;
  if (/^(n[aã]o|nao)\b/i.test(text)) return false;
  if (/remarcar|outro dia|adiar/i.test(text) && !/cancel/i.test(text)) return false;
  if (/^(sim|ok|isso|confirma|confirmo|pode|quero)$/i.test(text)) return true;
  if (/^(cancela|cancelar)$/i.test(text)) return true;
  return /\b(quero cancelar|pode cancelar|cancela de vez|cancelar de vez|confirmo o cancelamento)\b/i.test(
    text
  );
}

function clientConfirmedCancel(userText, history) {
  if (!assistantAlreadyAskedToConfirm(history)) return false;
  return isCancelConfirmation(userText);
}

/**
 * Próximo passo da orientação, em fala de WhatsApp, quando o modelo não entra.
 * Nunca devolve o texto da ficha.
 */
function fallbackInstructionReply(answer, userText = '', history = []) {
  const analyzed = analyzeFaqAnswer(answer);
  const text = `${analyzed.coaching} ${analyzed.cleaned}`.trim();

  if (/cancel/i.test(text) && /pergunte o motivo/i.test(text)) {
    if (!clientAlreadyExplained(userText, history)) {
      return 'Claro. Me conta o motivo, com calma? Quero entender o que aconteceu antes de seguir.';
    }
    if (!clientConfirmedCancel(userText, history)) {
      return 'Entendi. Você quer mesmo cancelar, ou prefere que eu veja outro dia pra remarcar?';
    }
    return 'Combinado. Vou chamar uma pessoa da equipe para te mostrar o procedimento do cancelamento.';
  }

  if (/já conhece/i.test(text) && /pergunt/i.test(text)) {
    // Só na abertura. No meio da conversa/reserva isso trava o fechamento.
    const alreadyTalking = (history || []).some((item) => item?.role === 'assistant');
    const midReservation = userLines(userText, history).some((line) =>
      /\b(reserv\w*|data|horario|horário|pessoas|convidados|anivers[aá]rio|mesa|coberta|descoberta)\b/i.test(
        line
      )
    );
    if (alreadyTalking || midReservation) {
      return 'Me conta o que você quer saber, que eu te oriento por aqui.';
    }
    return 'Oi! Você já conhece a casa?';
  }

  if (/flyer/i.test(text) && /foto/i.test(text)) {
    return 'Quando a reserva de aniversário estiver fechada, eu monto um flyer pra você. Me manda uma foto que a equipe produz e te envia aqui.';
  }

  const preference = text.match(/pergunte se prefere ([^.?]{8,160})/i);
  if (preference) {
    return `Claro. Você prefere ${preference[1].trim()}?`;
  }

  const ask = text.match(
    /pergunte\s+((?:o|a|se|qual|quais|como|quantas|quando)\s+[^.]{4,120})/i
  );
  if (ask) {
    const core = ask[1].replace(/\s+com calma\b/i, '').trim();
    return `Claro. Me conta ${core}?`.replace(/\?\?$/, '?');
  }

  return 'Me conta um pouco melhor o que você precisa, que eu te oriento por aqui.';
}

function replyLeaksInstruction(reply, answer) {
  const spoken = String(reply || '').toLowerCase().replace(/\s+/g, ' ');
  const source = stripInstructionPrefix(answer).toLowerCase().replace(/\s+/g, ' ');
  if (!spoken || !source) return false;
  const needle = source.slice(0, 42);
  return needle.length > 24 && spoken.includes(needle);
}

module.exports = {
  analyzeFaqAnswer,
  shouldExecuteAsInstruction,
  customerFacingFaqText,
  fallbackInstructionReply,
  replyLeaksInstruction,
  isCoachingSentence,
};
