/**
 * Configuração centralizada de modelos e janela de contexto.
 * Modelo homologado em produção: gpt-5.5 (ver agentService.js).
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

/** Todas as tarefas usam o modelo homologado (gpt-5.5). */
function getModelForTask(_task) {
  return MODEL_AGENT;
}

/**
 * Sem limite de output — a API usa o default do modelo.
 * Garante que max_tokens / max_completion_tokens não sejam enviados.
 */
function applyOutputLimit(payload) {
  if (!payload || typeof payload !== 'object') return payload;
  delete payload.max_tokens;
  delete payload.max_completion_tokens;
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
