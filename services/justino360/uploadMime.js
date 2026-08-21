'use strict';

/**
 * Normaliza MIME de evidências Justino360.
 * Celulares (iOS/Android) costumam mandar type vazio, image/jpg ou octet-stream.
 */

const EXT_TO_MIME = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  heic: 'image/heic',
  heif: 'image/heif',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
  '3gp': 'video/3gpp',
  '3gpp': 'video/3gpp',
  pdf: 'application/pdf',
};

const ALLOWED = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
  'video/mp4',
  'video/quicktime',
  'video/webm',
  'video/3gpp',
  'application/pdf',
]);

function extensionOf(name) {
  const raw = String(name || '')
    .split('.')
    .pop();
  const ext = String(raw || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
  return /^[a-z0-9]{1,8}$/.test(ext) ? ext : '';
}

function normalizeMime(mimetype, originalname) {
  let mime = String(mimetype || '')
    .trim()
    .toLowerCase();

  if (mime === 'image/jpg') mime = 'image/jpeg';

  if (!mime || mime === 'application/octet-stream') {
    const ext = extensionOf(originalname);
    mime = EXT_TO_MIME[ext] || '';
  }

  return mime;
}

function isAllowedMime(mimetype, originalname) {
  const mime = normalizeMime(mimetype, originalname);
  return Boolean(mime && ALLOWED.has(mime));
}

module.exports = {
  EXT_TO_MIME,
  normalizeMime,
  isAllowedMime,
  extensionOf,
};
