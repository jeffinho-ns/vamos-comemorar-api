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
        return `Fechado! Sua reserva ficou pra ${pre.reservation_date} às ${pre.reservation_time}${areaBit}${comboBit}. Qualquer coisa, é só chamar.`;
      }
      if (result.duplicate === true) {
        return 'Vi aqui que você já tem uma reserva confirmada para esse mesmo dia e horário. Sua reserva está registrada — não precisa mandar outra. Se quiser ajustar algo (data, horário ou pessoas), me avise que eu já encaminho.';
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
          'As áreas estão lotadas nessa data. Posso te colocar na lista de espera — a Hostess te chama assim que abrir mesa.'
        );
      }
      if (result.area_recomendada?.label) {
        const alt =
          Array.isArray(result.alternativas_com_vaga) && result.alternativas_com_vaga.length
            ? ` Também tem vaga em: ${result.alternativas_com_vaga.join(', ')}.`
            : '';
        return `Pra ${result.quantidade_pessoas} pessoas, o melhor encaixe agora é ${result.area_recomendada.label}.${alt} Quer essa área?`;
      }
    }

    if (entry.name === 'criar_lista_espera' && result.ok) {
      const pos = result.lista_espera?.position;
      const posBit = pos ? ` Você é o ${pos}º da fila.` : '';
      return `${result.mensagem_hostess || 'Pronto, você já está na lista de espera.'}${posBit}`;
    }
  }

  return null;
}

async function requestAssistantCompletion(messages, tools, toolChoice = 'auto') {
  const payload = {
    model: 'gpt-4o-mini',
    messages,
    temperature: 0.45,
  };
  if (tools?.length) {
    payload.tools = tools;
    payload.tool_choice = toolChoice;
  }

  try {
    const completion = await getOpenAI().chat.completions.create(payload);
    return completion?.choices?.[0]?.message || null;
  } catch (error) {
    const detail = error?.error?.message || error?.message || 'erro desconhecido na OpenAI';
    throw new Error(`Falha na OpenAI: ${detail}`);
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

  // QUANDO HÁ RESERVA OK: usa a resposta sintetizada com os dados REAIS
  // da reserva (não confia no texto do LLM que pode alucinar data/área/qtd).
  // Só preserva o texto do LLM se ele NÃO tiver tom formal nem área proibida.
  if (successPre) {
    const hasFormalTone = looksLikeFormalToneViolation(text);
    const hasForbiddenArea = containsForbiddenAreaName(text);
    if (hasFormalTone || hasForbiddenArea) {
      const synthetic = synthesizeReplyFromToolTrace(toolTrace);
      const safe =
        synthetic ||
        'Pronto, fechei sua reserva. Qualquer coisa, é só chamar.';
      console.warn(
        `[agentService] guard: substituindo confirmação real (motivo=${
          hasFormalTone ? 'formal_tone' : 'forbidden_area'
        }) pela resposta sintetizada com dados reais.`
      );
      return {
        text: safe,
        blocked: true,
        reason: hasFormalTone
          ? 'formal_tone_after_reservation'
          : 'forbidden_area_after_reservation',
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
        console.warn(
          `[agentService] sem base de conhecimento ativa para establishment_id=${establishmentId} (cadastre em Treinamento da IA → Regras da Casa).`
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

  let assistantMessage = await requestAssistantCompletion(messages, tools, 'auto');
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
