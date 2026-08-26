'use strict';

/**
 * Cliente Groq (OpenAI-compatible) para o Staff Agent.
 * Isolado do agente WhatsApp (OpenAI gpt-5.5).
 */

const OpenAI = require('openai');

// llama-3.3-70b-versatile saiu do ar em 16/08/2026 (free/developer).
// Substitutos oficiais Groq: openai/gpt-oss-120b ou qwen/qwen3.6-27b.
const DEFAULT_MODEL = 'openai/gpt-oss-120b';
const FALLBACK_MODELS = ['qwen/qwen3.6-27b', 'openai/gpt-oss-20b'];
const TIMEOUT_MS = Number(process.env.STAFF_AGENT_GROQ_TIMEOUT_MS || 30000);

let cachedClient = null;
let cachedKey = null;

function getModel() {
  return String(process.env.STAFF_AGENT_GROQ_MODEL || '').trim() || DEFAULT_MODEL;
}

function isEnabled() {
  return Boolean(String(process.env.GROQ_API_KEY || '').trim());
}

function getClient() {
  const key = String(process.env.GROQ_API_KEY || '').trim();
  if (!key) return null;
  if (!cachedClient || cachedKey !== key) {
    cachedClient = new OpenAI({
      apiKey: key,
      baseURL: 'https://api.groq.com/openai/v1',
      timeout: TIMEOUT_MS,
      maxRetries: 1,
    });
    cachedKey = key;
  }
  return cachedClient;
}

function isModelUnavailableError(e) {
  const status = e?.status || e?.response?.status;
  const msg = String(e?.message || '').toLowerCase();
  return (
    status === 404 ||
    msg.includes('does not exist') ||
    msg.includes('model_not_found') ||
    msg.includes('not found')
  );
}

function modelCandidates() {
  const primary = getModel();
  const fromEnv = String(process.env.STAFF_AGENT_GROQ_FALLBACK_MODELS || '')
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const extras = fromEnv.length ? fromEnv : FALLBACK_MODELS;
  return [...new Set([primary, ...extras])];
}

/**
 * @param {{ messages: object[], tools?: object[], tool_choice?: string|object }} opts
 */
async function chatCompletion(opts) {
  const client = getClient();
  if (!client) {
    const err = new Error('GROQ_API_KEY não configurada');
    err.code = 'groq_disabled';
    throw err;
  }

  const candidates = modelCandidates();
  let lastError = null;

  for (const model of candidates) {
    try {
      return await client.chat.completions.create({
        model,
        messages: opts.messages,
        tools: opts.tools,
        tool_choice: opts.tool_choice || 'auto',
        temperature: 0.2,
        max_tokens: Number(process.env.STAFF_AGENT_MAX_TOKENS || 800),
      });
    } catch (e) {
      lastError = e;
      const status = e?.status || e?.response?.status;
      if (status === 429) {
        const err = new Error(e?.message || 'Rate limit Groq');
        err.code = 'groq_rate_limit';
        err.status = 429;
        throw err;
      }
      if (isModelUnavailableError(e) && model !== candidates[candidates.length - 1]) {
        console.warn('[staffAgent] modelo Groq indisponível, tentando fallback', {
          model,
          message: e.message,
        });
        continue;
      }
      const err = new Error(
        isModelUnavailableError(e)
          ? `Modelo Groq indisponível (${candidates.join(' → ')}). Ajuste STAFF_AGENT_GROQ_MODEL no Render.`
          : e?.message || 'Erro Groq'
      );
      err.code = 'groq_upstream';
      err.status = status;
      throw err;
    }
  }

  const err = new Error(lastError?.message || 'Erro Groq');
  err.code = 'groq_upstream';
  err.status = lastError?.status;
  throw err;
}

module.exports = {
  getModel,
  isEnabled,
  chatCompletion,
};
