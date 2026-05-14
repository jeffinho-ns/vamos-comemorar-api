const OpenAI = require('openai');
const { AgentPromptBuilder } = require('./AgentPromptBuilder');
const { getAgentToolDefinitions, executeAgentToolCall } = require('./agentTools');
const {
  mergeWorkingState,
  extractWorkingStatePatchFromToolResult,
} = require('./agentMemoryService');

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
    if (!item?.content) continue;
    messages.push({
      role: item.role === 'assistant' ? 'assistant' : 'user',
      content: String(item.content),
    });
  }
  return messages;
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

  const systemPrompt = promptBuilder.build({
    ...context,
    referenceDate: getReferenceDateIso(),
  });
  const messages = buildOpenAiMessages(messageHistory, systemPrompt);
  const tools = getAgentToolDefinitions();

  let workingState = mergeWorkingState(memory.workingState || {}, {});
  const toolTrace = [];
  let preReservationResult = null;
  let guestListLink = null;

  let completion = await getOpenAI().chat.completions.create({
    model: 'gpt-4o-mini',
    messages,
    tools,
    tool_choice: 'auto',
    temperature: 0.45,
  });

  let assistantMessage = completion?.choices?.[0]?.message;
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

    completion = await getOpenAI().chat.completions.create({
      model: 'gpt-4o-mini',
      messages,
      tools,
      tool_choice: 'auto',
      temperature: 0.45,
    });
    assistantMessage = completion?.choices?.[0]?.message;
    guard += 1;
  }

  const replyText = String(assistantMessage?.content || '').trim();
  if (!replyText) {
    throw new Error('Resposta vazia do agente.');
  }

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
};
