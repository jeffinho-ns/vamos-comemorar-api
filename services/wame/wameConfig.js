'use strict';

function trimEnv(name) {
  const value = process.env[name];
  return value == null ? '' : String(value).trim();
}

function parseJsonObjectEnv(name) {
  const raw = trimEnv(name);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return parsed;
  } catch (_) {
    return {};
  }
}

function normalizeServerUrl(raw) {
  return String(raw || '')
    .trim()
    .replace(/\/+$/, '');
}

function isLikelyWameInstanceKey(value) {
  return /^[a-z0-9]{8,40}$/i.test(String(value || '').trim());
}

function isWameOutboundEnabled() {
  const provider = trimEnv('WHATSAPP_OUTBOUND_PROVIDER').toLowerCase();
  if (provider === 'wame') return true;
  if (provider === 'meta') return false;
  return trimEnv('WAME_ENABLED').toLowerCase() === 'true';
}

function getWameServerUrl() {
  const raw = trimEnv('WAME_SERVER_URL') || 'https://v5.api.wame.pro';
  return normalizeServerUrl(raw);
}

function getWameApiKey() {
  return trimEnv('WAME_API_KEY');
}

function getWameWebhookToken() {
  return trimEnv('WAME_WEBHOOK_TOKEN');
}

function isWameConfigured() {
  return Boolean(getWameServerUrl() && getWameApiKey());
}

/**
 * Mapa explícito establishment_id → instância (Key Wame).
 * Ex.: WAME_INSTANCE_BY_ESTABLISHMENT={"1":"justinoKey","7":"highlineKey"}
 */
function getWameInstanceByEstablishmentMap() {
  return parseJsonObjectEnv('WAME_INSTANCE_BY_ESTABLISHMENT');
}

/**
 * Mapa explícito instância → servidor Wame.
 * Ex.: WAME_SERVER_BY_INSTANCE={"justinoKey":"https://us.api-wa.me"}
 */
function getWameServerByInstanceMap() {
  return parseJsonObjectEnv('WAME_SERVER_BY_INSTANCE');
}

function resolveMappedInstanceForEstablishment(establishmentId) {
  const id = Number(establishmentId);
  if (!Number.isFinite(id) || id <= 0) return null;
  const map = getWameInstanceByEstablishmentMap();
  const keyed = map[String(id)] ?? map[id];
  const value = String(keyed || '').trim();
  return isLikelyWameInstanceKey(value) ? value : null;
}

function resolveMappedServerForInstance(instanceId) {
  const key = String(instanceId || '').trim();
  if (!key) return null;
  const map = getWameServerByInstanceMap();
  const raw = map[key];
  const server = normalizeServerUrl(raw);
  return server || null;
}

module.exports = {
  isWameOutboundEnabled,
  getWameServerUrl,
  getWameApiKey,
  getWameWebhookToken,
  isWameConfigured,
  isLikelyWameInstanceKey,
  getWameInstanceByEstablishmentMap,
  getWameServerByInstanceMap,
  resolveMappedInstanceForEstablishment,
  resolveMappedServerForInstance,
  normalizeServerUrl,
};
