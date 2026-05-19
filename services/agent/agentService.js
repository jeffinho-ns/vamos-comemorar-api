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
  buildFaqKnowledgeBlock,
  generateFaqGroundedReply,
  resolveFaqTopicsForTurn,
} = require('./faqPrefetchService');
const { looksLikeFreshReservationStart } = require('../conversationEngine/helpers');
const { buildReservationDateHint } = require('./reservationDateHint');

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

function synthesizeReplyFromToolTrace(toolTrace = []) {
  for (let index = toolTrace.length - 1; index >= 0; index -= 1) {
    const entry = toolTrace[index];
    const result = entry?.result;
    if (!result || result.ok === false) continue;

    if (entry.name === 'consultar_faq_estabelecimento' && result.answer) {
      return String(result.answer).trim();
    }

    if (entry.name === 'verificar_disponibilidade') {
      if (result.is_open === false) {
        return result.note
          ? String(result.note).trim()
          : 'Nesse dia a casa não está aberta para reservas. Posso ver outra data para você?';
      }
      const windows = Array.isArray(result.windows) ? result.windows : [];
      if (windows.length > 0) {
        const labels = windows
          .map((window) => window?.label || window?.start_time || window?.start)
          .filter(Boolean)
          .slice(0, 6);
        if (labels.length > 0) {
          return `Para essa data, os horários disponíveis são: ${labels.join(', ')}. Qual prefere?`;
        }
      }
    }

    if (entry.name === 'criar_pre_reserva' && result.pre_reserva) {
      const pre = result.pre_reserva;
      return `Pronto! Registrei sua pré-reserva para ${pre.reservation_date} às ${pre.reservation_time}.`;
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

async function finalizeAssistantReply(messages, tools, assistantMessage, toolTrace) {
  let replyText = String(assistantMessage?.content || '').trim();
  if (replyText) return replyText;

  if (assistantMessage?.tool_calls?.length) {
    messages.push(assistantMessage);
    const forced = await requestAssistantCompletion(messages, tools, 'none');
    replyText = String(forced?.content || '').trim();
    if (replyText) return replyText;
  }

  const synthesized = synthesizeReplyFromToolTrace(toolTrace);
  if (synthesized) return synthesized;

  throw new Error('Resposta vazia do agente.');
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
  if (!topicHints.length) return null;

  const faqEntries = await prefetchEstablishmentFaqs(pool, establishmentId, topicHints);
  if (!faqEntries.length) {
    console.warn(
      `[agentService] FAQ-first sem registros establishment_id=${establishmentId} topics=${topicHints.join(',')}`
    );
    return null;
  }
  if (!faqEntries.length) return null;

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
    toolTrace: topicHints.map((topic) => ({
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

  if (process.env.OPENAI_API_KEY) {
    const faqFirst = await tryFaqFirstReply({ pool, messageHistory, context, memory }).catch(
      (error) => {
        console.warn('[agentService] FAQ-first indisponível:', error.message);
        return null;
      }
    );
    if (faqFirst) return faqFirst;
  }

  const lastUser = [...messageHistory].reverse().find((m) => m.role === 'user');
  const userText = String(lastUser?.content || '').trim();
  const referenceDateIso = getReferenceDateIso();
  const dateHint = buildReservationDateHint({
    userText,
    referenceDateIso,
    workingState: memory.workingState || {},
  });
  const topicHints = resolveFaqTopicsForTurn(userText, messageHistory);
  let faqKnowledgeBlock = String(context.faqKnowledgeBlock || '').trim();
  const establishmentId = Number(context.lockedEstablishmentId);

  if (!faqKnowledgeBlock && pool && establishmentId > 0 && topicHints.length) {
    const prefetched = await prefetchEstablishmentFaqs(pool, establishmentId, topicHints);
    faqKnowledgeBlock = buildFaqKnowledgeBlock(prefetched, context.lockedEstablishmentName || '');
  }

  const systemPrompt = promptBuilder.build({
    ...context,
    faqKnowledgeBlock,
    reservationDateBlock: dateHint.promptBlock,
    referenceDate: referenceDateIso,
  });
  const messages = buildOpenAiMessages(messageHistory, systemPrompt);
  const tools = getAgentToolDefinitions();

  let workingState = mergeWorkingState(memory.workingState || {}, dateHint.patch || {});
  const toolTrace = [];
  let preReservationResult = null;
  let guestListLink = null;

  let assistantMessage = await requestAssistantCompletion(messages, tools, 'auto');
  let guard = 0;
  const maxToolRounds = Number(process.env.AGENT_MAX_TOOL_ROUNDS || 5);

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

  const replyText = await finalizeAssistantReply(messages, tools, assistantMessage, toolTrace);

  return {
    replyText,
    workingState,
    toolTrace,
    preReservationResult,
    guestListLink,
  };
}

module.exports = {
  runAgentTurn,
  getReferenceDateIso,
  synthesizeReplyFromToolTrace,
  tryFaqFirstReply,
};
