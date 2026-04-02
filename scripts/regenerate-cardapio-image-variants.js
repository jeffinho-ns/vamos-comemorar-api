#!/usr/bin/env node
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

/**
 * Gera variantes _full / _medium / _thumb (WebP) para imagens legadas no Firebase Storage
 * e atualiza referências em menu_items, cardapio_images e bars.
 *
 * Uso:
 *   node scripts/regenerate-cardapio-image-variants.js --dry-run
 *   node scripts/regenerate-cardapio-image-variants.js --limit=20
 *   PUBLIC_API_BASE_URL=https://api.agilizaiapp.com.br node scripts/regenerate-cardapio-image-variants.js
 *
 * Requer: DATABASE_URL, credenciais Firebase Admin, FIREBASE_STORAGE_BUCKET (mesmo server.js).
 */

const { customAlphabet } = require('nanoid');
const sharp = require('sharp');
const pool = require('../config/database');
const firebaseStorage = require('../services/firebaseStorageAdminService');

const nanoid = customAlphabet('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', 10);

const API_BASE = (process.env.PUBLIC_API_BASE_URL || 'https://api.agilizaiapp.com.br').replace(/\/+$/, '');

const BAR_IMAGE_FIELDS = new Set(['logourl', 'coverimageurl', 'popupimageurl']);

function parseArgs() {
  const dryRun = process.argv.includes('--dry-run');
  let limit = null;
  const limArg = process.argv.find((a) => a.startsWith('--limit='));
  if (limArg) {
    const n = parseInt(limArg.split('=')[1], 10);
    if (Number.isFinite(n) && n > 0) limit = n;
  }
  return { dryRun, limit };
}

function proxyUrlForObjectPath(objectPath) {
  return `${API_BASE}/public/images/${encodeURIComponent(objectPath)}`;
}

function normalizeToObjectPath(value) {
  if (!value || typeof value !== 'string') return null;
  const s = value.trim();
  if (!s || s === 'null') return null;

  const fb = firebaseStorage.extractObjectPathFromFirebaseUrl(s);
  if (fb) return fb;

  const pub = s.match(/\/public\/images\/([^?]+)/);
  if (pub) {
    try {
      return decodeURIComponent(pub[1]);
    } catch {
      return pub[1];
    }
  }

  if (!/^https?:\/\//i.test(s)) {
    return s.replace(/^\/+/, '');
  }

  const last = s.split('/').pop()?.split('?')[0];
  return last || null;
}

function isAlreadyVariantSet(path) {
  return typeof path === 'string' && path.endsWith('_full.webp');
}

function shouldSkipPath(path) {
  if (!path) return true;
  if (isAlreadyVariantSet(path)) return true;
  if (path.endsWith('_thumb.webp') || path.endsWith('_medium.webp')) return true;
  return false;
}

function buildVariantPaths({ folder, baseId, extension }) {
  const objectBase = `${folder}/${baseId}`;
  if (extension === '.gif') {
    return { full: `${objectBase}${extension}`, medium: null, thumb: null };
  }
  return {
    full: `${objectBase}_full${extension}`,
    medium: `${objectBase}_medium${extension}`,
    thumb: `${objectBase}_thumb${extension}`,
  };
}

async function optimizeBuffer(buffer, contentType) {
  if (contentType === 'image/gif') {
    return {
      buffer,
      contentType: 'image/gif',
      extension: '.gif',
      optimized: false,
    };
  }

  const out = await sharp(buffer, { failOnError: false })
    .rotate()
    .resize({ width: 2000, height: 2000, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 80, effort: 4 })
    .toBuffer();

  return {
    buffer: out,
    contentType: 'image/webp',
    extension: '.webp',
    optimized: true,
  };
}

async function generateVariants({ buffer, extension, contentType }) {
  if (extension === '.gif') {
    return {
      full: { buffer, contentType, extension },
      medium: null,
      thumb: null,
    };
  }

  const thumbBuffer = await sharp(buffer, { failOnError: false })
    .resize({ width: 300, height: 300, fit: 'inside', withoutEnlargement: true })
    .toBuffer();

  const mediumBuffer = await sharp(buffer, { failOnError: false })
    .resize({ width: 800, height: 800, fit: 'inside', withoutEnlargement: true })
    .toBuffer();

  return {
    full: { buffer, contentType, extension },
    medium: { buffer: mediumBuffer, contentType, extension },
    thumb: { buffer: thumbBuffer, contentType, extension },
  };
}

async function migrateOneObjectPath(objectPath, { dryRun }) {
  const bucket = firebaseStorage.getBucket();
  const file = bucket.file(objectPath);
  const [exists] = await file.exists();
  if (!exists) {
    return { ok: false, reason: 'not_in_bucket', objectPath };
  }

  const [metadata] = await file.getMetadata();
  const contentType = metadata.contentType || 'application/octet-stream';

  if (contentType === 'image/gif') {
    return { ok: false, reason: 'skip_gif', objectPath };
  }

  let buf;
  try {
    const d = await file.download();
    buf = d[0];
  } catch (e) {
    return { ok: false, reason: `download: ${e.message}`, objectPath };
  }

  let processed;
  let variants;
  try {
    processed = await optimizeBuffer(buf, contentType);
    variants = await generateVariants({
      buffer: processed.buffer,
      extension: processed.extension,
      contentType: processed.contentType,
    });
  } catch (e) {
    return { ok: false, reason: `sharp: ${e.message}`, objectPath };
  }

  const parts = objectPath.split('/');
  const folder = parts.length > 1 ? parts.slice(0, -1).join('/') : 'cardapio-agilizaiapp';
  const baseId = nanoid();
  const paths = buildVariantPaths({ folder, baseId, extension: processed.extension });

  if (dryRun) {
    return {
      ok: true,
      dryRun: true,
      objectPath,
      newFull: paths.full,
    };
  }

  await firebaseStorage.uploadBuffer({
    objectPath: paths.full,
    buffer: variants.full.buffer,
    contentType: variants.full.contentType,
  });

  if (paths.medium && variants.medium) {
    await firebaseStorage.uploadBuffer({
      objectPath: paths.medium,
      buffer: variants.medium.buffer,
      contentType: variants.medium.contentType,
    });
  }

  if (paths.thumb && variants.thumb) {
    await firebaseStorage.uploadBuffer({
      objectPath: paths.thumb,
      buffer: variants.thumb.buffer,
      contentType: variants.thumb.contentType,
    });
  }

  return { ok: true, objectPath, newFull: paths.full };
}

async function main() {
  const { dryRun, limit } = parseArgs();
  console.log(`API_BASE=${API_BASE} dryRun=${dryRun} limit=${limit ?? '∞'}`);

  /** @type {Map<string, { menuIds: Set<number>, cardapioIds: Set<number>, bars: Array<{ id: number, field: string }> }>} */
  const byPath = new Map();

  function addPath(p, ref) {
    if (!p || shouldSkipPath(p)) return;
    if (!byPath.has(p)) {
      byPath.set(p, { menuIds: new Set(), cardapioIds: new Set(), bars: [] });
    }
    const b = byPath.get(p);
    if (ref.type === 'menu') b.menuIds.add(ref.id);
    if (ref.type === 'cardapio') b.cardapioIds.add(ref.id);
    if (ref.type === 'bar') b.bars.push({ id: ref.id, field: ref.field });
  }

  const miRes = await pool.query(`
    SELECT id, imageurl
    FROM menu_items
    WHERE deleted_at IS NULL
      AND imageurl IS NOT NULL
      AND trim(imageurl) NOT IN ('', 'null')
  `);
  for (const row of miRes.rows) {
    const p = normalizeToObjectPath(row.imageurl);
    if (p) addPath(p, { type: 'menu', id: row.id });
  }

  let ciRes = { rows: [] };
  try {
    ciRes = await pool.query(`SELECT id, filename, url FROM cardapio_images`);
  } catch (e) {
    console.warn('cardapio_images:', e.message);
  }
  for (const row of ciRes.rows) {
    const p = normalizeToObjectPath(row.filename) || normalizeToObjectPath(row.url);
    if (p) addPath(p, { type: 'cardapio', id: row.id });
  }

  const barsRes = await pool.query(`
    SELECT id, logourl, coverimageurl, popupimageurl FROM bars
  `);
  for (const row of barsRes.rows) {
    for (const field of ['logourl', 'coverimageurl', 'popupimageurl']) {
      const p = normalizeToObjectPath(row[field]);
      if (p) addPath(p, { type: 'bar', id: row.id, field });
    }
  }

  const toProcess = [...byPath.entries()].filter(([p]) => !shouldSkipPath(p));
  console.log(`Referências únicas (legado, sem _full.webp): ${toProcess.length}`);

  let done = 0;
  let skipped = 0;
  let failed = 0;

  for (const [objectPath, refs] of toProcess) {
    if (limit != null && done >= limit) break;

    const result = await migrateOneObjectPath(objectPath, { dryRun });
    if (!result.ok) {
      if (result.reason === 'skip_gif') {
        skipped += 1;
        console.log(`⏭️  GIF ignorado: ${objectPath}`);
      } else {
        failed += 1;
        console.warn(`❌ ${objectPath}: ${result.reason}`);
      }
      continue;
    }

    const newFull = result.newFull;
    console.log(`${dryRun ? '🔍' : '✅'} ${objectPath} → ${newFull}`);

    if (!dryRun) {
      const idsMenu = [...refs.menuIds];
      for (const id of idsMenu) {
        await pool.query(`UPDATE menu_items SET imageurl = $1 WHERE id = $2`, [newFull, id]);
      }

      const idsCard = [...refs.cardapioIds];
      const newUrl = proxyUrlForObjectPath(newFull);
      for (const id of idsCard) {
        await pool.query(`UPDATE cardapio_images SET filename = $1, url = $2 WHERE id = $3`, [
          newFull,
          newUrl,
          id,
        ]);
      }

      for (const { id, field } of refs.bars) {
        if (!BAR_IMAGE_FIELDS.has(field)) continue;
        await pool.query(`UPDATE bars SET ${field} = $1 WHERE id = $2`, [newFull, id]);
      }
    }

    done += 1;
  }

  console.log(`\nResumo: processadas/marcadas=${done} ignoradas=${skipped} falhas=${failed}`);
  process.exitCode = failed > 0 && done === 0 ? 1 : 0;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() =>
    pool.end().finally(() => {
      process.exit(process.exitCode ?? 0);
    }),
  );
