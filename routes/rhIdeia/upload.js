'use strict';

/**
 * Upload de evidências Ideia RH via Firebase Storage
 * Path: rh-ideia/{organizationId}/...
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
        return res.status(400).json({
          success: false,
          message: 'Tipo de arquivo não permitido. Use foto (JPG/PNG/WEBP) ou PDF.',
        });
      }

      const organizationId = req.iriOrganizationId;
      if (!organizationId) {
        return res.status(403).json({ success: false, message: 'Organização não resolvida.' });
      }

      try {
        const ext = safeExtension(req.file.originalname, contentType);
        const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
        const objectPath = `rh-ideia/${organizationId}/iri-${organizationId}-${unique}.${ext}`;

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
          `[iri] upload firebase organization_id=${organizationId} user=${req.user?.id || 'anon'}: ${err.message}`
        );
        return res.status(500).json({ success: false, message: 'Falha ao enviar arquivo.' });
      }
    },
    multerErrorHandler
  );

  return router;
};
