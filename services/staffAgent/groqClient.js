'use strict';

/**
 * Cliente Groq (OpenAI-compatible) para o Staff Agent.
 * Isolado do agente WhatsApp (OpenAI gpt-5.5).
 */

const OpenAI = require('openai');

const DEFAULT_MODEL = 'llama-3.3-70b-versatile';
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

  const model = getModel();
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
    const status = e?.status || e?.response?.status;
    const err = new Error(e?.message || 'Erro Groq');
    err.code = status === 429 ? 'groq_rate_limit' : 'groq_upstream';
    err.status = status;
    throw err;
  }
}

module.exports = {
  getModel,
  isEnabled,
  chatCompletion,
};
