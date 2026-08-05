/**
 * Configuração centralizada de modelos e janela de contexto.
 * Agente (tools/reservas): gpt-5.5. FAQ/resumos: modelo econômico (ver agentService.js).
 */

function sanitizeOpenAiModelName(value, fallbackDefault) {
  const raw = String(value || '').trim();
  if (!raw) return fallbackDefault;

  // Typo comum em env de produção: pt-5.4 em vez de gpt-5.4
  let normalized = /^pt-/i.test(raw) ? raw.replace(/^pt-/i, 'gpt-') : raw;

  if (!/^(gpt-|o\d|chatgpt-)/i.test(normalized)) {
    console.warn(
      `[openAiConfig] OPENAI model inválido "${raw}" — usando fallback ${fallbackDefault}`
    );
    return fallbackDefault;
  }

  if (normalized !== raw) {
    console.warn(`[openAiConfig] modelo corrigido "${raw}" -> "${normalized}"`);
  }

  return normalized;
}

const MODEL_AGENT = sanitizeOpenAiModelName(process.env.OPENAI_AGENT_MODEL, 'gpt-5.5');
const MODEL_FALLBACK = sanitizeOpenAiModelName(process.env.OPENAI_AGENT_FALLBACK_MODEL, 'gpt-4o');
const MODEL_ECONOMY = sanitizeOpenAiModelName(
  process.env.OPENAI_ECONOMY_MODEL,
  'gpt-4o-mini'
);

const MAX_CONTEXT_MESSAGES = Number(process.env.MAX_CONTEXT_MESSAGES || 8);
const FAQ_MAX_TOKENS_PER_TURN = Number(process.env.FAQ_MAX_TOKENS_PER_TURN || 600);
const FAQ_MAX_CHARS_PER_TURN = FAQ_MAX_TOKENS_PER_TURN * 4;

const AGENT_MAX_TOOL_ROUNDS = Number(process.env.AGENT_MAX_TOOL_ROUNDS || 2);
const AGENT_MAX_TOOL_ROUNDS_FUNNEL = Number(process.env.AGENT_MAX_TOOL_ROUNDS_FUNNEL || 3);

/** Tópicos FAQ mínimos quando nenhum tópico é detectado (fallback enxuto). */
const FAQ_CORE_FALLBACK_TOPICS = [
  'dias_horarios_funcionamento',
  'horario_funcionamento',
  'valores_entrada',
  'dress_code',
  'cardapio',
];

function getMaxContextMessages() {
  const n = Number(MAX_CONTEXT_MESSAGES);
  return Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), 32) : 8;
}

/** Agente com tools usa gpt-5.5; FAQ e resumos usam modelo econômico. */
function getModelForTask(task) {
  const t = String(task || '').toLowerCase();
  if (t === 'faq' || t === 'summary' || t === 'history_summary') {
    return MODEL_ECONOMY;
  }
  return MODEL_AGENT;
}

/**
 * Aplica teto de tokens de conclusão conforme modo de saída.
 * OPENAI_MAX_COMPLETION_TOKENS (env) substitui os defaults por modo.
 */
function applyOutputLimit(payload, outputMode = 'conversational') {
  if (!payload || typeof payload !== 'object') return payload;

  const globalOverride = Number(process.env.OPENAI_MAX_COMPLETION_TOKENS);
  let limit;

  if (Number.isFinite(globalOverride) && globalOverride > 0) {
    limit = Math.floor(globalOverride);
  } else {
    const mode = String(outputMode || 'conversational').toLowerCase();
    const hasTools = Array.isArray(payload.tools) && payload.tools.length > 0;

    if (mode === 'json' || mode === 'summary') {
      limit = 220;
    } else if (mode === 'agent' || hasTools) {
      limit = 500;
    } else {
      limit = 400;
    }
  }

  const model = String(payload.model || '').toLowerCase();
  const isGpt5 = /^gpt-5/i.test(model);

  delete payload.max_tokens;
  delete payload.max_completion_tokens;

  if (isGpt5) {
    payload.max_completion_tokens = limit;
  } else {
    payload.max_tokens = limit;
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
  MODEL_FALLBACK,
  MODEL_ECONOMY,
  sanitizeOpenAiModelName,
  MAX_CONTEXT_MESSAGES,
  FAQ_MAX_TOKENS_PER_TURN,
  FAQ_MAX_CHARS_PER_TURN,
  FAQ_CORE_FALLBACK_TOPICS,
  AGENT_MAX_TOOL_ROUNDS,
  AGENT_MAX_TOOL_ROUNDS_FUNNEL,
  getMaxContextMessages,
  getModelForTask,
  applyOutputLimit,
  getAgentToolRoundLimits,
};
