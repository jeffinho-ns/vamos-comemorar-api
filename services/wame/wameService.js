'use strict';

const {
  getWameApiKey,
  getWameServerUrl,
  isWameConfigured,
} = require('./wameConfig');
const { currentWame } = require('./wameContext');

const FALLBACK_SERVERS = [
  'https://us.api-wa.me',
  'https://server.api-wa.me',
  'https://server.wame.api.br',
];

function digitsOnly(value) {
  return String(value || '').replace(/\D/g, '');
}

function normalizeRecipient(to) {
  const { parseScopedWaId } = require('../whatsapp/whatsappPhoneLineService');
  const scoped = parseScopedWaId(to);
  const raw = scoped?.customer || to;
  const digits = digitsOnly(raw);
  if (!digits || digits.length < 12) {
    throw new Error('Destinatário Wame inválido (use DDI+DDD+número).');
  }
  return digits;
}

function resolveApiKey() {
  const fromContext = String(currentWame()?.instanceId || '').trim();
  if (fromContext && /[a-z]/i.test(fromContext)) return fromContext;
  return getWameApiKey();
}

function serverCandidates() {
  const primary = getWameServerUrl();
  return [...new Set([primary, ...FALLBACK_SERVERS])];
}

function isRetryableSendError(error) {
  const message = String(error?.message || '');
  return /fetch failed|enotfound|econnrefused|timed out|network/i.test(message);
}

function isClosedWindowError(error) {
  return Number(error?.status) === 409 || /janela de atendimento de 24h/i.test(String(error?.message || ''));
}

function quotedMessageIdFromPayload(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id =
    raw.wame_message_id ||
    raw.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.id ||
    null;
  if (!id) return null;
  const value = String(id).trim();
  return value ? value : null;
}

async function postText(server, key, recipient, text, quotedMessageId) {
  const payload = {
    to: recipient,
    text,
    provider: 'whatsapp',
    linkPreview: false,
  };
  if (quotedMessageId) {
    payload.quotedId = quotedMessageId;
    payload.context = { message_id: quotedMessageId };
  }
  const paths = quotedMessageId
    ? [
        `${server}/${encodeURIComponent(key)}/message/${encodeURIComponent(quotedMessageId)}/text`,
        `${server}/${encodeURIComponent(key)}/message/text`,
      ]
    : [`${server}/${encodeURIComponent(key)}/message/text`];

  let lastError = null;
  for (const url of paths) {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const body = await response.json().catch(() => ({}));
    if (response.ok) return body;
    const detail = typeof body === 'object' ? JSON.stringify(body) : String(body || '');
    lastError = new Error(`Falha ao enviar via Wame: ${response.status} ${detail}`);
    lastError.status = response.status;
    if (response.status !== 404 && response.status !== 409) throw lastError;
  }
  throw lastError;
}

async function sendText(to, text, options = {}) {
  if (!isWameConfigured() && !resolveApiKey()) {
    throw new Error('Wame não configurado (WAME_SERVER_URL / WAME_API_KEY).');
  }
  if (!text || typeof text !== 'string') {
    throw new Error('Texto inválido para envio via Wame.');
  }

  const key = resolveApiKey();
  if (!key) {
    throw new Error('Wame não configurado (WAME_SERVER_URL / WAME_API_KEY).');
  }
  const recipient = normalizeRecipient(to);
  const quotedMessageId =
    String(options.quotedMessageId || currentWame()?.quotedMessageId || '').trim() || null;
  let lastError = null;

  for (const server of serverCandidates()) {
    try {
      return await postText(server, key, recipient, text, quotedMessageId);
    } catch (error) {
      lastError = error;
      const status = Number(error?.status || 0);
      if (isRetryableSendError(error) || status === 401 || status === 404) continue;
      throw error;
    }
  }

  throw lastError || new Error('Falha ao enviar via Wame.');
}

function providerMessageId(result) {
  if (!result || typeof result !== 'object') return null;
  const metaId = result.messages?.[0]?.id;
  if (metaId) return String(metaId);
  const wameId =
    result.data?.key?.id ||
    result.key?.id ||
    result.data?.messageId ||
    result.messageId ||
    null;
  if (wameId) return String(wameId);
  if (Number(result.status) === 200) return `wame-${Date.now()}`;
  return null;
}

function instanceIdFromStoredPayload(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id =
    raw.entry?.[0]?.changes?.[0]?.value?.metadata?.phone_number_id ||
    raw.instance ||
    null;
  if (!id || !/[a-z]/i.test(String(id))) return null;
  return String(id);
}

const establishmentInstanceCache = new Map();

function rememberEstablishmentInstance(establishmentId, instanceId) {
  const id = Number(establishmentId);
  if (!Number.isFinite(id) || id <= 0 || !instanceId) return;
  establishmentInstanceCache.set(id, {
    value: String(instanceId),
    expires: Date.now() + 10 * 60 * 1000,
  });
}

async function findEstablishmentWameInstanceId(pool, establishmentId) {
  const id = Number(establishmentId);
  if (!pool || !Number.isFinite(id) || id <= 0) return null;
  const cached = establishmentInstanceCache.get(id);
  if (cached && cached.expires > Date.now()) return cached.value;

  const result = await pool.query(
    `SELECT m.raw_payload
       FROM whatsapp_messages m
       JOIN whatsapp_conversations c ON c.id = m.conversation_id
      WHERE c.establishment_id = $1
        AND m.raw_payload IS NOT NULL
        AND (
          COALESCE(m.raw_payload->'entry'->0->'changes'->0->'value'->'metadata'->>'phone_number_id', '') ~ '[A-Za-z]'
          OR COALESCE(m.raw_payload->>'instance', '') ~ '[A-Za-z]'
        )
      ORDER BY m.created_at DESC
      LIMIT 1`,
    [id],
  );
  const instanceId = instanceIdFromStoredPayload(result.rows[0]?.raw_payload);
  if (instanceId) rememberEstablishmentInstance(id, instanceId);
  return instanceId;
}

async function requestJson(key, pathAndQuery) {
  if (!key) throw new Error('Instância Wame não informada.');
  let lastError = null;
  for (const server of serverCandidates()) {
    try {
      const response = await fetch(`${server}/${encodeURIComponent(key)}/${pathAndQuery}`, {
        signal: AbortSignal.timeout(20000),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        const error = new Error(`Falha ao consultar a Wame: ${response.status}`);
        error.status = response.status;
        throw error;
      }
      return body;
    } catch (error) {
      lastError = error;
      const status = Number(error?.status || 0);
      if (isRetryableSendError(error) || status === 401 || status === 404) continue;
      throw error;
    }
  }
  throw lastError || new Error('Falha ao consultar a Wame.');
}

async function postJson(key, pathAndQuery, body = {}) {
  if (!key) throw new Error('Instância Wame não informada.');
  let lastError = null;
  for (const server of serverCandidates()) {
    try {
      const response = await fetch(`${server}/${encodeURIComponent(key)}/${pathAndQuery}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body || {}),
        signal: AbortSignal.timeout(30000),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const error = new Error(
          `Falha ao chamar a Wame (${pathAndQuery}): ${response.status}`
        );
        error.status = response.status;
        error.body = payload;
        throw error;
      }
      return payload;
    } catch (error) {
      lastError = error;
      const status = Number(error?.status || 0);
      if (isRetryableSendError(error) || status === 401 || status === 404) continue;
      throw error;
    }
  }
  throw lastError || new Error('Falha ao chamar a Wame.');
}

/**
 * Pede à Meta o histórico de coexistência (até ~180 dias).
 * Só funciona 1x por onboarding e em geral dentro de 24h da conexão.
 */
async function requestOfficialHistorySync(instanceId, { force = false } = {}) {
  const path = force
    ? 'instance/official/sync?force=true'
    : 'instance/official/sync';
  return postJson(instanceId, path, {});
}

async function getOfficialHistorySyncStatus(instanceId) {
  return requestJson(instanceId, 'instance/official/sync');
}

module.exports = {
  sendText,
  normalizeRecipient,
  providerMessageId,
  instanceIdFromStoredPayload,
  quotedMessageIdFromPayload,
  findEstablishmentWameInstanceId,
  rememberEstablishmentInstance,
  isClosedWindowError,
  requestJson,
  postJson,
  requestOfficialHistorySync,
  getOfficialHistorySyncStatus,
};
