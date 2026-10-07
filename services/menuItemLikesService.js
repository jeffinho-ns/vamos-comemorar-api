'use strict';

const VISITOR_KEY_PATTERN = /^[A-Za-z0-9-]{16,80}$/;
const MAX_SYNC_ITEMS = 300;

let ensured = null;

function fail(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function normalizeVisitorKey(value) {
  const key = String(value ?? '').trim();
  if (!VISITOR_KEY_PATTERN.test(key)) return null;
  return key;
}

function parsePositiveInt(value) {
  const text = String(value ?? '').trim();
  if (!/^\d+$/.test(text)) return null;
  const parsed = Number(text);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

function parseItemIds(value) {
  const source = Array.isArray(value) ? value : [];
  const unique = [];
  const seen = new Set();
  for (const entry of source) {
    const id = parsePositiveInt(entry);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    unique.push(id);
    if (unique.length >= MAX_SYNC_ITEMS) break;
  }
  return unique;
}

function ensureMenuItemLikesTable(pool) {
  if (!ensured) {
    ensured = (async () => {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS menu_item_likes (
          id BIGSERIAL PRIMARY KEY,
          item_id INTEGER NOT NULL,
          bar_id INTEGER NOT NULL,
          visitor_key TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          CONSTRAINT menu_item_likes_item_visitor_unique UNIQUE (item_id, visitor_key)
        )
      `);
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_menu_item_likes_bar_id
          ON menu_item_likes (bar_id)
      `);
    })().catch((error) => {
      ensured = null;
      throw error;
    });
  }
  return ensured;
}

function countsFromRows(rows) {
  const counts = {};
  for (const row of rows) {
    counts[String(row.item_id)] = Number(row.count) || 0;
  }
  return counts;
}

async function listMenuItemLikes(pool, { barId, visitorKey }) {
  const parsedBarId = parsePositiveInt(barId);
  if (!parsedBarId) throw fail(400, 'Estabelecimento inválido.');
  const parsedVisitorKey = visitorKey ? normalizeVisitorKey(visitorKey) : null;
  if (visitorKey && !parsedVisitorKey) throw fail(400, 'Identificador de visitante inválido.');

  await ensureMenuItemLikesTable(pool);

  const countsResult = await pool.query(
    `SELECT item_id, COUNT(*)::int AS count
       FROM menu_item_likes
      WHERE bar_id = $1
      GROUP BY item_id`,
    [parsedBarId],
  );

  let liked = [];
  if (parsedVisitorKey) {
    const likedResult = await pool.query(
      `SELECT item_id
         FROM menu_item_likes
        WHERE bar_id = $1 AND visitor_key = $2`,
      [parsedBarId, parsedVisitorKey],
    );
    liked = likedResult.rows.map((row) => String(row.item_id));
  }

  return { counts: countsFromRows(countsResult.rows), liked };
}

async function findPublicMenuItem(pool, itemId) {
  const result = await pool.query(
    `SELECT id, barid
       FROM menu_items
      WHERE id = $1 AND deleted_at IS NULL`,
    [itemId],
  );
  return result.rows[0] || null;
}

async function readItemLikeState(pool, itemId, visitorKey) {
  const countResult = await pool.query(
    'SELECT COUNT(*)::int AS count FROM menu_item_likes WHERE item_id = $1',
    [itemId],
  );
  const likedResult = await pool.query(
    'SELECT 1 FROM menu_item_likes WHERE item_id = $1 AND visitor_key = $2',
    [itemId, visitorKey],
  );
  return {
    itemId,
    liked: likedResult.rows.length > 0,
    count: Number(countResult.rows[0]?.count) || 0,
  };
}

async function setMenuItemLike(pool, { itemId, visitorKey, liked }) {
  const parsedItemId = parsePositiveInt(itemId);
  const parsedVisitorKey = normalizeVisitorKey(visitorKey);
  if (!parsedItemId) throw fail(400, 'Item inválido.');
  if (!parsedVisitorKey) throw fail(400, 'Identificador de visitante inválido.');
  if (typeof liked !== 'boolean') throw fail(400, 'Informe se o item deve ficar curtido.');

  await ensureMenuItemLikesTable(pool);
  const item = await findPublicMenuItem(pool, parsedItemId);
  if (!item) throw fail(404, 'Item não encontrado.');

  if (liked) {
    await pool.query(
      `INSERT INTO menu_item_likes (item_id, bar_id, visitor_key)
       VALUES ($1, $2, $3)
       ON CONFLICT (item_id, visitor_key) DO NOTHING`,
      [parsedItemId, item.barid, parsedVisitorKey],
    );
  } else {
    await pool.query(
      'DELETE FROM menu_item_likes WHERE item_id = $1 AND visitor_key = $2',
      [parsedItemId, parsedVisitorKey],
    );
  }

  return readItemLikeState(pool, parsedItemId, parsedVisitorKey);
}

async function syncMenuItemLikes(pool, { barId, visitorKey, itemIds }) {
  const parsedBarId = parsePositiveInt(barId);
  const parsedVisitorKey = normalizeVisitorKey(visitorKey);
  if (!parsedBarId) throw fail(400, 'Estabelecimento inválido.');
  if (!parsedVisitorKey) throw fail(400, 'Identificador de visitante inválido.');

  const ids = parseItemIds(itemIds);
  await ensureMenuItemLikesTable(pool);

  if (ids.length > 0) {
    const items = await pool.query(
      `SELECT id
         FROM menu_items
        WHERE barid = $1
          AND id = ANY($2::int[])
          AND deleted_at IS NULL`,
      [parsedBarId, ids],
    );
    for (const row of items.rows) {
      await pool.query(
        `INSERT INTO menu_item_likes (item_id, bar_id, visitor_key)
         VALUES ($1, $2, $3)
         ON CONFLICT (item_id, visitor_key) DO NOTHING`,
        [row.id, parsedBarId, parsedVisitorKey],
      );
    }
  }

  return listMenuItemLikes(pool, { barId: parsedBarId, visitorKey: parsedVisitorKey });
}

module.exports = {
  normalizeVisitorKey,
  parseItemIds,
  ensureMenuItemLikesTable,
  listMenuItemLikes,
  setMenuItemLike,
  syncMenuItemLikes,
};
