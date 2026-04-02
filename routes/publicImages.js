const express = require('express');
const firebaseStorage = require('../services/firebaseStorageAdminService');
const { limiter60PerMin, limiter20PerMinNoRef } = require('../middleware/rateLimiters');
const { hotlinkProtection, buildAllowedHostsFromConfig } = require('../middleware/hotlinkProtection');

const router = express.Router();

const isDevelopment = process.env.NODE_ENV !== 'production';
const config = require(isDevelopment ? '../config/development' : '../config/production');
const allowedHosts = buildAllowedHostsFromConfig(config);

// GET /public/images/<objectPath>
// Serve imagens do Firebase Storage com cache forte para reduzir egress repetido.
// Observação: isso não é uma proteção forte contra scraping/hotlinking sozinho,
// mas permite adicionar CDN + caching de forma controlada sem expor tokens.
router.get(
  '/images/*',
  (req, res, next) => {
    // Se não houver Referer/Origin, aplicar rate limit mais agressivo.
    const hasRef = !!req.headers.referer || !!req.headers.origin;
    return (hasRef ? limiter60PerMin : limiter20PerMinNoRef)(req, res, next);
  },
  hotlinkProtection({ allowedHosts }),
  async (req, res) => {
  try {
    const objectPath = decodeURIComponent(String(req.params[0] || '').trim());
    if (!objectPath) return res.status(400).json({ error: 'objectPath é obrigatório' });

    const file = firebaseStorage.getBucket().file(objectPath);

    // Cache forte (CDN/browser). Como os nomes são únicos, dá para ser agressivo.
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    // Garantir Content-Type para browsers e para o otimizador do Next/Image.
    // (Sem isso, alguns clientes tratam como octet-stream e não exibem.)
    try {
      const [meta] = await file.getMetadata();
      if (meta?.contentType) res.setHeader('Content-Type', meta.contentType);
      if (meta?.size) res.setHeader('Content-Length', meta.size);
      if (meta?.etag) res.setHeader('ETag', meta.etag);
    } catch (e) {
      // Se metadata falhar, ainda tenta stream.
    }

    // Stream direto do bucket
    file
      .createReadStream()
      .on('error', (err) => {
        if (err && (err.code === 404 || err.code === 400)) {
          return res.status(404).end();
        }
        console.error('Erro ao fazer stream da imagem:', err);
        return res.status(500).end();
      })
      .pipe(res);
  } catch (err) {
    console.error('Erro no endpoint público de imagens:', err);
    return res.status(500).end();
  }
});

module.exports = router;

