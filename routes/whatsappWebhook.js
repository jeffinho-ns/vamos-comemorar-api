const express = require('express');
const { interpretMessage } = require('../services/aiService');

const router = express.Router();

function extractMessageText(payload) {
  const entry = payload?.entry?.[0];
  const change = entry?.changes?.[0];
  const value = change?.value;
  const firstMessage = value?.messages?.[0];

  if (!firstMessage) return null;

  if (firstMessage?.text?.body) return firstMessage.text.body;
  if (firstMessage?.button?.text) return firstMessage.button.text;
  if (firstMessage?.interactive?.button_reply?.title) {
    return firstMessage.interactive.button_reply.title;
  }
  if (firstMessage?.interactive?.list_reply?.title) {
    return firstMessage.interactive.list_reply.title;
  }

  return null;
}

/**
 * Webhook da API oficial do WhatsApp (Meta).
 * GET: validação do endpoint.
 * POST: recebimento de eventos (mensagens/status).
 */
router.get('/', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;

  if (!verifyToken) {
    console.error('[WhatsApp webhook] WHATSAPP_VERIFY_TOKEN não definido no ambiente.');
    return res.status(500).send('Internal configuration error');
  }

  if (token === verifyToken && challenge) {
    return res.status(200).type('text/plain').send(challenge);
  }

  console.warn('[WhatsApp webhook] Verificação GET recusada', {
    hub_mode: mode,
    has_verify_token: Boolean(token),
    has_challenge: Boolean(challenge),
  });
  return res.status(403).send('Forbidden');
});

router.post('/', async (req, res) => {
  const payload = req.body;

  if (!payload || (typeof payload === 'object' && Object.keys(payload).length === 0)) {
    console.warn('[WhatsApp webhook] POST recebido sem corpo.');
    return res.sendStatus(200);
  }

  console.log('[WhatsApp webhook] payload:', JSON.stringify(payload, null, 2));
  const messageText = extractMessageText(payload);

  if (!messageText) {
    console.log('[WhatsApp webhook] Nenhuma mensagem de texto encontrada no payload.');
    return res.sendStatus(200);
  }

  try {
    const interpreted = await interpretMessage(messageText);
    console.log('[WhatsApp webhook] interpretação IA:', interpreted);
  } catch (error) {
    console.error('[WhatsApp webhook] erro ao interpretar mensagem com IA:', error.message);
  }

  return res.sendStatus(200);
});

module.exports = () => router;
