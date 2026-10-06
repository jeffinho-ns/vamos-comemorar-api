'use strict';

const { resolveOrganizationIdForBar } = require('./menuOrganizationRepair');
const { buildMenuDiff } = require('./cardapioBackupDiff');

const MAX_BACKUPS = 20;
const SNAPSHOT_VERSION = 1;

function fail(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

async function withRlsBypass(pool, work) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SELECT set_config('app.bypass_rls', 'on', true)`);
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function columnsOf(db, table) {
  const result = await db.query(
    `SELECT column_name, data_type
       FROM information_schema.columns
      WHERE table_name = $1
        AND table_schema = ANY (current_schemas(false))`,
    [table],
  );
  const columns = new Map();
  for (const row of result.rows) columns.set(row.column_name, row.data_type);
  return columns;
}

function parseJsonArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string' || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_error) {
    return [];
  }
}

function itemSelectList(columns) {
  const parts = ['id', 'name', 'description', 'price'];
  if (columns.has('imageurl')) parts.push('imageurl AS "imageUrl"');
  if (columns.has('categoryid')) parts.push('categoryid AS "categoryId"');
  if (columns.has('subcategory')) parts.push('subcategory AS "subCategory"');
  if (columns.has('order')) parts.push('"order"');
  if (columns.has('visible')) parts.push('visible');
  if (columns.has('featured')) parts.push('featured');
  if (columns.has('seals')) parts.push('seals');
  if (columns.has('subcategory_order')) parts.push('subcategory_order AS "subcategoryOrder"');
  if (columns.has('deleted_at')) parts.push('deleted_at AS "deletedAt"');
  return parts.join(', ');
}

async function captureMenu(db, barId) {
  const itemColumns = await columnsOf(db, 'menu_items');
  const categories = await db.query(
    `SELECT id, name, "order"
       FROM menu_categories
      WHERE barid = $1
      ORDER BY "order", id`,
    [barId],
  );
  const items = await db.query(
    `SELECT ${itemSelectList(itemColumns)}
       FROM menu_items
      WHERE barid = $1
      ORDER BY id`,
    [barId],
  );
  const itemIds = items.rows.map((item) => Number(item.id));
  let toppingsByItem = new Map();
  if (itemIds.length) {
    const toppings = await db.query(
      `SELECT it.item_id, t.id, t.name, t.price
         FROM item_toppings it
         JOIN toppings t ON t.id = it.topping_id
        WHERE it.item_id = ANY($1::int[])`,
      [itemIds],
    );
    toppingsByItem = toppings.rows.reduce((map, row) => {
      const list = map.get(Number(row.item_id)) || [];
      list.push({
        id: Number(row.id),
        name: row.name,
        price: row.price == null ? 0 : Number(row.price),
      });
      return map.set(Number(row.item_id), list);
    }, new Map());
  }

  return {
    version: SNAPSHOT_VERSION,
    barId: Number(barId),
    capturedAt: new Date().toISOString(),
    categories: categories.rows.map((category) => ({
      id: Number(category.id),
      name: category.name,
      order: category.order == null ? 0 : Number(category.order),
    })),
    items: items.rows.map((item) => ({
      id: Number(item.id),
      name: item.name,
      description: item.description || '',
      price: item.price == null ? 0 : Number(item.price),
      imageUrl: item.imageUrl || '',
      categoryId: item.categoryId == null ? null : Number(item.categoryId),
      subCategory: item.subCategory || '',
      order: item.order == null ? 0 : Number(item.order),
      subcategoryOrder: item.subcategoryOrder == null ? null : Number(item.subcategoryOrder),
      visible: item.visible,
      featured: Boolean(item.featured),
      seals: parseJsonArray(item.seals),
      deletedAt: item.deletedAt ? new Date(item.deletedAt).toISOString() : null,
      toppings: toppingsByItem.get(Number(item.id)) || [],
    })),
  };
}

function liveItemCount(snapshot) {
  return (snapshot.items || []).filter((item) => !item.deletedAt).length;
}

function publicBackup(row) {
  return {
    id: Number(row.id),
    barId: Number(row.bar_id ?? row.barId),
    label: row.label,
    reason: row.reason,
    categoryCount: Number(row.category_count ?? row.categoryCount ?? 0),
    itemCount: Number(row.item_count ?? row.itemCount ?? 0),
    createdAt: row.created_at || row.createdAt,
    createdByName: row.created_by_name || row.createdByName || null,
  };
}

async function insertBackup(db, input) {
  const snapshot = input.snapshot;
  const inserted = await db.query(
    `INSERT INTO cardapio_backups
       (bar_id, organization_id, created_by, created_by_name, label, reason, snapshot, category_count, item_count)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9)
     RETURNING id, bar_id, label, reason, category_count, item_count, created_at, created_by_name`,
    [
      input.barId,
      input.organizationId,
      input.userId || null,
      input.userName || null,
      input.label,
      input.reason,
      JSON.stringify(snapshot),
      snapshot.categories.length,
      liveItemCount(snapshot),
    ],
  );
  return inserted.rows[0];
}

async function pruneBackups(db, barId) {
  await db.query(
    `DELETE FROM cardapio_backups
      WHERE bar_id = $1
        AND id NOT IN (
          SELECT id FROM cardapio_backups
           WHERE bar_id = $1
           ORDER BY created_at DESC
           LIMIT $2
        )`,
    [barId, MAX_BACKUPS],
  );
}

async function loadBackup(db, barId, backupId) {
  const result = await db.query(
    `SELECT id, bar_id, label, reason, category_count, item_count, created_at, created_by_name, snapshot
       FROM cardapio_backups
      WHERE id = $1 AND bar_id = $2`,
    [backupId, barId],
  );
  if (!result.rows.length) throw fail(404, 'Backup não encontrado para esta casa.');
  const row = result.rows[0];
  if (!row.snapshot || row.snapshot.version !== SNAPSHOT_VERSION) {
    throw fail(400, 'Este backup não pode ser lido.');
  }
  return row;
}

async function resetSequence(db, table) {
  if (!['menu_categories', 'menu_items', 'toppings'].includes(table)) return;
  const sequence = await db.query(`SELECT pg_get_serial_sequence($1, 'id') AS seq`, [`${table}`]);
  const name = sequence.rows[0]?.seq;
  const sequenceName = name || null;
  if (!sequenceName) {
    const qualified = await db.query(
      `SELECT pg_get_serial_sequence($1, 'id') AS seq`,
      [`meu_backup_db.${table}`],
    );
    if (!qualified.rows[0]?.seq) return;
    await db.query(
      `SELECT setval($1::regclass, GREATEST(COALESCE((SELECT MAX(id) FROM ${table}), 1), 1))`,
      [qualified.rows[0].seq],
    );
    return;
  }
  await db.query(
    `SELECT setval($1::regclass, GREATEST(COALESCE((SELECT MAX(id) FROM ${table}), 1), 1))`,
    [name],
  );
}

async function upsertCategory(db, barId, category, columns, organizationId) {
  const id = Number(category.id);
  const existing = await db.query('SELECT id, barid FROM menu_categories WHERE id = $1', [id]);
  if (existing.rows.length) {
    if (Number(existing.rows[0].barid) !== Number(barId)) {
      throw fail(409, 'Não foi possível restaurar uma categoria que já pertence a outra casa.');
    }
    await db.query(
      'UPDATE menu_categories SET name = $1, "order" = $2, barid = $3 WHERE id = $4',
      [category.name, category.order ?? 0, barId, id],
    );
    return;
  }
  const fields = ['id', 'barid', 'name', '"order"'];
  const values = [id, barId, category.name, category.order ?? 0];
  if (columns.has('organization_id') && organizationId) {
    fields.push('organization_id');
    values.push(organizationId);
  }
  const placeholders = values.map((_, index) => `$${index + 1}`).join(', ');
  await db.query(`INSERT INTO menu_categories (${fields.join(', ')}) VALUES (${placeholders})`, values);
}

function quoteColumn(column) {
  return column === 'order' ? '"order"' : column;
}

async function upsertItem(db, barId, item, columns, organizationId) {
  const id = Number(item.id);
  const assignments = [];
  const values = [];
  const push = (column, value, cast = '') => {
    if (!columns.has(column)) return;
    values.push(value);
    assignments.push(`${quoteColumn(column)} = $${values.length}${cast}`);
  };
  const sealsCast = columns.get('seals') === 'jsonb' ? '::jsonb' : '';
  push('name', item.name || '');
  push('description', item.description || null);
  push('price', item.price ?? 0);
  push('imageurl', item.imageUrl || null);
  push('categoryid', item.categoryId);
  push('barid', barId);
  push('subcategory', item.subCategory || null);
  push('order', item.order ?? 0);
  push('visible', item.visible == null ? true : item.visible);
  push('featured', Boolean(item.featured));
  push('seals', JSON.stringify(item.seals || []), sealsCast);
  push('subcategory_order', item.subcategoryOrder);
  push('deleted_at', item.deletedAt || null);
  if (columns.has('organization_id') && organizationId) push('organization_id', organizationId);

  const existing = await db.query('SELECT id, barid FROM menu_items WHERE id = $1', [id]);
  if (existing.rows.length) {
    if (Number(existing.rows[0].barid) !== Number(barId)) {
      throw fail(409, 'Não foi possível restaurar um item que já pertence a outra casa.');
    }
    values.push(id);
    await db.query(
      `UPDATE menu_items SET ${assignments.join(', ')} WHERE id = $${values.length}`,
      values,
    );
    return;
  }
  const insertColumns = ['id'];
  const insertValues = [id];
  assignments.forEach((assignment, index) => {
    const column = assignment.split(' = ')[0];
    insertColumns.push(column);
    insertValues.push(values[index]);
  });
  const explicit = insertColumns.map((column, index) => {
    if (column === 'seals' && sealsCast) return `$${index + 1}${sealsCast}`;
    return `$${index + 1}`;
  });
  await db.query(
    `INSERT INTO menu_items (${insertColumns.join(', ')}) VALUES (${explicit.join(', ')})`,
    insertValues,
  );
}

async function restoreToppings(db, item) {
  const itemId = Number(item.id);
  await db.query('DELETE FROM item_toppings WHERE item_id = $1', [itemId]);
  for (const topping of item.toppings || []) {
    const toppingId = Number(topping.id);
    if (!toppingId) continue;
    const found = await db.query('SELECT id FROM toppings WHERE id = $1', [toppingId]);
    if (!found.rows.length) {
      await db.query('INSERT INTO toppings (id, name, price) VALUES ($1, $2, $3)', [
        toppingId,
        topping.name || 'Complemento',
        topping.price || 0,
      ]);
    }
    await db.query('INSERT INTO item_toppings (item_id, topping_id) VALUES ($1, $2)', [
      itemId,
      toppingId,
    ]);
  }
}

async function removeRowsOutsideSnapshot(db, barId, snapshot) {
  const itemIds = (snapshot.items || []).map((item) => Number(item.id)).filter((id) => id > 0);
  const categoryIds = (snapshot.categories || []).map((category) => Number(category.id)).filter((id) => id > 0);
  if (itemIds.length) {
    await db.query(
      `DELETE FROM item_toppings
        WHERE item_id IN (
          SELECT id FROM menu_items WHERE barid = $1 AND NOT (id = ANY($2::int[]))
        )`,
      [barId, itemIds],
    );
    try {
      await db.query(
        `DELETE FROM menu_items WHERE barid = $1 AND NOT (id = ANY($2::int[]))`,
        [barId, itemIds],
      );
    } catch (error) {
      if (error.code !== '23503') throw error;
      await db.query(
        `UPDATE menu_items
            SET deleted_at = NOW()
          WHERE barid = $1 AND NOT (id = ANY($2::int[])) AND deleted_at IS NULL`,
        [barId, itemIds],
      );
    }
  } else {
    await db.query(
      `DELETE FROM item_toppings
        WHERE item_id IN (SELECT id FROM menu_items WHERE barid = $1)`,
      [barId],
    );
    await db.query('DELETE FROM menu_items WHERE barid = $1', [barId]);
  }
  if (categoryIds.length) {
    await db.query(
      `DELETE FROM menu_categories c
        WHERE c.barid = $1
          AND NOT (c.id = ANY($2::int[]))
          AND NOT EXISTS (SELECT 1 FROM menu_items mi WHERE mi.categoryid = c.id)`,
      [barId, categoryIds],
    );
  }
}

async function applySnapshot(db, barId, snapshot, organizationId) {
  if (!snapshot || snapshot.version !== SNAPSHOT_VERSION || !Array.isArray(snapshot.categories)) {
    throw fail(400, 'Backup inválido.');
  }
  const categoryColumns = await columnsOf(db, 'menu_categories');
  const itemColumns = await columnsOf(db, 'menu_items');
  for (const category of snapshot.categories) {
    await upsertCategory(db, barId, category, categoryColumns, organizationId);
  }
  for (const item of snapshot.items || []) {
    if (!item.categoryId) continue;
    await upsertItem(db, barId, item, itemColumns, organizationId);
    await restoreToppings(db, item);
  }
  await removeRowsOutsideSnapshot(db, barId, snapshot);
  await resetSequence(db, 'menu_categories');
  await resetSequence(db, 'menu_items');
  await resetSequence(db, 'toppings');
}

function cleanLabel(label, fallback) {
  const text = String(label || fallback || 'Backup de segurança').replace(/\s+/g, ' ').trim();
  return (text || 'Backup de segurança').slice(0, 120);
}

async function createMenuBackup(pool, input) {
  return withRlsBypass(pool, async (db) => {
    const organizationId = await resolveOrganizationIdForBar(db, input.barId);
    const snapshot = await captureMenu(db, input.barId);
    const row = await insertBackup(db, {
      barId: input.barId,
      organizationId,
      userId: input.userId,
      userName: input.userName,
      label: cleanLabel(input.label, 'Backup de segurança'),
      reason: 'manual',
      snapshot,
    });
    await pruneBackups(db, input.barId);
    return publicBackup(row);
  });
}

async function listMenuBackups(pool, barId) {
  return withRlsBypass(pool, async (db) => {
    const result = await db.query(
      `SELECT id, bar_id, label, reason, category_count, item_count, created_at, created_by_name
         FROM cardapio_backups
        WHERE bar_id = $1
        ORDER BY created_at DESC
        LIMIT $2`,
      [barId, MAX_BACKUPS],
    );
    return result.rows.map(publicBackup);
  });
}

async function diffMenuBackup(pool, barId, backupId) {
  return withRlsBypass(pool, async (db) => {
    const backup = await loadBackup(db, barId, backupId);
    const current = await captureMenu(db, barId);
    return { backup: publicBackup(backup), diff: buildMenuDiff(backup.snapshot, current) };
  });
}

async function restoreMenuBackup(pool, input) {
  return withRlsBypass(pool, async (db) => {
    const backup = await loadBackup(db, input.barId, input.backupId);
    const current = await captureMenu(db, input.barId);
    const diff = buildMenuDiff(backup.snapshot, current);
    const organizationId = await resolveOrganizationIdForBar(db, input.barId);
    const safety = await insertBackup(db, {
      barId: input.barId,
      organizationId,
      userId: input.userId,
      userName: input.userName,
      label: cleanLabel('', `Antes de restaurar o backup #${backup.id}`),
      reason: 'pre_restore',
      snapshot: current,
    });
    await applySnapshot(db, input.barId, backup.snapshot, organizationId);
    await pruneBackups(db, input.barId);
    return {
      backup: publicBackup(backup),
      safetyBackup: publicBackup(safety),
      diff,
    };
  });
}

module.exports = {
  createMenuBackup,
  listMenuBackups,
  diffMenuBackup,
  restoreMenuBackup,
  fail,
};
