const express = require('express');
const { isInstagramPayload } = require('../services/instagram/instagramWebhookParse');
const { processInstagramWebhook } = require('../services/instagram/processInstagramInbound');

module.exports = (pool, app) => {
  const router = express.Router();

  router.get('/', (req, res) => {
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    const verifyToken = process.env.INSTAGRAM_VERIFY_TOKEN || process.env.WHATSAPP_VERIFY_TOKEN;
    if (!verifyToken) {
      console.error('[instagram webhook] token de verificação ausente.');
      return res.status(500).send('Internal configuration error');
    }
    if (token === verifyToken && challenge) {
      return res.status(200).type('text/plain').send(challenge);
    }
    return res.status(403).send('Forbidden');
  });

  router.post('/', async (req, res) => {
    const payload = req.body;
    if (!payload || (typeof payload === 'object' && Object.keys(payload).length === 0)) {
      return res.sendStatus(200);
    }
    if (!isInstagramPayload(payload)) {
      return res.sendStatus(200);
    }
    try {
      await processInstagramWebhook({ pool, app, payload });
    } catch (error) {
      console.error('[instagram webhook] falha no turno:', error.message);
    }
    return res.sendStatus(200);
  });

  return router;
};
