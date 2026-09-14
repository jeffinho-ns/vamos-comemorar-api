'use strict';

/**
 * Cliente xAI / Grok (OpenAI-compatible) para o Staff Agent.
 * Isolado do agente WhatsApp (OpenAI gpt-5.5).
 *
 * Env:
 *   XAI_API_KEY (obrigatória)
 *   STAFF_AGENT_XAI_MODEL (default: grok-4.3 — econômico + humano)
 *   STAFF_AGENT_XAI_FALLBACK_MODELS
 *   STAFF_AGENT_XAI_TIMEOUT_MS
 *   STAFF_AGENT_MAX_TOKENS (default: 800)
 *   STAFF_AGENT_TEMPERATURE (default: 0.5)
 */

const OpenAI = require('openai');

const DEFAULT_MODEL = 'grok-4.3';
const FALLBACK_MODELS = ['grok-4.5', 'grok-4.6'];
const TIMEOUT_MS = Number(process.env.STAFF_AGENT_XAI_TIMEOUT_MS || 45000);

let cachedClient = null;
let cachedKey = null;

function getModel() {
  return (
    String(process.env.STAFF_AGENT_XAI_MODEL || '').trim() ||
    String(process.env.STAFF_AGENT_GROQ_MODEL || '').trim() || // legado (não use)
    DEFAULT_MODEL
  );
}

function getApiKey() {
  return String(process.env.XAI_API_KEY || '').trim();
}

function isEnabled() {
  return Boolean(getApiKey());
}

function getClient() {
  const key = getApiKey();
  if (!key) return null;
  if (!cachedClient || cachedKey !== key) {
    cachedClient = new OpenAI({
      apiKey: key,
      baseURL: 'https://api.x.ai/v1',
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
    msg.includes('not found') ||
    msg.includes('invalid model')
  );
}

function modelCandidates() {
  const primary = getModel();
  const fromEnv = String(process.env.STAFF_AGENT_XAI_FALLBACK_MODELS || '')
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const extras = fromEnv.length ? fromEnv : FALLBACK_MODELS;
  return [...new Set([primary, ...extras])];
}

function getTemperature() {
  const raw = process.env.STAFF_AGENT_TEMPERATURE;
  if (raw === undefined || raw === '') return 0.5;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0.5;
}

/**
 * @param {{ messages: object[], tools?: object[], tool_choice?: string|object }} opts
 */
async function chatCompletion(opts) {
  const client = getClient();
  if (!client) {
    const err = new Error('XAI_API_KEY não configurada');
    err.code = 'xai_disabled';
    throw err;
  }

  const candidates = modelCandidates();
  let lastError = null;

  for (const model of candidates) {
    try {
      const payload = {
        model,
        messages: opts.messages,
        temperature: getTemperature(),
        max_tokens: Number(process.env.STAFF_AGENT_MAX_TOKENS || 800),
      };
      if (opts.tools && opts.tools.length) {
        payload.tools = opts.tools;
        payload.tool_choice = opts.tool_choice || 'auto';
      }
      return await client.chat.completions.create(payload);
    } catch (e) {
      lastError = e;
      const status = e?.status || e?.response?.status;
      if (status === 429) {
        const err = new Error(e?.message || 'Rate limit xAI / Grok');
        err.code = 'xai_rate_limit';
        err.status = 429;
        throw err;
      }
      if (isModelUnavailableError(e) && model !== candidates[candidates.length - 1]) {
        console.warn('[staffAgent] modelo Grok indisponível, tentando fallback', {
          model,
          message: e.message,
        });
        continue;
      }
      const err = new Error(
        isModelUnavailableError(e)
          ? `Modelo Grok indisponível (${candidates.join(' → ')}). Ajuste STAFF_AGENT_XAI_MODEL no Render.`
          : e?.message || 'Erro xAI / Grok'
      );
      err.code = 'xai_upstream';
      err.status = status;
      throw err;
    }
  }

  const err = new Error(lastError?.message || 'Erro xAI / Grok');
  err.code = 'xai_upstream';
  err.status = lastError?.status;
  throw err;
}

module.exports = {
  getModel,
  isEnabled,
  chatCompletion,
};
