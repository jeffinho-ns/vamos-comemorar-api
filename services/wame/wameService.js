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

async function postText(server, key, recipient, text) {
  const response = await fetch(`${server}/${encodeURIComponent(key)}/message/text`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      to: recipient,
      text,
      provider: 'whatsapp',
      linkPreview: false,
    }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = typeof body === 'object' ? JSON.stringify(body) : String(body || '');
    const error = new Error(`Falha ao enviar via Wame: ${response.status} ${detail}`);
    error.status = response.status;
    throw error;
  }
  return body;
}

async function sendText(to, text) {
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
  let lastError = null;

  for (const server of serverCandidates()) {
    try {
      return await postText(server, key, recipient, text);
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

module.exports = {
  sendText,
  normalizeRecipient,
  providerMessageId,
  instanceIdFromStoredPayload,
};
