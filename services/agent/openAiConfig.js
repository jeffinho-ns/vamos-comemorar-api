/**
 * Configuração centralizada de modelos, limites de tokens e janela de contexto.
 * Variáveis de ambiente permitem ajuste fino sem deploy de código.
 */

const MODEL_AGENT = process.env.OPENAI_AGENT_MODEL || 'gpt-5.5';
// Modelos econômicos: gpt-4o-mini é amplamente disponível na API.
// gpt-5.4-mini/nano podem não existir em todas as contas — sobrescreva via env se tiver acesso.
const MODEL_FAQ = process.env.OPENAI_FAQ_MODEL || 'gpt-4o-mini';
const MODEL_CLASSIFICATION = process.env.OPENAI_CLASSIFICATION_MODEL || 'gpt-4o-mini';
const MODEL_CONFIRMATION = process.env.OPENAI_CONFIRMATION_MODEL || 'gpt-4o-mini';
const MODEL_SUMMARY = process.env.OPENAI_SUMMARY_MODEL || 'gpt-4o-mini';
const MODEL_FALLBACK = process.env.OPENAI_AGENT_FALLBACK_MODEL || 'gpt-4o';

const MAX_OUTPUT_TOKENS_CONVERSATIONAL = Number(process.env.OPENAI_MAX_OUTPUT_TOKENS || 500);
const MAX_OUTPUT_TOKENS_JSON = Number(process.env.OPENAI_MAX_OUTPUT_TOKENS_JSON || 200);

const MAX_CONTEXT_MESSAGES = Number(process.env.MAX_CONTEXT_MESSAGES || 10);
const FAQ_MAX_TOKENS_PER_TURN = Number(process.env.FAQ_MAX_TOKENS_PER_TURN || 800);
const FAQ_MAX_CHARS_PER_TURN = FAQ_MAX_TOKENS_PER_TURN * 4;

const AGENT_MAX_TOOL_ROUNDS = Number(process.env.AGENT_MAX_TOOL_ROUNDS || 2);
const AGENT_MAX_TOOL_ROUNDS_FUNNEL = Number(process.env.AGENT_MAX_TOOL_ROUNDS_FUNNEL || 3);

/** Tópicos FAQ mínimos quando nenhum tópico é detectado (fallback enxuto). */
const FAQ_CORE_FALLBACK_TOPICS = [
  'dias_horarios_funcionamento',
  'valores_entrada',
  'tom_atendimento_humano',
];

function getMaxContextMessages() {
  const n = Number(MAX_CONTEXT_MESSAGES);
  return Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), 32) : 10;
}

function getModelForTask(task) {
  switch (String(task || '').toLowerCase()) {
    case 'faq':
    case 'faq_first':
      return MODEL_FAQ;
    case 'classification':
    case 'intent':
    case 'topic_detection':
      return MODEL_CLASSIFICATION;
    case 'confirmation':
      return MODEL_CONFIRMATION;
    case 'summary':
    case 'memory_summary':
      return MODEL_SUMMARY;
    case 'agent':
    case 'reservation':
    case 'tools':
    default:
      return MODEL_AGENT;
  }
}

function getMaxOutputTokens(mode = 'conversational') {
  if (mode === 'json' || mode === 'confirmation') {
    return Number.isFinite(MAX_OUTPUT_TOKENS_JSON) && MAX_OUTPUT_TOKENS_JSON > 0
      ? MAX_OUTPUT_TOKENS_JSON
      : 200;
  }
  return Number.isFinite(MAX_OUTPUT_TOKENS_CONVERSATIONAL) && MAX_OUTPUT_TOKENS_CONVERSATIONAL > 0
    ? MAX_OUTPUT_TOKENS_CONVERSATIONAL
    : 500;
}

function modelUsesMaxCompletionTokens(modelName) {
  const normalized = String(modelName || '').trim().toLowerCase();
  // gpt-5.x e modelos reasoning (o-series) rejeitam max_tokens na Chat Completions API.
  return /^gpt-5(\b|[-.])/.test(normalized) || /^o\d/.test(normalized);
}

function applyOutputLimit(payload, mode = 'conversational') {
  const limit = getMaxOutputTokens(mode);
  if (!(limit > 0)) return payload;

  const modelName = String(payload.model || MODEL_AGENT);
  if (modelUsesMaxCompletionTokens(modelName)) {
    payload.max_completion_tokens = limit;
    delete payload.max_tokens;
  } else {
    payload.max_tokens = limit;
    delete payload.max_completion_tokens;
  }
  return payload;
}

function getAgentToolRoundLimits(funnelActive = false) {
  const base = Number.isFinite(AGENT_MAX_TOOL_ROUNDS) && AGENT_MAX_TOOL_ROUNDS > 0
    ? AGENT_MAX_TOOL_ROUNDS
    : 2;
  const funnel = Number.isFinite(AGENT_MAX_TOOL_ROUNDS_FUNNEL) && AGENT_MAX_TOOL_ROUNDS_FUNNEL > 0
    ? AGENT_MAX_TOOL_ROUNDS_FUNNEL
    : 3;
  return funnelActive ? Math.max(base, funnel) : base;
}

module.exports = {
  MODEL_AGENT,
  MODEL_FAQ,
  MODEL_CLASSIFICATION,
  MODEL_CONFIRMATION,
  MODEL_SUMMARY,
  MODEL_FALLBACK,
  MAX_OUTPUT_TOKENS_CONVERSATIONAL,
  MAX_OUTPUT_TOKENS_JSON,
  MAX_CONTEXT_MESSAGES,
  FAQ_MAX_TOKENS_PER_TURN,
  FAQ_MAX_CHARS_PER_TURN,
  FAQ_CORE_FALLBACK_TOPICS,
  AGENT_MAX_TOOL_ROUNDS,
  AGENT_MAX_TOOL_ROUNDS_FUNNEL,
  getMaxContextMessages,
  getModelForTask,
  getMaxOutputTokens,
  applyOutputLimit,
  getAgentToolRoundLimits,
};
