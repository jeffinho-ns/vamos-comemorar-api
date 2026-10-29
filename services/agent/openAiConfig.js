/**
 * Configuração centralizada de modelos e janela de contexto.
 * Agente (tools/reservas): gpt-6.1-sol. FAQ/resumos: modelo econômico (ver agentService.js).
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

const MODEL_AGENT = sanitizeOpenAiModelName(process.env.OPENAI_AGENT_MODEL, 'gpt-6.1-sol');
const MODEL_FALLBACK = sanitizeOpenAiModelName(process.env.OPENAI_AGENT_FALLBACK_MODEL, 'gpt-5.5');
const MODEL_ECONOMY = sanitizeOpenAiModelName(
  process.env.OPENAI_ECONOMY_MODEL,
  'gpt-4o-mini'
);

const MAX_CONTEXT_MESSAGES = Number(process.env.MAX_CONTEXT_MESSAGES || 8);
const FAQ_MAX_TOKENS_PER_TURN = Number(process.env.FAQ_MAX_TOKENS_PER_TURN || 400);
const FAQ_MAX_CHARS_PER_TURN = FAQ_MAX_TOKENS_PER_TURN * 4;
/** No funil de reserva, injeta ainda menos FAQ no prompt do agente. */
const FAQ_MAX_CHARS_FUNNEL = Number(process.env.FAQ_MAX_CHARS_FUNNEL || 800);

const AGENT_MAX_TOOL_ROUNDS = Number(process.env.AGENT_MAX_TOOL_ROUNDS || 2);
const AGENT_MAX_TOOL_ROUNDS_FUNNEL = Number(process.env.AGENT_MAX_TOOL_ROUNDS_FUNNEL || 2);

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

/** Agente com tools usa gpt-6.1-sol; FAQ e resumos usam modelo econômico. */
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
function resolveOutputTokenLimit(outputMode = 'conversational', hasTools = false) {
  const globalOverride = Number(process.env.OPENAI_MAX_COMPLETION_TOKENS);
  if (Number.isFinite(globalOverride) && globalOverride > 0) {
    return Math.floor(globalOverride);
  }
  const mode = String(outputMode || 'conversational').toLowerCase();
  if (mode === 'json' || mode === 'summary') return 220;
  if (mode === 'funnel') return 320;
  if (mode === 'agent' || hasTools) return 500;
  return 400;
}

function applyOutputLimit(payload, outputMode = 'conversational') {
  if (!payload || typeof payload !== 'object') return payload;

  const hasTools = Array.isArray(payload.tools) && payload.tools.length > 0;
  const limit = resolveOutputTokenLimit(outputMode, hasTools);

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
    : 2;
  // Funil usa o teto do funil (pode ser igual ou menor que o base) — não inflar rounds.
  return funnelActive ? funnel : base;
}

module.exports = {
  MODEL_AGENT,
  MODEL_FALLBACK,
  MODEL_ECONOMY,
  sanitizeOpenAiModelName,
  MAX_CONTEXT_MESSAGES,
  FAQ_MAX_TOKENS_PER_TURN,
  FAQ_MAX_CHARS_PER_TURN,
  FAQ_MAX_CHARS_FUNNEL,
  FAQ_CORE_FALLBACK_TOPICS,
  AGENT_MAX_TOOL_ROUNDS,
  AGENT_MAX_TOOL_ROUNDS_FUNNEL,
  getMaxContextMessages,
  getModelForTask,
  resolveOutputTokenLimit,
  applyOutputLimit,
  getAgentToolRoundLimits,
};
