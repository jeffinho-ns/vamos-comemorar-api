const crypto = require('crypto');

function resolveAppSecret() {
  return process.env.WHATSAPP_APP_SECRET || process.env.META_APP_SECRET || '';
}

function shouldSkipValidation() {
  return process.env.WHATSAPP_SKIP_SIGNATURE_VALIDATION === 'true';
}

function getRawBodyBuffer(req) {
  if (Buffer.isBuffer(req.body)) {
    return req.body;
  }
  if (req.body === undefined || req.body === null) {
    return Buffer.alloc(0);
  }
  return Buffer.from(JSON.stringify(req.body), 'utf8');
}

/**
 * Valida X-Hub-Signature-256 (Meta WhatsApp Cloud API).
 * Deve rodar com req.body ainda em Buffer (express.raw).
 */
function validateMetaWebhookSignature(req, res, next) {
  if (req.method === 'GET') {
    return next();
  }

  const secret = resolveAppSecret();
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      console.error('[Meta webhook] WHATSAPP_APP_SECRET/META_APP_SECRET não definido.');
      return res.status(500).send('Webhook não configurado');
    }
    if (shouldSkipValidation()) {
      return next();
    }
    console.warn('[Meta webhook] Assinatura não validada — segredo ausente em ambiente não produtivo.');
    return next();
  }

  const signatureHeader = req.headers['x-hub-signature-256'];
  if (!signatureHeader || typeof signatureHeader !== 'string') {
    console.warn('[Meta webhook] Requisição sem X-Hub-Signature-256.');
    return res.status(403).send('Forbidden');
  }

  const rawBody = getRawBodyBuffer(req);
  const expected =
    'sha256=' + crypto.createHmac('sha256', secret).update(rawBody).digest('hex');

  const received = Buffer.from(signatureHeader, 'utf8');
  const expectedBuf = Buffer.from(expected, 'utf8');
  if (received.length !== expectedBuf.length) {
    console.warn('[Meta webhook] Assinatura inválida (tamanho diferente).');
    return res.status(403).send('Forbidden');
  }

  if (!crypto.timingSafeEqual(received, expectedBuf)) {
    console.warn('[Meta webhook] Assinatura inválida.');
    return res.status(403).send('Forbidden');
  }

  return next();
}

module.exports = validateMetaWebhookSignature;
