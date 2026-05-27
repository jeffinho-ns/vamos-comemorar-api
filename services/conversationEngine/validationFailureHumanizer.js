/**
 * Converte mensagens técnicas dos validadores em respostas humanizadas
 * de WhatsApp. Nunca deixa o cliente ler "Preciso de um valor numérico
 * válido para área" ou "BIRTHDATE_INVALID".
 *
 * Decide também se a falha justifica enviar mensagem ao cliente. Quando
 * a falha é "alucinada" (LLM extraiu campo do nada), retornamos
 * { skip: true } pra que o turno apenas siga sem disparar nada técnico.
 */

const HUMAN_BY_CODE = {
  INVALID_NUMBER: (field) => {
    const f = String(field || '').toLowerCase();
    if (f.includes('área') || f.includes('area')) {
      return 'Em qual área você prefere — Deck, Bar ou Rooftop? Se não tiver preferência, eu te indico a melhor.';
    }
    if (f.includes('pessoas') || f.includes('quantidade')) {
      return 'Quantas pessoas vão com você?';
    }
    if (f.includes('estabelecimento')) {
      return 'Em qual casa você quer reservar?';
    }
    return 'Pode me confirmar essa informação de novo, por favor?';
  },
  NAME_INCOMPLETE: () => 'Me passa seu nome completo (nome e sobrenome) pra eu deixar a reserva no seu nome?',
  NAME_TOO_SHORT: () => 'Me confirma seu nome completo, por favor?',
  EMAIL_INVALID: () => 'Esse e-mail tá com formato meio estranho. Pode conferir e me mandar de novo?',
  EMAIL_DOMAIN_INVALID: () => 'Hmm, esse domínio do e-mail não bate. Pode me passar outro e-mail válido?',
  BIRTHDATE_INVALID: () => 'Me passa sua data de nascimento no formato DD/MM/AAAA pra eu confirmar +18?',
  BIRTHDATE_IMPLAUSIBLE: () => 'Acho que essa data de nascimento ficou meio estranha. Pode conferir e mandar de novo no formato DD/MM/AAAA?',
  UNDERAGE: () =>
    'Poxa, obrigada pelo contato! Mas a casa é só pra maiores de 18. Se você for menor, peça pra alguém responsável seguir por aqui que eu te ajudo a fechar a reserva, beleza?',
  DATE_INVALID: () => 'Não consegui entender essa data. Pode me mandar no formato DD/MM (ex.: 30/05)?',
  DATE_IN_PAST: () => 'Essa data já passou. Pra qual dia você quer reservar?',
  DATE_TOO_FAR: () => 'Essa data tá bem distante. Pode me confirmar qual dia exatamente?',
  TIME_INVALID: () => 'Pode me mandar o horário no formato HH:mm (ex.: 20h ou 20:30)?',
  NO_WINDOWS: () =>
    'Nesse dia/horário a casa não tá com vaga aberta. Quer tentar outro dia ou outro horário?',
  PARTY_TOO_BIG: () => 'Pra um grupo desse tamanho a gente trata como evento especial. Já vou chamar alguém do time pra te atender.',
};

/**
 * Heurística pra decidir se a falha veio de alucinação do LLM (cliente
 * NÃO enviou o campo de fato). Nesses casos, NÃO mandamos a mensagem
 * técnica — só registramos no log e seguimos o turno com a próxima
 * pergunta natural do funil.
 */
function isLikelyHallucinatedField(failure, context = {}) {
  if (!failure) return false;
  const userMessage = String(context.userMessage || '').trim();
  const field = String(failure.fieldName || '').toLowerCase();
  const code = String(failure.code || '').toUpperCase();

  // UNDERAGE a partir de data curta do cliente é quase sempre alucinação
  // (LLM confundiu "30/05" / "13/06" com data de nascimento).
  if (code === 'UNDERAGE' && userMessage.length <= 16) return true;
  if (code === 'BIRTHDATE_IMPLAUSIBLE' && userMessage.length <= 16) return true;

  // INVALID_NUMBER pra area_id quando o cliente respondeu palavra (Rooftop,
  // Deck, etc.) — o LLM passou string, validator rejeitou. Não é "erro
  // do cliente", é o pipeline. Seguir o funil sem barrar.
  if (code === 'INVALID_NUMBER' && (field.includes('área') || field.includes('area'))) {
    if (userMessage && !/^\d+$/.test(userMessage)) return true;
  }

  return false;
}

function humanizeFailure(failure, context = {}) {
  if (!failure) {
    return { skip: false, message: 'Pode me confirmar essa última informação de novo?' };
  }

  if (isLikelyHallucinatedField(failure, context)) {
    return { skip: true, reason: 'likely_hallucination', code: failure.code };
  }

  const code = String(failure.code || '').toUpperCase();
  const builder = HUMAN_BY_CODE[code];
  if (builder) {
    return { skip: false, message: builder(failure.fieldName) };
  }

  // Sem mapping específico — fallback genérico que NUNCA é técnico.
  return {
    skip: false,
    message: 'Hmm, deixa eu te ajudar com isso de outro jeito. Me confirma a informação anterior, por favor?',
  };
}

module.exports = {
  humanizeFailure,
  isLikelyHallucinatedField,
};
