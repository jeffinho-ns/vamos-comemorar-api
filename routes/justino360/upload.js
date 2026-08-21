'use strict';

/**
 * Upload de evidências Justino360 via Firebase Storage
 * (mesmo serviço de cardápio/imagens — não Cloudinary).
 */
const express = require('express');
const multer = require('multer');
const path = require('path');
const firebaseStorage = require('../../services/firebaseStorageAdminService');
const { applyCommonMiddleware } = require('./middleware');

const MAX_FILE_BYTES = 15 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_BYTES, files: 1 },
});

// SVG fica fora: é servido inline pelo Firebase e pode carregar script.
const ALLOWED_MIME =
  /^(image\/(jpeg|png|webp|gif|heic|heif)|video\/(mp4|quicktime|webm|3gpp)|application\/pdf)$/;

function safeExtension(originalname) {
  const raw = path.extname(String(originalname || '')).replace('.', '').toLowerCase();
  return /^[a-z0-9]{1,8}$/.test(raw) ? raw : 'bin';
}

module.exports = (pool) => {
  const router = express.Router({ mergeParams: true });
  applyCommonMiddleware(router, pool);

  router.post('/upload', upload.single('file'), async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Arquivo obrigatório.' });
    }
    if (!ALLOWED_MIME.test(String(req.file.mimetype || ''))) {
      return res.status(400).json({
        success: false,
        message: 'Tipo de arquivo não permitido. Use foto (JPG/PNG/WEBP/HEIC), vídeo (MP4/MOV/WEBM) ou PDF.',
      });
    }
    const establishmentId = req.j360EstablishmentId;
    if (!establishmentId) {
      return res.status(403).json({ success: false, message: 'Estabelecimento não resolvido.' });
    }
    try {
      const ext = safeExtension(req.file.originalname);
      const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      const objectPath = `justino360/${establishmentId}/j360-${establishmentId}-${unique}.${ext}`;

      const uploaded = await firebaseStorage.uploadBuffer({
        objectPath,
        buffer: req.file.buffer,
        contentType: req.file.mimetype,
      });

      if (!uploaded?.url) {
        return res.status(500).json({ success: false, message: 'Falha no upload.' });
      }

      return res.status(201).json({
        success: true,
        data: {
          url: uploaded.url,
          object_path: uploaded.objectPath,
          public_id: uploaded.objectPath,
          bytes: req.file.size,
          format: ext,
        },
      });
    } catch (err) {
      console.error(
        `[j360] upload firebase establishment_id=${establishmentId} ` +
          `user=${req.user?.id || 'anon'}: ${err.message}`
      );
      return res.status(500).json({ success: false, message: 'Falha ao enviar evidência.' });
    }
  });

  // Multer sinaliza limite excedido via erro — sem isto o cliente recebe 500.
  router.use('/upload', (err, req, res, next) => {
    if (err instanceof multer.MulterError) {
      const message =
        err.code === 'LIMIT_FILE_SIZE'
          ? 'Arquivo acima de 15 MB.'
          : 'Envio inválido. Anexe um único arquivo no campo "file".';
      return res.status(400).json({ success: false, message });
    }
    return next(err);
  });

  return router;
};
