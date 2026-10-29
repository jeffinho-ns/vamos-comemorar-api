'use strict';

/**
 * GPT-6.1 Sol (e Astra/Terra 6.1) aceitam Chat Completions, mas function calling
 * só existe na Responses API. Este adaptador devolve o mesmo formato de
 * mensagem que o loop de tools do agente já consome.
 */

const { resolveOutputTokenLimit } = require('./openAiConfig');

const RESPONSES_TOOL_MODELS = new Set(['gpt-6.1-sol', 'gpt-6.1-terra', 'gpt-6-astra']);
const REASONING_EFFORTS = new Set(['low', 'medium', 'high', 'xhigh']);

function modelRequiresResponsesForTools(modelName) {
  const normalized = String(modelName || '').trim().toLowerCase();
  if (RESPONSES_TOOL_MODELS.has(normalized)) return true;
  return (
    normalized.startsWith('gpt-6.1-sol') ||
    normalized.startsWith('gpt-6.1-terra') ||
    normalized.startsWith('gpt-6-astra')
  );
}

function normalizeReasoningEffort(value) {
  const effort = String(value || 'low').trim().toLowerCase();
  if (!REASONING_EFFORTS.has(effort)) return 'low';
  return effort;
}

function messageText(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => (typeof part === 'string' ? part : part?.text || part?.content || ''))
      .filter(Boolean)
      .join('\n');
  }
  return content == null ? '' : String(content);
}

function toResponsesTools(tools) {
  return (tools || [])
    .filter((tool) => tool?.type === 'function' && tool.function?.name)
    .map((tool) => ({
      type: 'function',
      name: tool.function.name,
      description: tool.function.description || '',
      parameters: tool.function.parameters || { type: 'object', properties: {} },
    }));
}

function toResponsesToolChoice(toolChoice) {
  if (!toolChoice || toolChoice === 'auto') return 'auto';
  if (toolChoice === 'none') return 'none';
  const name = toolChoice?.function?.name || toolChoice?.name;
  if (name) return { type: 'function', name: String(name) };
  return 'auto';
}

function chatMessagesToResponsesInput(messages) {
  const instructions = [];
  const input = [];

  for (const message of messages || []) {
    const role = message?.role;
    if (role === 'system' || role === 'developer') {
      const text = messageText(message.content).trim();
      if (text) instructions.push(text);
      continue;
    }
    if (role === 'user') {
      input.push({ role: 'user', content: messageText(message.content) });
      continue;
    }
    if (role === 'assistant') {
      if (Array.isArray(message.responses_output) && message.responses_output.length) {
        input.push(...message.responses_output);
        continue;
      }
      const text = messageText(message.content).trim();
      if (text) input.push({ role: 'assistant', content: text });
      for (const call of message.tool_calls || []) {
        input.push({
          type: 'function_call',
          call_id: call.id,
          name: call.function?.name || '',
          arguments: call.function?.arguments || '{}',
        });
      }
      continue;
    }
    if (role === 'tool') {
      input.push({
        type: 'function_call_output',
        call_id: message.tool_call_id,
        output: messageText(message.content),
      });
    }
  }

  return { instructions: instructions.join('\n\n'), input };
}

function responsesOutputToAssistantMessage(response) {
  const output = Array.isArray(response?.output) ? response.output : [];
  const toolCalls = output
    .filter((item) => item?.type === 'function_call' && item.name)
    .map((item) => ({
      id: item.call_id || item.id,
      type: 'function',
      function: {
        name: item.name,
        arguments: typeof item.arguments === 'string' ? item.arguments : JSON.stringify(item.arguments || {}),
      },
    }));
  const textFromItems = output
    .filter((item) => item?.type === 'message')
    .map((item) => messageText(item.content))
    .filter(Boolean)
    .join('\n')
    .trim();
  const content = String(response?.output_text || textFromItems || '').trim() || null;

  return {
    role: 'assistant',
    content,
    tool_calls: toolCalls.length ? toolCalls : undefined,
    responses_output: output,
  };
}

function usageFromResponses(usage) {
  const inputTokens = Number(usage?.input_tokens);
  const outputTokens = Number(usage?.output_tokens);
  const prompt = Number.isFinite(inputTokens) ? inputTokens : 0;
  const completion = Number.isFinite(outputTokens) ? outputTokens : 0;
  const cached = Number(usage?.input_tokens_details?.cached_tokens);
  return {
    prompt_tokens: prompt,
    completion_tokens: completion,
    total_tokens: Number(usage?.total_tokens) || prompt + completion,
    prompt_tokens_details: Number.isFinite(cached) ? { cached_tokens: cached } : undefined,
  };
}

async function requestResponsesAssistantMessage({
  client,
  model,
  messages,
  tools,
  toolChoice,
  outputMode,
  reasoningEffort,
}) {
  const { instructions, input } = chatMessagesToResponsesInput(messages);
  const responsesTools = toResponsesTools(tools);
  const payload = {
    model,
    instructions: instructions || undefined,
    input,
    reasoning: { effort: normalizeReasoningEffort(reasoningEffort) },
    max_output_tokens: resolveOutputTokenLimit(outputMode, responsesTools.length > 0),
    store: false,
  };
  if (responsesTools.length) {
    payload.tools = responsesTools;
    payload.tool_choice = toResponsesToolChoice(toolChoice);
  }

  const response = await client.responses.create(payload);
  const message = responsesOutputToAssistantMessage(response);
  const hasContent = Boolean(String(message.content || '').trim());
  const hasToolCalls = Array.isArray(message.tool_calls) && message.tool_calls.length > 0;
  if (!hasContent && !hasToolCalls) {
    const emptyError = new Error(`OpenAI retornou resposta vazia (model=${model})`);
    emptyError.status = 502;
    emptyError.code = 'OPENAI_EMPTY_RESPONSE';
    throw emptyError;
  }

  return {
    message,
    usage: usageFromResponses(response?.usage),
    requestId: response?.id ?? null,
  };
}

module.exports = {
  modelRequiresResponsesForTools,
  normalizeReasoningEffort,
  chatMessagesToResponsesInput,
  toResponsesTools,
  toResponsesToolChoice,
  responsesOutputToAssistantMessage,
  usageFromResponses,
  requestResponsesAssistantMessage,
};
