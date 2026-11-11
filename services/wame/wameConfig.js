'use strict';

function trimEnv(name) {
  const value = process.env[name];
  return value == null ? '' : String(value).trim();
}

function isWameOutboundEnabled() {
  const provider = trimEnv('WHATSAPP_OUTBOUND_PROVIDER').toLowerCase();
  if (provider === 'wame') return true;
  if (provider === 'meta') return false;
  return trimEnv('WAME_ENABLED').toLowerCase() === 'true';
}

function getWameServerUrl() {
  const raw = trimEnv('WAME_SERVER_URL') || 'https://v5.api.wame.pro';
  return raw.replace(/\/+$/, '');
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

module.exports = {
  isWameOutboundEnabled,
  getWameServerUrl,
  getWameApiKey,
  getWameWebhookToken,
  isWameConfigured,
};
