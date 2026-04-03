/**
 * Firebase Storage (Admin SDK) - Armazenamento de Imagens
 *
 * Este serviço faz upload e deleção de arquivos no Firebase Storage usando service account.
 * Ideal para rodar no backend (Render) sem depender de Auth do client.
 *
 * Env suportadas (prioridade: variáveis individuais):
 * 1) FIREBASE_ADMIN_PROJECT_ID
 * 2) FIREBASE_ADMIN_CLIENT_EMAIL
 * 3) FIREBASE_ADMIN_PRIVATE_KEY (pode vir com quebras literais ou com \\n escapado)
 *
 * Fallback (plano B):
 * - FIREBASE_ADMIN_CREDENTIALS_JSON_BASE64: base64 do JSON do service account
 *
 * E:
 * - FIREBASE_STORAGE_BUCKET (ex: agiliza iapp-img.firebasestorage.app)
 */

const crypto = require('crypto');
const admin = require('firebase-admin');

let app = null;

function requiredEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Env ausente: ${name}`);
  return v;
}

function normalizePrivateKey(value) {
  if (!value) return value;
  let v = String(value).trim();
  // Remover aspas comuns (Render/CI às vezes injeta com quotes)
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    v = v.slice(1, -1);
  }
  // Tratar "\\n" escapado
  return v.replace(/\\n/g, '\n');
}

function init() {
  if (app) return app;

  const bucket = requiredEnv('FIREBASE_STORAGE_BUCKET');

  let credential;
  const hasIndividualCreds =
    !!process.env.FIREBASE_ADMIN_PROJECT_ID &&
    !!process.env.FIREBASE_ADMIN_CLIENT_EMAIL &&
    !!process.env.FIREBASE_ADMIN_PRIVATE_KEY;

  if (hasIndividualCreds) {
    const projectId = requiredEnv('FIREBASE_ADMIN_PROJECT_ID');
    const clientEmail = requiredEnv('FIREBASE_ADMIN_CLIENT_EMAIL');
    const privateKey = normalizePrivateKey(requiredEnv('FIREBASE_ADMIN_PRIVATE_KEY'));
    credential = admin.credential.cert({ projectId, clientEmail, privateKey });
  } else if (process.env.FIREBASE_ADMIN_CREDENTIALS_JSON_BASE64) {
    const json = Buffer.from(process.env.FIREBASE_ADMIN_CREDENTIALS_JSON_BASE64, 'base64').toString('utf8');
    credential = admin.credential.cert(JSON.parse(json));
  } else {
    throw new Error(
      'Credenciais do Firebase Admin não configuradas. Informe FIREBASE_ADMIN_PROJECT_ID, FIREBASE_ADMIN_CLIENT_EMAIL e FIREBASE_ADMIN_PRIVATE_KEY (recomendado) ou FIREBASE_ADMIN_CREDENTIALS_JSON_BASE64 (fallback).',
    );
  }

  if (admin.apps && admin.apps.length) {
    app = admin.app();
  } else {
    app = admin.initializeApp({
      credential,
      storageBucket: bucket,
    });
  }

  return app;
}

function getBucket() {
  init();
  return admin.storage().bucket();
}

function getBucketName() {
  const b = getBucket();
  return b?.name;
}

function generateDownloadToken() {
  return crypto.randomUUID();
}

function buildDownloadUrl(bucketName, objectPath, token) {
  const encodedPath = encodeURIComponent(objectPath);
  return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodedPath}?alt=media&token=${token}`;
}

function extractObjectPathFromFirebaseUrl(url) {
  if (!url || typeof url !== 'string') return null;
  if (!url.includes('firebasestorage.googleapis.com')) return null;
  const match = url.match(/\/o\/([^?]+)(?:\?|$)/);
  if (!match || !match[1]) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

async function uploadBuffer({ objectPath, buffer, contentType }) {
  const bucket = getBucket();
  const bucketName = bucket.name;

  const token = generateDownloadToken();

  const file = bucket.file(objectPath);
  await file.save(buffer, {
    resumable: false,
    metadata: {
      contentType: contentType || undefined,
      // Como o nome do arquivo é aleatório (nanoid) e efetivamente imutável,
      // podemos aplicar cache forte para reduzir egress por repetição de downloads.
      cacheControl: 'public, max-age=31536000, immutable',
      metadata: {
        firebaseStorageDownloadTokens: token,
      },
    },
  });

  return {
    objectPath,
    url: buildDownloadUrl(bucketName, objectPath, token),
  };
}

async function deleteObject(objectPath) {
  const bucket = getBucket();
  await bucket.file(objectPath).delete({ ignoreNotFound: true });
}

async function deleteByUrlOrPath(value) {
  const objectPath = extractObjectPathFromFirebaseUrl(value) || value;
  if (!objectPath || typeof objectPath !== 'string') return;
  await deleteObject(objectPath);
}

/**
 * Lista object paths sob cardapio/items/ (galeria de itens do cardápio).
 * Omite variantes _medium e _thumb do padrão nanoid (evita 3 cards por imagem).
 */
async function listCardapioItemObjectPaths(options = {}) {
  const maxTotal = Math.min(Math.max(options.maxResults || 5000, 1), 10000);
  const bucket = getBucket();
  const prefix = 'cardapio/items/';
  const paths = [];
  let query = {
    prefix,
    maxResults: Math.min(1000, maxTotal),
    autoPaginate: false,
  };

  while (paths.length < maxTotal) {
    const [files, nextQuery] = await bucket.getFiles(query);
    for (const f of files) {
      if (paths.length >= maxTotal) break;
      const name = f.name;
      if (!name || name.endsWith('/')) continue;
      const base = name.startsWith(prefix) ? name.slice(prefix.length) : name;
      if (/^[A-Za-z0-9]{10}_(medium|thumb)\.webp$/i.test(base)) continue;
      paths.push(name);
    }
    if (!nextQuery || !nextQuery.pageToken) break;
    query = {
      ...query,
      pageToken: nextQuery.pageToken,
      maxResults: Math.min(1000, maxTotal - paths.length),
    };
  }

  return paths;
}

module.exports = {
  extractObjectPathFromFirebaseUrl,
  uploadBuffer,
  deleteByUrlOrPath,
  getBucket,
  getBucketName,
  listCardapioItemObjectPaths,
};


