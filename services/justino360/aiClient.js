'use strict';

/**
 * Justino360 IA — camada fina sobre a OpenAI.
 *
 * Responsabilidades: modelo homologado, timeout, retry curto, tradução de erro
 * para código HTTP estável e log com establishment_id. A normalização do JSON
 * fica em `aiNormalizer.js`; aqui só se garante que a resposta chega ou falha de
 * forma previsível.
 *
 * IMPORTANTE: este caminho é isolado do agente de WhatsApp (`services/agent/*`).
 * Nenhuma função daqui é usada por lá e vice-versa.
 */

const OpenAI = require('openai');
const { parseJsonLoose } = require('./aiNormalizer');

/**
 * TRAVA DE PRODUÇÃO — modelo homologado do ecossistema Agilizaiapp.
 * Downgrade só via env (JUSTINO360_AI_MODEL) e com aprovação explícita.
 */
const DEFAULT_MODEL = 'gpt-5.5';

const TIMEOUT_MS = Number(process.env.JUSTINO360_AI_TIMEOUT_MS || 45000);
const MAX_RETRIES = Number(process.env.JUSTINO360_AI_MAX_RETRIES || 1);

/** Códigos de falha expostos na resposta para a UI reagir sem parsear mensagem. */
const AI_DISABLED = 'ai_disabled';
const AI_TIMEOUT = 'ai_timeout';
const AI_INVALID_JSON = 'ai_invalid_json';
const AI_UPSTREAM = 'ai_upstream';

let cachedClient = null;
let cachedKey = null;

function getModel() {
  const model = String(process.env.JUSTINO360_AI_MODEL || '').trim();
  return model || DEFAULT_MODEL;
}

function isEnabled() {
  return Boolean(String(process.env.OPENAI_API_KEY || '').trim());
}

/**
 * A família gpt-5.x rejeita `temperature` custom (400 UNSUPPORTED_VALUE).
 * Mesma regra já aplicada no agente — aqui replicada porque o helper de lá é
 * privado do módulo e `services/agent/*` não pode ser alterado.
 */
function supportsTemperature(model) {
  return !/^gpt-5(\b|[-.])/.test(
    String(model || '')
      .trim()
      .toLowerCase()
  );
}

function getClient() {
  const key = String(process.env.OPENAI_API_KEY || '').trim();
  if (!key) return null;
  if (!cachedClient || cachedKey !== key) {
    cachedClient = new OpenAI({ apiKey: key, timeout: TIMEOUT_MS, maxRetries: MAX_RETRIES });
    cachedKey = key;
  }
  return cachedClient;
}

/** Corrida com timeout — o SDK já tem o seu, este é o teto de ponta a ponta. */
function withTimeout(promise, timeoutMs) {
  let timer = null;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const err = new Error(`OpenAI timeout após ${timeoutMs}ms`);
      err.code = 'OPENAI_TIMEOUT';
      reject(err);
    }, timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

function isTimeoutError(error) {
  const code = String(error?.code || '').toUpperCase();
  if (['OPENAI_TIMEOUT', 'ETIMEDOUT', 'ECONNABORTED', 'ECONNRESET'].includes(code)) return true;
  if (Number(error?.status) === 408) return true;
  return /timeout|timed out|aborted/i.test(String(error?.message || ''));
}

function describeError(error) {
  const status = Number(error?.status || error?.statusCode || 0);
  const detail = String(error?.error?.message || error?.message || 'erro desconhecido na OpenAI');
  return { status, detail };
}

/**
 * Chamada única em modo JSON. Nunca lança: devolve sempre
 * `{ ok: true, data, model, usage }` ou `{ ok: false, status, code, message }`.
 *
 * `context` entra nos logs (establishment_id, rota, usuário) para dar rastro em
 * produção sem vazar o conteúdo do prompt.
 */
async function requestJson({ system, user, maxOutputTokens = 2500, context = {} }) {
  if (!isEnabled()) {
    return {
      ok: false,
      status: 503,
      code: AI_DISABLED,
      message: 'IA indisponível: OPENAI_API_KEY não configurada no servidor.',
    };
  }

  const model = getModel();
  const where =
    `establishment_id=${context.establishmentId ?? '-'} rota=${context.route || '-'} ` +
    `user=${context.userId ?? 'anon'} model=${model}`;

  const payload = {
    model,
    response_format: { type: 'json_object' },
    max_completion_tokens: maxOutputTokens,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  };
  if (supportsTemperature(model)) payload.temperature = 0.3;

  const startedAt = Date.now();
  let completion;
  try {
    completion = await withTimeout(getClient().chat.completions.create(payload), TIMEOUT_MS);
  } catch (error) {
    if (isTimeoutError(error)) {
      console.error(`[j360][ai] timeout ${where} elapsed_ms=${Date.now() - startedAt}`);
      return {
        ok: false,
        status: 504,
        code: AI_TIMEOUT,
        message: 'A IA demorou demais para responder. Tente novamente.',
      };
    }
    const { status, detail } = describeError(error);
    console.error(`[j360][ai] upstream ${where} status=${status}: ${detail}`);
    return {
      ok: false,
      status: status === 429 ? 429 : 502,
      code: AI_UPSTREAM,
      message:
        status === 429
          ? 'Limite da IA atingido no momento. Tente de novo em alguns instantes.'
          : 'A IA não conseguiu responder agora.',
    };
  }

  const raw = completion?.choices?.[0]?.message?.content || '';
  const data = parseJsonLoose(raw);
  if (!data) {
    console.error(
      `[j360][ai] json inválido ${where} elapsed_ms=${Date.now() - startedAt} chars=${raw.length}`
    );
    return {
      ok: false,
      status: 502,
      code: AI_INVALID_JSON,
      message: 'A IA respondeu em um formato inesperado. Tente novamente.',
    };
  }

  const usage = completion?.usage || null;
  console.info(
    `[j360][ai] ok ${where} elapsed_ms=${Date.now() - startedAt} ` +
      `tokens_in=${usage?.prompt_tokens ?? '-'} tokens_out=${usage?.completion_tokens ?? '-'}`
  );

  return { ok: true, data, model, usage };
}

module.exports = {
  DEFAULT_MODEL,
  AI_DISABLED,
  AI_TIMEOUT,
  AI_INVALID_JSON,
  AI_UPSTREAM,
  getModel,
  isEnabled,
  supportsTemperature,
  requestJson,
};
