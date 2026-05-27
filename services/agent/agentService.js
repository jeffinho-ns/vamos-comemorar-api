const OpenAI = require('openai');
const { AgentPromptBuilder } = require('./AgentPromptBuilder');
const { getAgentToolDefinitions, executeAgentToolCall } = require('./agentTools');
const {
  mergeWorkingState,
  extractWorkingStatePatchFromToolResult,
} = require('./agentMemoryService');
const {
  isInformationalFaqTurn,
  looksLikeReservationPushOnly,
} = require('./faqTopicCanonical');
const {
  prefetchEstablishmentFaqs,
  loadAllActiveFaqsForEstablishment,
  buildFaqKnowledgeBlock,
  generateFaqGroundedReply,
  resolveFaqTopicsForTurn,
} = require('./faqPrefetchService');
const { looksLikeFreshReservationStart } = require('../conversationEngine/helpers');
const { buildReservationDateHint } = require('./reservationDateHint');
const {
  shouldSkipFaqFirst,
  isReservationFunnelInProgress,
  buildReservationFunnelPromptBlock,
  buildNextFieldQuestion,
  parseReservationFieldsFromUserText,
  shouldAutoRunAvailabilityCheck,
  getReservationMissingFields,
  buildAvailabilityCheckedPatch,
  tryAdvanceFunnelFromUserMessage,
  inferAvailabilityCheckedFromHistory,
  looksLikeAdEntryGreeting,
  detectOpeningGreeting,
  detectClientCorrectingPreviousReply,
  isFirstUserMessageInConversation,
  extractFirstName,
} = require('./reservationFunnel');

let openaiClient = null;
const promptBuilder = new AgentPromptBuilder();

function getOpenAI() {
  if (!openaiClient) {
    const key = process.env.OPENAI_API_KEY;
    if (!key) {
      throw new Error('OPENAI_API_KEY não definida no ambiente.');
    }
    openaiClient = new OpenAI({ apiKey: key });
  }
  return openaiClient;
}

function getReferenceDateIso() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function buildOpenAiMessages(messageHistory, systemPrompt) {
  const messages = [{ role: 'system', content: systemPrompt }];
  for (const item of messageHistory || []) {
    const content = String(item?.content || '').trim();
    if (!content) continue;
    messages.push({
      role: item.role === 'assistant' ? 'assistant' : 'user',
      content,
    });
  }
  if (messages.length === 1) {
    throw new Error('Histórico sem mensagens do usuário para o agente.');
  }
  return messages;
}

function formatReservationDateLabel(isoDate) {
  const iso = String(isoDate || '').slice(0, 10);
  const [year, month, day] = iso.split('-');
  if (year && month && day) return `${day}/${month}/${year}`;
  return 'esse dia';
}

function extractWindowLabels(windows = []) {
  return windows
    .map((window) => {
      if (typeof window === 'string') return window.trim();
      return String(window?.label || window?.start_time || window?.start || '').trim();
    })
    .filter(Boolean)
    .slice(0, 6);
}

function synthesizeAvailabilityFromToolResult(result = {}) {
  if (!result || result.ok === false) return null;

  const dateLabel = formatReservationDateLabel(result.reservation_date);
  const horarioConsultado = String(result.horario_consultado || '').trim().slice(0, 5);

  if (result.is_open === false) {
    return result.note
      ? String(result.note).trim()
      : `Pra ${dateLabel} a casa não abre — quer que eu veja outra data pra você?`;
  }

  if (result.party_size_allowed === false && result.party_size_message) {
    return String(result.party_size_message).trim();
  }

  if (result.capacidade?.pode_reservar === false) {
    const motivos = [];
    if (result.capacidade.lista_espera_no_horario) {
      motivos.push('já tem gente na lista de espera nesse horário');
    }
    if (Number(result.capacidade.vagas_disponiveis) === 0) {
      motivos.push('a casa está quase no limite');
    }
    const extra = motivos.length ? ` (${motivos.join('; ')})` : '';
    const horarioBit = horarioConsultado ? ` às ${horarioConsultado}` : '';
    return `Pra ${dateLabel}${horarioBit} está bem cheio${extra}. Quer testar outro horário ou prefere que eu te coloque na lista de espera?`;
  }

  const labels = extractWindowLabels(result.windows);
  if (labels.length > 0) {
    return `Boa, ${dateLabel} a casa abre! Temos esses horários disponíveis: ${labels.join(', ')}. Qual fica melhor pra você?`;
  }

  if (horarioConsultado && result.capacidade?.pode_reservar === true) {
    return `Perfeito, ${dateLabel} às ${horarioConsultado} tem vaga sim. Pra eu deixar tudo no seu nome, me passa o nome completo, o e-mail e a data de nascimento (DD/MM/AAAA — pra confirmar +18).`;
  }

  if (result.is_open !== false && result.capacidade?.pode_reservar !== false) {
    const pessoas = Number(result.quantidade_pessoas);
    const pessoasBit =
      Number.isFinite(pessoas) && pessoas > 0
        ? ` pra ${pessoas} pessoa${pessoas === 1 ? '' : 's'}`
        : '';
    if (Number.isFinite(pessoas) && pessoas >= 15) {
      return `Show, ${dateLabel}${pessoasBit} a gente organiza com carinho — grupos grandes a equipe acompanha de perto. Pra começar, qual horário fica melhor pra você?`;
    }
    if (pessoasBit) {
      return `Boa, ${dateLabel}${pessoasBit} está liberado. Qual horário fica melhor pra você?`;
    }
    return `Boa, ${dateLabel} está aberto pra reserva. Pra eu seguir, me conta o horário e quantas pessoas vão.`;
  }

  return null;
}

// Pequenas variações de fechamento para não soar como bot quando a mesma
// confirmação acontece muitas vezes ao dia. Seleção é DETERMINÍSTICA com base
// em um seed (geralmente data+hora da reserva) — dentro do mesmo turno a
// frase é estável (importante para os guards e para reprodutibilidade em
// testes), mas entre clientes diferentes varia naturalmente.
const RESERVATION_CLOSING_VARIANTS = [
  'Qualquer coisa, é só chamar.',
  'Te espero aqui — qualquer coisa me chama.',
  'Qualquer dúvida, me dá um toque por aqui.',
];

function pickVariant(variants, seed) {
  if (!Array.isArray(variants) || variants.length === 0) return '';
  const text = String(seed || '');
  if (!text) return variants[0];
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) | 0;
  }
  return variants[Math.abs(hash) % variants.length];
}

function synthesizeReplyFromToolTrace(toolTrace = []) {
  for (let index = toolTrace.length - 1; index >= 0; index -= 1) {
    const entry = toolTrace[index];
    const result = entry?.result;
    if (!result) continue;

    if (entry.name === 'criar_pre_reserva') {
      if (result.pre_reserva) {
        const pre = result.pre_reserva;
        const areaBit = pre.area_label ? ` na ${pre.area_label}` : '';
        const comboBit = pre.mesas_combinadas
          ? ` (combinei ${pre.mesas_combinadas.mesas_count} mesas próximas pra acomodar todo mundo, capacidade total ${pre.mesas_combinadas.total_capacity} pessoas)`
          : '';
        const closing = pickVariant(
          RESERVATION_CLOSING_VARIANTS,
          `${pre.reservation_date || ''}-${pre.reservation_time || ''}-${pre.reservation_id || ''}`
        );
        return `Fechado! Sua reserva ficou pra ${pre.reservation_date} às ${pre.reservation_time}${areaBit}${comboBit}. ${closing}`;
      }
      if (result.duplicate === true) {
        return 'Opa, vi aqui que você já tem reserva pra esse mesmo dia e horário — não precisa mandar outra. Se quiser ajustar algo (data, horário ou número de pessoas), é só me chamar por aqui que eu peço pra equipe acertar.';
      }
      if (result.ok === false && result.error) {
        return `Ainda não consegui registrar: ${String(result.error).trim()} Me passa o que falta que eu finalizo agora.`;
      }
      continue;
    }

    if (result.ok === false) continue;

    if (entry.name === 'consultar_faq_estabelecimento' && result.answer) {
      return String(result.answer).trim();
    }

    if (entry.name === 'verificar_disponibilidade') {
      const availabilityReply = synthesizeAvailabilityFromToolResult(result);
      if (availabilityReply) return availabilityReply;
    }

    if (entry.name === 'consultar_areas_mesa_reserva' && result.ok) {
      if (result.todas_areas_cheias) {
        return (
          result.mensagem_hostess ||
          'Olha, tá tudo cheio nesse dia. Posso te colocar na lista de espera — assim que abrir mesa eu te chamo aqui mesmo, beleza?'
        );
      }
      if (result.area_recomendada?.label) {
        const alt =
          Array.isArray(result.alternativas_com_vaga) && result.alternativas_com_vaga.length
            ? ` Também tem vaga em: ${result.alternativas_com_vaga.join(', ')}.`
            : '';
        return `Pra ${result.quantidade_pessoas} pessoas, o que encaixa melhor é ${result.area_recomendada.label}.${alt} Topa essa?`;
      }
    }

    if (entry.name === 'criar_lista_espera' && result.ok) {
      const pos = result.lista_espera?.position;
      const posBit = pos ? ` Você ficou em ${pos}º na fila.` : '';
      return `${result.mensagem_hostess || 'Pronto, te coloquei na lista de espera. Assim que abrir mesa eu te aviso por aqui mesmo.'}${posBit}`;
    }
  }

  return null;
}

// ============================================================================
// TRAVA DE PRODUÇÃO: O modelo homologado pela Agilizaiapp para este projeto
// é o gpt-5.5 (flagship em maio/2026). Segue instruções e tom de voz MUITO
// melhor que gpt-4o, com queda drástica em alucinação de datas/áreas/nomes
// — exatamente os bugs que vimos em produção (data 2027, "Caro Jefferson",
// "Terraço", "Bar Central"). Confirmado pelo commit 28f7406.
//
// NÃO faça downgrade para gpt-5.4 ou gpt-4o sem aprovação explícita —
// regressão já foi medida em produção (Highline).
//
// Único downgrade aceito (e só em emergência, via env, SEM deploy):
//   OPENAI_AGENT_MODEL=gpt-5.4-mini  (variante econômica, qualidade inferior)
//   OPENAI_AGENT_MODEL=gpt-4o        (fallback emergencial se 5.5 cair)
//
// Em todos os casos, o caminho usa Chat Completions API + function calling —
// migrar para Responses API exigiria refactor do round-trip de tool calls.
// ============================================================================
const AGENT_MODEL = process.env.OPENAI_AGENT_MODEL || 'gpt-5.5';
const AGENT_FALLBACK_MODEL = process.env.OPENAI_AGENT_FALLBACK_MODEL || 'gpt-4o';
const OPENAI_MAX_RETRIES = Number(process.env.OPENAI_RETRY_MAX || 2);
const OPENAI_RETRY_BASE_MS = Number(process.env.OPENAI_RETRY_BASE_MS || 700);
const OPENAI_REQUEST_TIMEOUT_MS = Number(process.env.OPENAI_REQUEST_TIMEOUT_MS || 25000);
const OPENAI_AGENT_TEMPERATURE = Number(process.env.OPENAI_AGENT_TEMPERATURE || 0.3);

function modelSupportsCustomTemperature(modelName) {
  const normalized = String(modelName || '').trim().toLowerCase();
  // Em produção, a família gpt-5.x (inclui gpt-5.5) rejeita temperatura custom.
  // Mantemos o default do provedor para evitar 400 UNSUPPORTED_VALUE.
  return !/^gpt-5(\b|[-.])/.test(normalized);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeOpenAiError(error) {
  const status = Number(error?.status || error?.statusCode || error?.response?.status || 0);
  const code = String(error?.code || error?.error?.code || '').toUpperCase();
  const detail = String(error?.error?.message || error?.message || 'erro desconhecido na OpenAI');
  return { status, code, detail };
}

function isModelAccessError(error) {
  const { status, code, detail } = normalizeOpenAiError(error);
  const text = String(detail || '').toLowerCase();
  if (status === 404 || status === 403) return true;
  if (code === 'MODEL_NOT_FOUND' || code === 'INSUFFICIENT_PERMISSIONS') return true;
  return (
    text.includes('model') &&
    (text.includes('not found') ||
      text.includes('does not exist') ||
      text.includes('not available') ||
      text.includes('do not have access') ||
      text.includes('not permitted') ||
      text.includes('insufficient'))
  );
}

function isRetryableOpenAiError(error) {
  const { status, code, detail } = normalizeOpenAiError(error);
  if ([408, 409, 429].includes(status) || status >= 500) return true;
  if (
    ['ETIMEDOUT', 'ECONNRESET', 'ECONNABORTED', 'EAI_AGAIN', 'ENOTFOUND'].includes(code)
  ) {
    return true;
  }
  const text = detail.toLowerCase();
  return (
    text.includes('timeout') ||
    text.includes('timed out') ||
    text.includes('rate limit') ||
    text.includes('temporar') ||
    text.includes('overloaded') ||
    text.includes('try again')
  );
}

function computeBackoffMs(attempt) {
  const exp = OPENAI_RETRY_BASE_MS * Math.pow(2, Math.max(0, attempt - 1));
  const jitter = Math.floor(Math.random() * 220);
  return exp + jitter;
}

async function withTimeout(promise, timeoutMs) {
  let timer = null;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const err = new Error(`OpenAI timeout após ${timeoutMs}ms`);
      err.code = 'OPENAI_TIMEOUT';
      reject(err);
    }, timeoutMs);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function requestAssistantCompletion(messages, tools, toolChoice = 'auto') {
  async function requestWithModel(modelName) {
    const payload = {
      model: modelName,
      messages,
    };
    if (
      Number.isFinite(OPENAI_AGENT_TEMPERATURE) &&
      modelSupportsCustomTemperature(modelName)
    ) {
      payload.temperature = OPENAI_AGENT_TEMPERATURE;
    }
    if (tools?.length) {
      payload.tools = tools;
      payload.tool_choice = toolChoice;
    }

    const maxRetries = Number.isFinite(OPENAI_MAX_RETRIES) && OPENAI_MAX_RETRIES >= 0
      ? OPENAI_MAX_RETRIES
      : 2;

    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      try {
        const completion = await withTimeout(
          getOpenAI().chat.completions.create(payload),
          OPENAI_REQUEST_TIMEOUT_MS
        );
        return completion?.choices?.[0]?.message || null;
      } catch (error) {
        const retryable = isRetryableOpenAiError(error);
        const { status, code, detail } = normalizeOpenAiError(error);
        const isLastAttempt = attempt >= maxRetries;
        if (!retryable || isLastAttempt) {
          const enriched = new Error(
            `Falha na OpenAI: ${detail} (status=${status || 'n/a'} code=${code || 'n/a'} attempt=${attempt + 1}/${maxRetries + 1} model=${modelName})`
          );
          enriched.status = status;
          enriched.code = code || error?.code;
          enriched.modelName = modelName;
          enriched.originalError = error;
          throw enriched;
        }
        const waitMs = computeBackoffMs(attempt + 1);
        console.warn(
          `[agentService] OpenAI instável; retry ${attempt + 1}/${maxRetries} em ${waitMs}ms (status=${status || 'n/a'} code=${code || 'n/a'} model=${modelName})`
        );
        await sleep(waitMs);
      }
    }
    return null;
  }
  try {
    return await requestWithModel(AGENT_MODEL);
  } catch (error) {
    const shouldFallbackModel =
      AGENT_FALLBACK_MODEL &&
      String(AGENT_FALLBACK_MODEL) !== String(AGENT_MODEL) &&
      isModelAccessError(error);
    if (!shouldFallbackModel) throw error;
    console.warn(
      `[agentService] fallback de modelo ativado: ${AGENT_MODEL} -> ${AGENT_FALLBACK_MODEL}`
    );
    return requestWithModel(AGENT_FALLBACK_MODEL);
  }
}

function reservationFunnelIsComplete(workingState = {}) {
  return getReservationMissingFields(workingState).length === 0;
}

function lastToolCallByName(toolTrace = [], name) {
  for (let i = toolTrace.length - 1; i >= 0; i -= 1) {
    if (toolTrace[i]?.name === name) return toolTrace[i];
  }
  return null;
}

/**
 * Caso o agente termine a interação com todos os dados coletados e mesmo assim
 * tenha emitido só texto (sem chamar criar_pre_reserva), pedimos explicitamente
 * que execute a ferramenta. Isso fecha o caso "Bruna Alvez" em que o agente
 * tinha tudo e mesmo assim não registrava a reserva.
 */
async function forceCreatePreReservaIfReady({
  pool,
  workingState,
  context,
  runtimeContext,
  toolTrace,
  messages,
  tools,
}) {
  if (!pool) return { workingState, toolTrace, replyText: null };
  if (!reservationFunnelIsComplete(workingState)) {
    return { workingState, toolTrace, replyText: null };
  }
  if (lastToolCallByName(toolTrace, 'criar_pre_reserva')) {
    return { workingState, toolTrace, replyText: null };
  }

  const establishmentId = Number(
    workingState.establishment_id || context.lockedEstablishmentId
  );
  const reservationDate = String(
    workingState.reservation_date || workingState.pending_reservation_date_iso || ''
  ).slice(0, 10);
  const reservationTime = String(workingState.reservation_time || '').slice(0, 5);
  const partySize = Number(workingState.quantidade_convidados);
  const clientName = String(workingState.client_name || '').trim();
  const clientEmail = String(workingState.client_email || '').trim();
  const birthDate = String(workingState.data_nascimento || '').slice(0, 10);

  if (
    !Number.isFinite(establishmentId) ||
    establishmentId <= 0 ||
    !reservationDate ||
    !reservationTime ||
    !Number.isFinite(partySize) ||
    partySize <= 0 ||
    !clientName ||
    !clientEmail ||
    !birthDate
  ) {
    return { workingState, toolTrace, replyText: null };
  }

  const reminder = {
    role: 'system',
    content:
      'TODOS os dados obrigatórios da reserva já foram coletados nesta conversa. Chame criar_pre_reserva AGORA com os dados informados pelo cliente. Não responda só com texto — execute a função.',
  };
  const localMessages = [...messages, reminder];
  const forced = await requestAssistantCompletion(localMessages, tools, {
    type: 'function',
    function: { name: 'criar_pre_reserva' },
  }).catch((error) => {
    console.warn('[agentService] força tool criar_pre_reserva falhou:', error.message);
    return null;
  });

  const toolCall = forced?.tool_calls?.[0];
  if (!toolCall || toolCall?.function?.name !== 'criar_pre_reserva') {
    return { workingState, toolTrace, replyText: null };
  }

  let parsedArgs = {};
  try {
    parsedArgs = JSON.parse(toolCall?.function?.arguments || '{}');
  } catch (_error) {
    parsedArgs = {};
  }

  parsedArgs.estabelecimento_id = parsedArgs.estabelecimento_id || establishmentId;
  parsedArgs.data = parsedArgs.data || reservationDate;
  parsedArgs.horario = parsedArgs.horario || reservationTime;
  parsedArgs.quantidade_pessoas = parsedArgs.quantidade_pessoas || partySize;
  parsedArgs.cliente_dados = {
    nome: parsedArgs.cliente_dados?.nome || clientName,
    email: parsedArgs.cliente_dados?.email || clientEmail,
    data_nascimento: parsedArgs.cliente_dados?.data_nascimento || birthDate,
  };
  toolCall.function.arguments = JSON.stringify(parsedArgs);

  const toolResult = await executeAgentToolCall(pool, toolCall, runtimeContext).catch((error) => {
    console.warn('[agentService] execução forçada criar_pre_reserva falhou:', error.message);
    return null;
  });
  if (!toolResult) {
    return { workingState, toolTrace, replyText: null };
  }

  const nextTrace = [
    ...toolTrace,
    { name: 'criar_pre_reserva', result: toolResult, forced: true },
  ];
  const nextState = mergeWorkingState(
    workingState,
    extractWorkingStatePatchFromToolResult('criar_pre_reserva', toolResult)
  );
  const replyText =
    synthesizeReplyFromToolTrace(nextTrace) ||
    (toolResult.ok
      ? 'Pronto, fechei sua reserva! Qualquer coisa, é só chamar.'
      : null);

  return {
    workingState: nextState,
    toolTrace: nextTrace,
    replyText,
    toolResult,
  };
}

/**
 * Detecta padrões textuais de "confirmação de reserva" que o LLM às vezes
 * inventa SEM ter chamado a tool criar_pre_reserva — gerando para o cliente
 * a falsa impressão de que a reserva está registrada. Quando isso acontece,
 * a resposta é substituída por uma pergunta segura pelo próximo dado faltante.
 */
// Observação: \b não funciona ao redor de caracteres acentuados em regex JS
// base, então usamos limites brandos (início/fim de palavra via espaços ou
// pontuação) onde caracteres especiais aparecem.
const FAKE_CONFIRMATION_PATTERNS = [
  /confirmamos sua reserva/i,
  /reserva\s+(est[áa]\s+)?confirmada/i,
  /estaremos esperando por voc/i,
  /[ée] com (grande )?(satisfa[cç][aã]o|prazer)/i,
  /(?:^|[\s,.;!?])(caro|cara|caros|caras)\s+[A-ZÀ-Ÿ]/, // "Caro Jefferson", "Cara Maria"
  /atenciosamente/i,
  /cordialmente/i,
  /equipe do vamos comemorar/i,
  /equipe do highline/i,
  /sua mesa (est[aá]|fica|j[aá])/i,
  /reserva (concluida|conclu[ií]da|finalizada|feita com sucesso)/i,
];

const FORBIDDEN_AREA_NAMES = [
  /terra[cç]o/i,
  /(?:^|[\s,.;!?(])balc[aã]o(?=$|[\s,.;!?)])/i,
  /[áa]rea coberta/i,
  /[áa]rea descoberta/i,
  /[áa]rea vip(?! consum)/i, // "Área VIP" sozinha (mas permite "Área VIP consumível" se vier do FAQ de camarote)
  /mezanino/i,
  /pista interna/i,
  // "Bar Central" não existe no Highline — o label oficial é "Área Bar".
  // Cliente que ouve "Bar Central" recebe um nome divergente do painel da
  // equipe, gerando confusão. Bloqueio determinístico aqui força o agent a
  // sempre devolver a pergunta de coleta correta com vocabulário oficial.
  /\bbar\s+central\b/i,
];

function looksLikeFakeReservationConfirmation(text) {
  const t = String(text || '');
  if (!t) return false;
  return FAKE_CONFIRMATION_PATTERNS.some((re) => re.test(t));
}

function containsForbiddenAreaName(text) {
  const t = String(text || '');
  if (!t) return false;
  return FORBIDDEN_AREA_NAMES.some((re) => re.test(t));
}

function lastSuccessfulPreReserva(toolTrace = []) {
  for (let i = toolTrace.length - 1; i >= 0; i -= 1) {
    const entry = toolTrace[i];
    if (entry?.name === 'criar_pre_reserva' && entry?.result?.ok && entry?.result?.pre_reserva) {
      return entry;
    }
  }
  return null;
}

function buildSafeFollowupQuestion(workingState = {}) {
  try {
    const nextQ = buildNextFieldQuestion(workingState);
    if (nextQ) return nextQ;
  } catch (_e) {
    // ignore
  }
  return 'Pra eu deixar tudo certo no seu nome, me passa o nome completo, o e-mail e a data de nascimento (DD/MM/AAAA — pra confirmar +18).';
}

/**
 * Padrões de tom formal proibido — disparam guard SEMPRE (mesmo quando a
 * reserva foi criada com sucesso). O tom da casa é concierge de WhatsApp.
 */
const FORMAL_TONE_PATTERNS = [
  /(?:^|[\s,.;!?])(caro|cara|caros|caras)\s+[A-ZÀ-Ÿ]/, // "Caro Jefferson", "Cara Maria"
  /atenciosamente/i,
  /cordialmente/i,
  /equipe (do |de )?vamos comemorar/i,
  /equipe (do |de )?highline/i,
  /[ée] com (grande )?(satisfa[cç][aã]o|prazer|alegria)/i,
  /agradecemos por escolher/i,
  /experi[eê]ncia memor[aá]vel/i,
  /estamos ansiosos/i,
];

function looksLikeFormalToneViolation(text) {
  const t = String(text || '');
  if (!t) return false;
  return FORMAL_TONE_PATTERNS.some((re) => re.test(t));
}

/**
 * Aplica guards determinísticos à resposta do LLM antes de devolver ao cliente.
 *  - Quando há criar_pre_reserva ok, SEMPRE usa a resposta sintética dos dados
 *    reais da reserva (ignora texto livre do LLM para evitar alucinação de
 *    data/área/quantidade na confirmação).
 *  - Bloqueia confirmação de reserva quando criar_pre_reserva NÃO rodou ok.
 *  - Bloqueia tom formal ("Caro X", "Atenciosamente") em qualquer caso.
 *  - Bloqueia nomes de área proibidos (Terraço, Balcão, Área Coberta, etc.).
 *  - Bloqueia sugestão de múltiplas reservas pro mesmo grupo.
 */
function sanitizeAssistantReply(replyText, { toolTrace = [], workingState = {} } = {}) {
  const text = String(replyText || '').trim();
  if (!text) return { text, blocked: false };

  const successPre = lastSuccessfulPreReserva(toolTrace);

  // QUANDO HÁ RESERVA OK: SEMPRE usa a resposta sintetizada com os dados REAIS
  // da reserva. O texto do LLM pode (e historicamente DEVE) ser descartado
  // porque ele tende a alucinar data, ano, área, capacidade e nome próprio —
  // mesmo quando a tool foi chamada corretamente. Só permitimos fallback ao
  // texto do LLM se a síntese falhar.
  if (successPre) {
    const synthetic = synthesizeReplyFromToolTrace(toolTrace);
    if (synthetic) {
      const llmAddedRisk =
        looksLikeFormalToneViolation(text) || containsForbiddenAreaName(text);
      if (llmAddedRisk) {
        console.warn(
          '[agentService] guard: descartando texto do LLM (risco detectado) e usando síntese determinística da reserva.'
        );
      }
      return {
        text: synthetic,
        blocked: text !== synthetic,
        reason: llmAddedRisk
          ? 'deterministic_confirmation_override_risky'
          : 'deterministic_confirmation_override',
      };
    }
  }

  if (!successPre && looksLikeFakeReservationConfirmation(text)) {
    const safe = buildSafeFollowupQuestion(workingState);
    console.warn(
      '[agentService] guard: bloqueado texto de confirmação falsa de reserva (sem criar_pre_reserva ok).'
    );
    return {
      text: safe,
      blocked: true,
      reason: 'fake_reservation_confirmation',
    };
  }

  // Tom formal SEMPRE bloqueado, independente de ter reserva ou não.
  if (looksLikeFormalToneViolation(text)) {
    console.warn(
      '[agentService] guard: detectado tom formal proibido — substituindo por resposta neutra.'
    );
    const safe = successPre
      ? synthesizeReplyFromToolTrace(toolTrace) ||
        'Pronto, fechei sua reserva. Qualquer coisa, é só chamar.'
      : buildSafeFollowupQuestion(workingState);
    return { text: safe, blocked: true, reason: 'formal_tone' };
  }

  if (containsForbiddenAreaName(text)) {
    console.warn(
      '[agentService] guard: detectado nome de área proibido — substituindo por resposta segura.'
    );
    const safe = successPre
      ? synthesizeReplyFromToolTrace(toolTrace) ||
        'Pronto, fechei sua reserva. Qualquer coisa, é só chamar.'
      : 'Pra te direcionar pra área certa, deixa eu verificar a disponibilidade. Pode me confirmar a data, o horário e quantas pessoas vão?';
    return { text: safe, blocked: true, reason: 'forbidden_area_name' };
  }

  // Bloqueia plano de "fazer N reservas SEPARADAS" pro mesmo grupo.
  // PERMITE "combinar/juntar N mesas em uma reserva" (feature legítima do
  // modal /admin/restaurant-reservations "Reservar múltiplas mesas").
  if (
    /\b(tr[eê]s|3|duas|2|quatro|4|cinco|5) reservas? (na|no|para|pro)\b/i.test(text) &&
    !/\b(uma|1) reserva\b/i.test(text)
  ) {
    console.warn(
      '[agentService] guard: bloqueado plano de múltiplas reservas pro mesmo grupo.'
    );
    const safe =
      'Para grupos maiores, eu deixo TUDO em UMA reserva só (a casa usa a feature de "múltiplas mesas" do painel pra juntar mesas próximas). Quer seguir assim? Me passa o nome completo, o e-mail e a data de nascimento que eu já registro.';
    return { text: safe, blocked: true, reason: 'multi_reservation_attempt' };
  }

  return { text, blocked: false };
}

async function finalizeAssistantReply(
  messages,
  tools,
  assistantMessage,
  toolTrace,
  { funnelFallback = null, workingState = {} } = {}
) {
  let replyText = String(assistantMessage?.content || '').trim();
  if (replyText) {
    const sanitized = sanitizeAssistantReply(replyText, { toolTrace, workingState });
    return sanitized.text;
  }

  if (assistantMessage?.tool_calls?.length) {
    messages.push(assistantMessage);
    const forced = await requestAssistantCompletion(messages, tools, 'none');
    replyText = String(forced?.content || '').trim();
    if (replyText) {
      const sanitized = sanitizeAssistantReply(replyText, { toolTrace, workingState });
      return sanitized.text;
    }
  }

  const synthesized = synthesizeReplyFromToolTrace(toolTrace);
  if (synthesized) return synthesized;

  for (let index = toolTrace.length - 1; index >= 0; index -= 1) {
    if (toolTrace[index]?.name === 'verificar_disponibilidade') {
      const availabilityReply = synthesizeAvailabilityFromToolResult(toolTrace[index]?.result);
      if (availabilityReply) return availabilityReply;
      break;
    }
  }

  if (funnelFallback) return funnelFallback;

  throw new Error('Resposta vazia do agente.');
}

async function ensureAvailabilityChecked({
  pool,
  workingState,
  context,
  runtimeContext,
  toolTrace,
  assistantMessage,
  userText = '',
  messageHistory = [],
}) {
  const draftReply = String(assistantMessage?.content || '').trim();
  if (
    !shouldAutoRunAvailabilityCheck(
      workingState,
      context,
      toolTrace,
      draftReply,
      userText,
      messageHistory
    )
  ) {
    return { workingState, toolTrace, forcedReply: null };
  }

  const establishmentId = Number(
    workingState.establishment_id || context.lockedEstablishmentId
  );
  const reservationDate = String(
    workingState.reservation_date || workingState.pending_reservation_date_iso || ''
  ).slice(0, 10);
  const partySize = Number(workingState.quantidade_convidados);

  const toolResult = await executeAgentToolCall(
    pool,
    {
      id: `auto-verify-${Date.now()}`,
      function: {
        name: 'verificar_disponibilidade',
        arguments: JSON.stringify({
          estabelecimento_id: establishmentId,
          data: reservationDate,
          quantidade_pessoas: partySize,
          ...(workingState.reservation_time
            ? { horario: workingState.reservation_time }
            : {}),
        }),
      },
    },
    runtimeContext
  );

  const nextTrace = [
    ...toolTrace,
    { name: 'verificar_disponibilidade', result: toolResult, auto: true },
  ];
  const nextState = mergeWorkingState(
    workingState,
    extractWorkingStatePatchFromToolResult('verificar_disponibilidade', toolResult),
    buildAvailabilityCheckedPatch(
      mergeWorkingState(
        workingState,
        extractWorkingStatePatchFromToolResult('verificar_disponibilidade', toolResult)
      ),
      context,
      toolResult
    )
  );

  let forcedReply =
    synthesizeAvailabilityFromToolResult(toolResult) ||
    synthesizeReplyFromToolTrace(nextTrace);

  if (forcedReply && isReservationFunnelInProgress(nextState)) {
    const missing = getReservationMissingFields(nextState);
    if (missing.length > 0 && missing[0] !== 'reservation_date_confirm') {
      const nextQ = buildNextFieldQuestion(nextState);
      if (nextQ && !forcedReply.includes(nextQ.slice(0, 24))) {
        forcedReply = `${forcedReply}\n\n${nextQ}`;
      }
    }
  }

  return { workingState: nextState, toolTrace: nextTrace, forcedReply };
}

async function tryFaqFirstReply({
  pool,
  messageHistory,
  context = {},
  memory = {},
}) {
  const lastUser = [...(messageHistory || [])].reverse().find((m) => m.role === 'user');
  const userText = String(lastUser?.content || '').trim();
  const establishmentId = Number(context.lockedEstablishmentId);
  if (!userText || !Number.isFinite(establishmentId) || establishmentId <= 0 || !pool) {
    return null;
  }
  if (looksLikeFreshReservationStart(userText) || looksLikeReservationPushOnly(userText)) {
    return null;
  }
  if (!isInformationalFaqTurn(userText)) {
    return null;
  }

  const topicHints = resolveFaqTopicsForTurn(userText, messageHistory);

  // Carregamos a base inteira (não só os tópicos detectados) para que a
  // resposta esteja fundamentada em TODAS as regras cadastradas — algumas
  // perguntas dependem de combinar tópicos (ex.: aniversário + bolo + horário).
  let faqEntries = [];
  try {
    faqEntries = await loadAllActiveFaqsForEstablishment(pool, establishmentId);
  } catch (_error) {
    faqEntries = [];
  }
  if (!faqEntries.length && topicHints.length) {
    faqEntries = await prefetchEstablishmentFaqs(pool, establishmentId, topicHints);
  }
  if (!faqEntries.length) {
    console.warn(
      `[agentService] FAQ-first sem registros establishment_id=${establishmentId} topics=${topicHints.join(',')}`
    );
    return null;
  }

  const replyText = await generateFaqGroundedReply({
    userQuestion: userText,
    faqEntries,
    establishmentName: context.lockedEstablishmentName || '',
    messageHistory,
  });

  return {
    replyText,
    workingState: mergeWorkingState(memory.workingState || {}, {
      establishment_id: establishmentId,
    }),
    toolTrace: (topicHints.length ? topicHints : faqEntries.map((e) => e.topic)).map((topic) => ({
      name: 'consultar_faq_estabelecimento',
      result: {
        ok: true,
        topic,
        answer: faqEntries.find((e) => e.topic === topic)?.answer || faqEntries[0]?.answer,
      },
    })),
    preReservationResult: null,
    guestListLink: null,
    faqFirst: true,
  };
}

async function runAgentTurn({
  pool,
  messageHistory,
  context = {},
  memory = {},
  runtimeContext = {},
}) {
  if (!Array.isArray(messageHistory) || messageHistory.length === 0) {
    throw new Error('messageHistory deve ser um array não vazio.');
  }

  const lastUser = [...messageHistory].reverse().find((m) => m.role === 'user');
  const userText = String(lastUser?.content || '').trim();
  const referenceDateIso = getReferenceDateIso();

  // Cliente reclamou da resposta anterior (data errada, "vc errou", etc.).
  // Responde com pedido de desculpas + pergunta direta da data correta, e
  // reseta os flags de data confirmada no workingState pra forçar nova
  // interpretação no próximo turno.
  const correction = detectClientCorrectingPreviousReply(userText);
  if (correction && memory.workingState) {
    const ws = memory.workingState || {};
    const todayLabel = (() => {
      const [y, m, d] = String(referenceDateIso).split('-');
      return `${d}/${m}/${y}`;
    })();
    const resetState = {
      ...ws,
      reservation_date: null,
      reservation_date_confirmed: false,
      pending_reservation_date_iso: null,
      pending_reservation_date_label: null,
      availability_checked_for: null,
      availability_time_checked_for: null,
    };
    const msg =
      correction.kind === 'date_error'
        ? `Foi mal, escorreguei na data! Hoje é ${todayLabel}. Me confirma de novo, por favor — pra que dia e horário você quer a reserva?`
        : 'Foi mal, escorreguei. Me confirma de novo qual a data e horário corretos da sua reserva, por favor?';
    console.warn(
      `[agentService] cliente apontou erro (kind=${correction.kind}); reset de estado de data.`
    );
    return {
      replyText: msg,
      workingState: resetState,
      toolTrace: [],
      preReservationResult: null,
      guestListLink: null,
    };
  }

  // Primeira mensagem do cliente que é só cumprimento + intenção de reserva
  // (sem dados reais como data, horário, pessoas) — responda com tom humano,
  // ECOANDO a saudação do cliente ("boa noite"/"boa tarde"/"bom dia") e
  // fazendo UMA pergunta só. Esse caminho cobre tanto o "Click-to-WhatsApp"
  // padrão do tráfego pago quanto frases tipo "Boa noite, me ajude com uma
  // nova reserva no Highline".
  if (
    isFirstUserMessageInConversation(messageHistory) &&
    looksLikeAdEntryGreeting(userText) &&
    !memory.workingState?.reservation_date &&
    !memory.workingState?.pending_reservation_date_iso
  ) {
    const firstName =
      extractFirstName(runtimeContext?.contactName) ||
      extractFirstName(memory.workingState?.client_name);
    const greeting = detectOpeningGreeting(userText);
    let saudacao;
    if (greeting && firstName) {
      saudacao = `${greeting}, ${firstName}! Tudo bem?`;
    } else if (greeting) {
      saudacao = `${greeting}! Tudo bem?`;
    } else if (firstName) {
      saudacao = `Oi, ${firstName}! Tudo bem?`;
    } else {
      saudacao = 'Oi! Tudo bem?';
    }
    return {
      replyText: `${saudacao} Pra quando seria sua reserva?`,
      workingState: memory.workingState || {},
      toolTrace: [],
      preReservationResult: null,
      guestListLink: null,
    };
  }
  const dateHint = buildReservationDateHint({
    userText,
    referenceDateIso,
    workingState: memory.workingState || {},
    messageHistory,
  });
  let workingState = mergeWorkingState(
    memory.workingState || {},
    dateHint.patch || {},
    parseReservationFieldsFromUserText(userText, memory.workingState || {}, messageHistory)
  );
  workingState = inferAvailabilityCheckedFromHistory(workingState, messageHistory, context);
  const funnelActive = isReservationFunnelInProgress(workingState, messageHistory);

  const funnelAdvance = tryAdvanceFunnelFromUserMessage(workingState, userText, messageHistory);
  if (funnelAdvance?.replyText) {
    return {
      replyText: funnelAdvance.replyText,
      workingState: funnelAdvance.workingState,
      toolTrace: [],
      preReservationResult: null,
      guestListLink: null,
    };
  }

  if (process.env.OPENAI_API_KEY) {
    const skipFaq = shouldSkipFaqFirst(workingState, messageHistory, userText);
    if (!skipFaq) {
      const faqFirst = await tryFaqFirstReply({ pool, messageHistory, context, memory }).catch(
        (error) => {
          console.warn('[agentService] FAQ-first indisponível:', error.message);
          return null;
        }
      );
      if (faqFirst) return faqFirst;
    }
  }
  const topicHints = resolveFaqTopicsForTurn(userText, messageHistory);
  let faqKnowledgeBlock = String(context.faqKnowledgeBlock || '').trim();
  const establishmentId = Number(context.lockedEstablishmentId);

  // Treinamento da IA (Regras da Casa): SEMPRE injetar todas as regras
  // cadastradas no painel para o estabelecimento bloqueado. A IA deve ler a
  // base inteira em cada turno — antes essa lista vinha só sob demanda quando
  // o sistema detectava palavras-chave na mensagem, o que fazia a IA ignorar
  // os fatos oficiais em conversas que não casavam com o dicionário.
  if (!faqKnowledgeBlock && pool && establishmentId > 0) {
    try {
      const allActive = await loadAllActiveFaqsForEstablishment(pool, establishmentId);
      if (allActive.length > 0) {
        faqKnowledgeBlock = buildFaqKnowledgeBlock(
          allActive,
          context.lockedEstablishmentName || ''
        );
      } else if (topicHints.length) {
        const prefetched = await prefetchEstablishmentFaqs(pool, establishmentId, topicHints);
        faqKnowledgeBlock = buildFaqKnowledgeBlock(
          prefetched,
          context.lockedEstablishmentName || ''
        );
      }
      if (!faqKnowledgeBlock) {
        // Risco operacional alto: sem base, a IA não tem "material de estudo"
        // oficial pra falar com o cliente. O AgentPromptBuilder vai injetar
        // um aviso forte no system prompt impedindo a IA de inventar, mas
        // logamos aqui pro time perceber e popular o painel.
        const houseLabel = context.lockedEstablishmentName
          ? ` "${context.lockedEstablishmentName}"`
          : '';
        console.warn(
          `[agentService] AVISO CRÍTICO — sem base de conhecimento ativa para o estabelecimento${houseLabel} (id=${establishmentId}). Cadastre as regras em Treinamento da IA → Regras da Casa no painel admin para que a IA tenha o que estudar antes de responder.`
        );
      }
    } catch (faqError) {
      console.warn('[agentService] falha ao pré-carregar base oficial:', faqError.message);
      if (topicHints.length) {
        const prefetched = await prefetchEstablishmentFaqs(pool, establishmentId, topicHints).catch(
          () => []
        );
        faqKnowledgeBlock = buildFaqKnowledgeBlock(
          prefetched,
          context.lockedEstablishmentName || ''
        );
      }
    }
  }

  const reservationFunnelBlock = buildReservationFunnelPromptBlock(workingState, messageHistory);
  const systemPrompt = promptBuilder.build({
    ...context,
    faqKnowledgeBlock,
    reservationDateBlock: dateHint.promptBlock,
    reservationFunnelBlock,
    referenceDate: referenceDateIso,
  });
  const messages = buildOpenAiMessages(messageHistory, systemPrompt);
  const tools = getAgentToolDefinitions();

  const toolTrace = [];
  let preReservationResult = null;
  let guestListLink = null;

  // Quando todos os dados obrigatórios já estão no estado e ainda não houve
  // criar_pre_reserva, forçamos diretamente a chamada da função — evita o
  // modelo gerar texto solto antes ("Sua reserva foi confirmada!") sem chamar
  // a tool. Caso contrário, deixa o modelo decidir (auto).
  const initialToolChoice = reservationFunnelIsComplete(workingState)
    ? { type: 'function', function: { name: 'criar_pre_reserva' } }
    : 'auto';

  let assistantMessage = await requestAssistantCompletion(messages, tools, initialToolChoice);
  let guard = 0;
  const baseMaxRounds = Number(process.env.AGENT_MAX_TOOL_ROUNDS || 3);
  const maxToolRounds = funnelActive ? Math.max(baseMaxRounds, 5) : baseMaxRounds;

  while (assistantMessage?.tool_calls?.length && pool && guard < maxToolRounds) {
    messages.push(assistantMessage);
    for (const toolCall of assistantMessage.tool_calls) {
      const toolResult = await executeAgentToolCall(pool, toolCall, runtimeContext);
      toolTrace.push({
        name: toolCall?.function?.name || null,
        result: toolResult,
      });
      workingState = mergeWorkingState(
        workingState,
        extractWorkingStatePatchFromToolResult(toolCall?.function?.name, toolResult)
      );
      if (toolCall?.function?.name === 'verificar_disponibilidade') {
        workingState = mergeWorkingState(
          workingState,
          buildAvailabilityCheckedPatch(workingState, context, toolResult)
        );
      }
      if (toolCall?.function?.name === 'criar_pre_reserva' && toolResult?.ok) {
        preReservationResult = toolResult;
        guestListLink = toolResult.guest_list_link || null;
      }
      messages.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        content: JSON.stringify(toolResult),
      });
    }

    assistantMessage = await requestAssistantCompletion(messages, tools, 'auto');
    guard += 1;
  }

  const ensured = await ensureAvailabilityChecked({
    pool,
    workingState,
    context,
    runtimeContext,
    toolTrace,
    assistantMessage,
    userText,
    messageHistory,
  }).catch((error) => {
    console.warn('[agentService] auto verificar_disponibilidade falhou:', error.message);
    return { workingState, toolTrace, forcedReply: null };
  });
  workingState = ensured.workingState;
  let toolTraceFinal = ensured.toolTrace;

  const forcedCreate = await forceCreatePreReservaIfReady({
    pool,
    workingState,
    context,
    runtimeContext,
    toolTrace: toolTraceFinal,
    messages,
    tools,
  });
  workingState = forcedCreate.workingState;
  toolTraceFinal = forcedCreate.toolTrace;
  if (forcedCreate.toolResult?.ok) {
    preReservationResult = forcedCreate.toolResult;
    guestListLink = forcedCreate.toolResult.guest_list_link || null;
  }

  const funnelFallback = funnelActive ? buildNextFieldQuestion(workingState) : null;
  const candidateReply =
    forcedCreate.replyText ||
    ensured.forcedReply ||
    (await finalizeAssistantReply(messages, tools, assistantMessage, toolTraceFinal, {
      funnelFallback,
      workingState,
    }));

  const sanitized = sanitizeAssistantReply(candidateReply, {
    toolTrace: toolTraceFinal,
    workingState,
  });
  const replyText = sanitized.text;

  return {
    replyText,
    workingState,
    toolTrace: toolTraceFinal,
    preReservationResult,
    guestListLink,
  };
}

module.exports = {
  runAgentTurn,
  getReferenceDateIso,
  synthesizeReplyFromToolTrace,
  synthesizeAvailabilityFromToolResult,
  tryFaqFirstReply,
  sanitizeAssistantReply,
  looksLikeFakeReservationConfirmation,
  containsForbiddenAreaName,
};
