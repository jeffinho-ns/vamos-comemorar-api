'use strict';

const multer = require('multer');

/** Teto alinhado ao Apps Script (~8 MB decodificado). */
const MAX_BYTES = 8 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES, files: 1 },
});

/**
 * Converte o arquivo do multer no payload base64 que o Apps Script espera
 * (`uploadAuditoriaOpEvidencia_` / `uploadDocumentacaoFile_`).
 */
function deArquivo(file) {
  if (!file || !file.buffer || !file.buffer.length) return { erro: 'arquivo_obrigatorio' };
  if (file.buffer.length > MAX_BYTES) return { erro: 'arquivo_grande_demais' };
  const nome = String(file.originalname || 'arquivo').replace(/[\\/]/g, '-').slice(0, 180) || 'arquivo';
  return {
    fileBase64: file.buffer.toString('base64'),
    fileName: nome,
    mimeType: String(file.mimetype || 'application/octet-stream').slice(0, 80),
  };
}

function middleware() {
  return upload.single('file');
}

function erroMulter(err, req, res, next) {
  if (!err) return next();
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ ok: false, error: 'arquivo_grande_demais' });
  }
  return res.status(400).json({ ok: false, error: 'arquivo_invalido' });
}

module.exports = {
  MAX_BYTES,
  deArquivo,
  middleware,
  erroMulter,
};
