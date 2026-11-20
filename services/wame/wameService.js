'use strict';

const {
  getWameApiKey,
  getWameServerUrl,
  isWameConfigured,
  isLikelyWameInstanceKey,
  resolveMappedInstanceForEstablishment,
  resolveMappedServerForInstance,
  normalizeServerUrl,
} = require('./wameConfig');
const { currentWame } = require('./wameContext');

const FALLBACK_SERVERS = [
  'https://us.api-wa.me',
  'https://server.api-wa.me',
  'https://server.wame.api.br',
];

/** Cache em memória: establishment_id → instanceId */
const establishmentInstanceCache = new Map();
/** Cache em memória: instanceId → serverUrl que respondeu com sucesso */
const instanceServerCache = new Map();

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

function maskSecret(value) {
  const raw = String(value || '');
  if (!raw) return null;
  if (raw.length <= 4) return '••••';
  return `••••${raw.slice(-4)}`;
}

function safeLog(level, event, fields = {}) {
  const payload = {
    scope: 'wame',
    event,
    ...fields,
  };
  const line = JSON.stringify(payload);
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

function isTransientNetworkError(error) {
  const message = String(error?.message || '');
  const code = String(error?.code || error?.cause?.code || '');
  return (
    /fetch failed|enotfound|econnrefused|econnreset|etimedout|timed out|network|abort/i.test(
      message,
    ) || /ENOTFOUND|ECONNREFUSED|ECONNRESET|ETIMEDOUT|ABORT/i.test(code)
  );
}

/** @deprecated use isTransientNetworkError — mantido para testes antigos */
function isRetryableSendError(error) {
  return isTransientNetworkError(error);
}

function isTransientHttpStatus(status) {
  return [408, 425, 429, 500, 502, 503, 504].includes(Number(status) || 0);
}

function isPermanentHttpStatus(status) {
  const code = Number(status) || 0;
  return [400, 401, 403, 404, 409, 410, 422].includes(code);
}

function isClosedWindowError(error) {
  return Number(error?.status) === 409 || /janela de atendimento de 24h/i.test(String(error?.message || ''));
}

function shouldRetryOnAnotherServer(error) {
  if (!error) return false;
  if (isTransientNetworkError(error)) return true;
  const status = Number(error?.status || 0);
  if (!status) return isTransientNetworkError(error);
  // 401/404 = instância/credencial errada neste servidor — NÃO trocar de host
  if (isPermanentHttpStatus(status)) return false;
  return isTransientHttpStatus(status);
}

function rememberInstanceServer(instanceId, serverUrl) {
  const key = String(instanceId || '').trim();
  const server = normalizeServerUrl(serverUrl);
  if (!key || !server) return;
  instanceServerCache.set(key, {
    value: server,
    expires: Date.now() + 30 * 60 * 1000,
  });
}

function rememberedServerForInstance(instanceId) {
  const key = String(instanceId || '').trim();
  if (!key) return null;
  const cached = instanceServerCache.get(key);
  if (!cached || cached.expires <= Date.now()) return null;
  return cached.value;
}

/**
 * Candidatos de servidor para uma instância.
 * Se houver mapeamento explícito (env), usa só esse host.
 * Caso contrário: servidor lembrado → WAME_SERVER_URL → fallbacks (só para erro transitório).
 */
function serverCandidates(instanceId) {
  const key = String(instanceId || '').trim();
  const explicit = resolveMappedServerForInstance(key);
  if (explicit) return [explicit];

  const remembered = rememberedServerForInstance(key);
  const primary = getWameServerUrl();
  return [...new Set([remembered, primary, ...FALLBACK_SERVERS].filter(Boolean))];
}

function resolveApiKey() {
  const ctx = currentWame();
  const fromContext = String(ctx?.instanceId || '').trim();
  if (fromContext && /[a-z]/i.test(fromContext)) return fromContext;

  const establishmentId = Number(ctx?.establishmentId);
  if (Number.isFinite(establishmentId) && establishmentId > 0) {
    const mapped = resolveMappedInstanceForEstablishment(establishmentId);
    if (mapped) return mapped;
    // Com casa pinada: nunca cair na key global de outra casa
    return null;
  }

  return getWameApiKey();
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
    if (response.ok) {
      rememberInstanceServer(key, server);
      return body;
    }
    const detail = typeof body === 'object' ? JSON.stringify(body) : String(body || '');
    lastError = new Error(`Falha ao enviar via Wame: ${response.status} ${detail}`);
    lastError.status = response.status;
    // 404 no path com quotedId: tenta path sem quote no MESMO servidor
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
    throw new Error(
      'Instância Wame da casa não resolvida (sem fallback cruzado entre estabelecimentos).',
    );
  }
  const recipient = normalizeRecipient(to);
  const quotedMessageId =
    String(options.quotedMessageId || currentWame()?.quotedMessageId || '').trim() || null;
  let lastError = null;
  const candidates = serverCandidates(key);

  for (let i = 0; i < candidates.length; i += 1) {
    const server = candidates[i];
    try {
      const result = await postText(server, key, recipient, text, quotedMessageId);
      if (i > 0) {
        safeLog('warn', 'wame_send_server_failover', {
          instanceHint: maskSecret(key),
          serverHost: new URL(server).host,
          attempt: i + 1,
        });
      }
      return result;
    } catch (error) {
      lastError = error;
      const status = Number(error?.status || 0);
      const retry = shouldRetryOnAnotherServer(error) && i < candidates.length - 1;
      safeLog(retry ? 'warn' : 'error', 'wame_send_failed', {
        instanceHint: maskSecret(key),
        serverHost: (() => {
          try {
            return new URL(server).host;
          } catch (_) {
            return null;
          }
        })(),
        status: status || null,
        transient: shouldRetryOnAnotherServer(error),
        willRetryOtherServer: retry,
      });
      if (retry) continue;
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
  if (!Number.isFinite(id) || id <= 0) return null;

  const mapped = resolveMappedInstanceForEstablishment(id);
  if (mapped) {
    rememberEstablishmentInstance(id, mapped);
    return mapped;
  }

  const cached = establishmentInstanceCache.get(id);
  if (cached && cached.expires > Date.now()) return cached.value;

  if (!pool) return null;

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

/**
 * Resolução determinística multi-tenant:
 * establishment_id → mapa env → cache/histórico da mesma casa → (sem key global cruzada)
 */
async function resolveWameRouting(pool, establishmentId) {
  const id = Number(establishmentId);
  if (!Number.isFinite(id) || id <= 0) {
    return { establishmentId: null, instanceId: null, serverUrl: null, source: null };
  }

  let instanceId = null;
  let source = null;

  const mapped = resolveMappedInstanceForEstablishment(id);
  if (mapped) {
    instanceId = mapped;
    source = 'env_map';
  } else {
    instanceId = await findEstablishmentWameInstanceId(pool, id);
    if (instanceId) source = 'establishment_history';
  }

  if (!instanceId) {
    return { establishmentId: id, instanceId: null, serverUrl: null, source: null };
  }

  const explicitServer = resolveMappedServerForInstance(instanceId);
  const serverUrl =
    explicitServer || rememberedServerForInstance(instanceId) || getWameServerUrl();

  return {
    establishmentId: id,
    instanceId,
    serverUrl,
    source,
    serverSource: explicitServer ? 'env_map' : rememberedServerForInstance(instanceId) ? 'cache' : 'primary_env',
  };
}

async function requestWithServers(key, pathAndQuery, { method = 'GET', body } = {}) {
  if (!key) throw new Error('Instância Wame não informada.');
  if (!isLikelyWameInstanceKey(key) && !/[a-z]/i.test(String(key))) {
    throw new Error('Instância Wame inválida.');
  }

  let lastError = null;
  const candidates = serverCandidates(key);

  for (let i = 0; i < candidates.length; i += 1) {
    const server = candidates[i];
    try {
      const response = await fetch(`${server}/${encodeURIComponent(key)}/${pathAndQuery}`, {
        method,
        headers: method === 'GET' ? undefined : { 'Content-Type': 'application/json' },
        body: method === 'GET' ? undefined : JSON.stringify(body || {}),
        signal: AbortSignal.timeout(method === 'GET' ? 20000 : 30000),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const error = new Error(
          method === 'GET'
            ? `Falha ao consultar a Wame: ${response.status}`
            : `Falha ao chamar a Wame (${pathAndQuery}): ${response.status}`,
        );
        error.status = response.status;
        error.body = payload;
        throw error;
      }
      rememberInstanceServer(key, server);
      return payload;
    } catch (error) {
      lastError = error;
      const retry = shouldRetryOnAnotherServer(error) && i < candidates.length - 1;
      safeLog(retry ? 'warn' : 'error', 'wame_http_failed', {
        instanceHint: maskSecret(key),
        path: String(pathAndQuery || '').split('?')[0],
        method,
        status: Number(error?.status || 0) || null,
        transient: shouldRetryOnAnotherServer(error),
        willRetryOtherServer: retry,
      });
      if (retry) continue;
      throw error;
    }
  }
  throw lastError || new Error('Falha ao chamar a Wame.');
}

async function requestJson(key, pathAndQuery) {
  return requestWithServers(key, pathAndQuery, { method: 'GET' });
}

async function postJson(key, pathAndQuery, body = {}) {
  return requestWithServers(key, pathAndQuery, { method: 'POST', body });
}

/**
 * Pede à Meta o histórico de coexistência (até ~180 dias).
 * Só funciona 1x por onboarding e em geral dentro de 24h da conexão.
 * ALTO RISCO operacional — não chamar em produção sem aprovação.
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
  resolveWameRouting,
  isClosedWindowError,
  isRetryableSendError,
  isTransientNetworkError,
  isTransientHttpStatus,
  isPermanentHttpStatus,
  shouldRetryOnAnotherServer,
  serverCandidates,
  rememberInstanceServer,
  requestJson,
  postJson,
  requestOfficialHistorySync,
  getOfficialHistorySyncStatus,
  maskSecret,
  safeLog,
};
