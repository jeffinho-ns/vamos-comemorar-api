'use strict';

/**
 * Upload de evidências Justino360 via Firebase Storage
 * (mesmo serviço de cardápio/imagens — não Cloudinary).
 */
const express = require('express');
const multer = require('multer');
const firebaseStorage = require('../../services/firebaseStorageAdminService');
const { isAllowedMime, normalizeMime, extensionOf } = require('../../services/justino360/uploadMime');
const { applyCommonMiddleware } = require('./middleware');

const MAX_FILE_BYTES = 15 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_BYTES, files: 1 },
});

function safeExtension(originalname, contentType) {
  const fromName = extensionOf(originalname);
  if (fromName) return fromName;
  const mime = normalizeMime(contentType, originalname);
  if (mime === 'image/jpeg') return 'jpg';
  if (mime === 'image/png') return 'png';
  if (mime === 'image/webp') return 'webp';
  if (mime === 'image/gif') return 'gif';
  if (mime === 'image/heic') return 'heic';
  if (mime === 'image/heif') return 'heif';
  if (mime === 'video/mp4') return 'mp4';
  if (mime === 'video/quicktime') return 'mov';
  if (mime === 'video/webm') return 'webm';
  if (mime === 'video/3gpp') return '3gp';
  if (mime === 'application/pdf') return 'pdf';
  return 'bin';
}

function multerErrorHandler(err, req, res, next) {
  if (err instanceof multer.MulterError) {
    const message =
      err.code === 'LIMIT_FILE_SIZE'
        ? 'Arquivo acima de 15 MB.'
        : 'Envio inválido. Anexe um único arquivo no campo "file".';
    return res.status(400).json({ success: false, message });
  }
  return next(err);
}

module.exports = (pool) => {
  const router = express.Router({ mergeParams: true });
  applyCommonMiddleware(router, pool);

  router.post(
    '/upload',
    upload.single('file'),
    async (req, res) => {
      if (!req.file) {
        return res.status(400).json({ success: false, message: 'Arquivo obrigatório.' });
      }

      const contentType = normalizeMime(req.file.mimetype, req.file.originalname);
      if (!isAllowedMime(req.file.mimetype, req.file.originalname)) {
        console.warn(
          `[j360] upload mime rejeitado type="${req.file.mimetype}" ` +
            `name="${req.file.originalname}" user=${req.user?.id || 'anon'}`
        );
        return res.status(400).json({
          success: false,
          message:
            'Tipo de arquivo não permitido. Use foto (JPG/PNG/WEBP/HEIC), vídeo (MP4/MOV/WEBM) ou PDF.',
        });
      }

      const establishmentId = req.j360EstablishmentId;
      if (!establishmentId) {
        return res.status(403).json({ success: false, message: 'Estabelecimento não resolvido.' });
      }

      try {
        const ext = safeExtension(req.file.originalname, contentType);
        const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
        const objectPath = `justino360/${establishmentId}/j360-${establishmentId}-${unique}.${ext}`;

        const uploaded = await firebaseStorage.uploadBuffer({
          objectPath,
          buffer: req.file.buffer,
          contentType: contentType || req.file.mimetype || 'application/octet-stream',
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
    },
    multerErrorHandler
  );

  return router;
};
