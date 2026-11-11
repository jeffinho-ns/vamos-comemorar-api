'use strict';

const {
  getWameApiKey,
  getWameServerUrl,
  isWameConfigured,
} = require('./wameConfig');

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

async function sendText(to, text) {
  if (!isWameConfigured()) {
    throw new Error('Wame não configurado (WAME_SERVER_URL / WAME_API_KEY).');
  }
  if (!text || typeof text !== 'string') {
    throw new Error('Texto inválido para envio via Wame.');
  }

  const key = getWameApiKey();
  const server = getWameServerUrl();
  const recipient = normalizeRecipient(to);
  const url = `${server}/${encodeURIComponent(key)}/message/text`;

  const response = await fetch(url, {
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
    throw new Error(`Falha ao enviar via Wame: ${response.status} ${detail}`);
  }

  return body;
}

module.exports = {
  sendText,
  normalizeRecipient,
};
