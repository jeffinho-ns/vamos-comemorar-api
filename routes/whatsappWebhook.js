const express = require('express');

const router = express.Router();

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

router.post('/', (req, res) => {
  const payload = req.body;

  if (!payload || (typeof payload === 'object' && Object.keys(payload).length === 0)) {
    console.warn('[WhatsApp webhook] POST recebido sem corpo.');
    return res.sendStatus(200);
  }

  console.log('[WhatsApp webhook] payload:', JSON.stringify(payload, null, 2));
  return res.sendStatus(200);
});

module.exports = () => router;
