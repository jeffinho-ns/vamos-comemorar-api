'use strict';

const establishmentRules = require('../establishmentRules');
const { resolveOrganizationIdForBar } = require('../menuOrganizationRepair');
const { deletePauseSchedulesForScope } = require('../menuPauseScheduleService');
const { emitMenuItemVisibilityChanged } = require('../../utils/menuRealtime');
const {
  resolvePauseUntil,
  parseMenuPrice,
  normalizeSealList,
  parseNameList,
} = require('./menuActionParsers');

const PLACEHOLDER = '[nova subcategoria]';

let pauseUntilReady = null;

async function resolveBarId(pool, establishmentId) {
  try {
    const rules = await establishmentRules.getEstablishmentRules(pool, establishmentId);
    const barId = establishmentRules.getCardapioBarId(rules, establishmentId);
    if (Number.isFinite(barId) && barId > 0) return barId;
  } catch (_) {
    /* usa o id operacional */
  }
  return Number(establishmentId);
}

async function ensurePauseUntilColumn(pool) {
  if (!pauseUntilReady) {
    pauseUntilReady = pool
      .query('ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS pause_until TIMESTAMPTZ NULL')
      .catch((error) => {
        pauseUntilReady = null;
        throw error;
      });
  }
  return pauseUntilReady;
}

async function releaseExpiredMenuPauses(pool) {
  try {
    await ensurePauseUntilColumn(pool);
    await pool.query(
      `UPDATE menu_items
          SET visible = TRUE, pause_until = NULL
        WHERE pause_until IS NOT NULL
          AND pause_until <= NOW()
          AND deleted_at IS NULL`,
    );
  } catch (error) {
    console.warn('[staffAgent] pausa com horário:', error.message);
  }
}

async function itemColumns(pool) {
  const result = await pool.query(
    "SELECT column_name FROM information_schema.columns WHERE table_name = 'menu_items'",
  );
  return new Set(result.rows.map((row) => row.column_name));
}

function formatPrice(price) {
  const amount = Number(price);
  if (amount === -1) return 'sob consulta';
  if (!Number.isFinite(amount)) return 'sem preço';
  return `R$ ${amount.toFixed(2).replace('.', ',')}`;
}

function formatUntil(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function emitVisibility(barId, establishmentId, items, visible) {
  for (const item of items.slice(0, 80)) {
    emitMenuItemVisibilityChanged({
      barId,
      establishmentId,
      itemId: item.id,
      name: item.name,
      visible,
    });
  }
}

async function findItem(pool, barId, itemId) {
  const result = await pool.query(
    `SELECT id, name, price, visible, categoryid, subcategory, imageurl, barid
       FROM menu_items
      WHERE id = $1 AND barid = $2 AND deleted_at IS NULL`,
    [itemId, barId],
  );
  return result.rows[0] || null;
}

async function findCategory(pool, barId, name) {
  const result = await pool.query(
    `SELECT id, name, "order"
       FROM menu_categories
      WHERE barid = $1 AND LOWER(TRIM(name)) = LOWER(TRIM($2))
      LIMIT 2`,
    [barId, name],
  );
  if (result.rows.length !== 1) return null;
  return result.rows[0];
}

async function listCategories(pool, barId) {
  const result = await pool.query(
    `SELECT id, name, "order"
       FROM menu_categories
      WHERE barid = $1
      ORDER BY "order", name`,
    [barId],
  );
  return result.rows;
}

function scopeLabel(categoryName, subcategoryName) {
  return subcategoryName ? `${categoryName} / ${subcategoryName}` : categoryName;
}

async function itemsInScope(pool, barId, categoryId, subcategoryName) {
  const params = [barId, categoryId];
  let subSql = '';
  if (subcategoryName) {
    params.push(subcategoryName);
    subSql = 'AND LOWER(TRIM(subcategory)) = LOWER(TRIM($3))';
  }
  const result = await pool.query(
    `SELECT id, name, subcategory
       FROM menu_items
      WHERE barid = $1
        AND categoryid = $2
        AND deleted_at IS NULL
        AND name NOT ILIKE '${PLACEHOLDER}%'
        ${subSql}
      ORDER BY name`,
    params,
  );
  return result.rows;
}

async function listPausedItems(pool, { establishmentId }) {
  await releaseExpiredMenuPauses(pool);
  const barId = await resolveBarId(pool, establishmentId);
  const result = await pool.query(
    `SELECT id, name, price, subcategory, pause_until
       FROM menu_items
      WHERE barid = $1
        AND deleted_at IS NULL
        AND name NOT ILIKE '${PLACEHOLDER}%'
        AND (COALESCE(visible, TRUE) = FALSE OR pause_until > NOW())
      ORDER BY name
      LIMIT 40`,
    [barId],
  );
  const lines = result.rows.map((item) => {
    const until = item.pause_until ? ` até ${formatUntil(item.pause_until)}` : '';
    return `#${item.id} ${item.name}${until}`;
  });
  return {
    ok: true,
    count: result.rows.length,
    items: result.rows,
    message: result.rows.length
      ? `Itens pausados (${result.rows.length}):\n${lines.join('\n')}`
      : 'Nenhum item pausado nesta casa.',
  };
}

async function listFeaturedItems(pool, { establishmentId }) {
  const barId = await resolveBarId(pool, establishmentId);
  const columns = await itemColumns(pool);
  if (!columns.has('featured')) {
    return { ok: false, message: 'Esta casa ainda não tem o campo de destaque no cardápio.' };
  }
  const result = await pool.query(
    `SELECT id, name, price, subcategory
       FROM menu_items
      WHERE barid = $1
        AND deleted_at IS NULL
        AND COALESCE(featured, FALSE) = TRUE
        AND name NOT ILIKE '${PLACEHOLDER}%'
      ORDER BY name
      LIMIT 40`,
    [barId],
  );
  const lines = result.rows.map((item) => `#${item.id} ${item.name} (${formatPrice(item.price)})`);
  return {
    ok: true,
    count: result.rows.length,
    items: result.rows,
    message: result.rows.length
      ? `Itens em destaque (${result.rows.length}):\n${lines.join('\n')}`
      : 'Nenhum item em destaque nesta casa.',
  };
}

async function setFeatured(pool, { establishmentId, args, mode }) {
  const barId = await resolveBarId(pool, establishmentId);
  const columns = await itemColumns(pool);
  if (!columns.has('featured')) {
    return { ok: false, message: 'Esta casa ainda não tem o campo de destaque no cardápio.' };
  }
  const item = await findItem(pool, barId, Number(args.item_id));
  if (!item) return { ok: false, message: 'Item não encontrado no cardápio desta casa.' };
  const featured = args.featured === false || args.featured === 'false' ? false : true;
  const preview = { item_id: item.id, name: item.name, featured };
  if (mode !== 'apply') {
    return {
      ok: true,
      needs_confirmation: true,
      preview,
      message: featured
        ? `Vou colocar "${item.name}" em destaque. Confirmar?`
        : `Vou tirar "${item.name}" dos destaques. Confirmar?`,
    };
  }
  await pool.query('UPDATE menu_items SET featured = $1 WHERE id = $2 AND barid = $3', [
    featured,
    item.id,
    barId,
  ]);
  return {
    ok: true,
    applied: true,
    preview,
    message: featured ? `"${item.name}" está em destaque.` : `"${item.name}" saiu dos destaques.`,
  };
}

async function setScopeVisibility(pool, { establishmentId, args, mode, visible }) {
  const barId = await resolveBarId(pool, establishmentId);
  const category = await findCategory(pool, barId, args.category_name);
  if (!category) {
    const names = (await listCategories(pool, barId)).map((row) => row.name);
    return {
      ok: false,
      message: names.length
        ? `Não achei a categoria "${args.category_name}". As categorias são: ${names.join(', ')}.`
        : 'Esta casa não tem categorias no cardápio.',
    };
  }
  const subcategoryName = String(args.subcategory_name || '').trim();
  const items = await itemsInScope(pool, barId, category.id, subcategoryName);
  if (!items.length) {
    return { ok: false, message: `Nenhum item em ${scopeLabel(category.name, subcategoryName)}.` };
  }
  const until = visible ? null : resolvePauseUntil(args);
  const label = scopeLabel(category.name, subcategoryName);
  const preview = {
    category_id: category.id,
    category_name: category.name,
    subcategory_name: subcategoryName || null,
    item_count: items.length,
    visible,
    until: until?.iso || null,
  };
  if (mode !== 'apply') {
    const when = until ? ` até ${formatUntil(until.iso)}` : '';
    return {
      ok: true,
      needs_confirmation: true,
      preview,
      message: visible
        ? `Vou reativar ${items.length} item(ns) de ${label}. Confirmar?`
        : `Vou pausar ${items.length} item(ns) de ${label}${when}. Confirmar?`,
    };
  }
  await ensurePauseUntilColumn(pool);
  const ids = items.map((item) => item.id);
  await pool.query(
    `UPDATE menu_items
        SET visible = $1, pause_until = $2
      WHERE id = ANY($3::int[]) AND barid = $4`,
    [visible, visible ? null : until?.iso || null, ids, barId],
  );
  if (visible) {
    await deletePauseSchedulesForScope(pool, {
      barId,
      categoryId: category.id,
      subCategoryName: subcategoryName || null,
    });
  }
  emitVisibility(barId, establishmentId, items, visible);
  return {
    ok: true,
    applied: true,
    preview,
    message: visible
      ? `${items.length} item(ns) de ${label} reativado(s).`
      : `${items.length} item(ns) de ${label} pausado(s).`,
  };
}

async function reorderCategories(pool, { establishmentId, args, mode }) {
  const barId = await resolveBarId(pool, establishmentId);
  const wanted = parseNameList(args.category_names);
  if (wanted.length < 2) {
    return { ok: false, message: 'Diga a nova ordem com pelo menos duas categorias.' };
  }
  const categories = await listCategories(pool, barId);
  const byName = new Map(categories.map((row) => [row.name.trim().toLowerCase(), row]));
  const ordered = [];
  const missing = [];
  for (const name of wanted) {
    const found = byName.get(name.toLowerCase());
    if (!found) missing.push(name);
    else ordered.push(found);
  }
  if (missing.length) {
    return {
      ok: false,
      message: `Não achei: ${missing.join(', ')}. Categorias: ${categories.map((row) => row.name).join(', ')}.`,
    };
  }
  const rest = categories.filter((row) => !ordered.some((item) => item.id === row.id));
  const finalOrder = [...ordered, ...rest];
  const preview = { names: finalOrder.map((row) => row.name) };
  if (mode !== 'apply') {
    return {
      ok: true,
      needs_confirmation: true,
      preview,
      message: `Vou deixar as categorias nesta ordem: ${preview.names.join(' → ')}. Confirmar?`,
    };
  }
  for (let index = 0; index < finalOrder.length; index += 1) {
    await pool.query('UPDATE menu_categories SET "order" = $1 WHERE id = $2 AND barid = $3', [
      index,
      finalOrder[index].id,
      barId,
    ]);
  }
  return { ok: true, applied: true, preview, message: 'Ordem das categorias atualizada.' };
}

async function reorderSubcategories(pool, { establishmentId, args, mode }) {
  const barId = await resolveBarId(pool, establishmentId);
  const category = await findCategory(pool, barId, args.category_name);
  if (!category) return { ok: false, message: `Não achei a categoria "${args.category_name}".` };
  const wanted = parseNameList(args.subcategory_names);
  if (wanted.length < 2) {
    return { ok: false, message: 'Diga a nova ordem com pelo menos duas subcategorias.' };
  }
  const columns = await itemColumns(pool);
  if (!columns.has('subcategory_order')) {
    return { ok: false, message: 'Esta base ainda não guarda a ordem das subcategorias.' };
  }
  const existing = await pool.query(
    `SELECT TRIM(subcategory) AS name
       FROM menu_items
      WHERE barid = $1 AND categoryid = $2 AND subcategory IS NOT NULL AND TRIM(subcategory) <> ''
      GROUP BY TRIM(subcategory)`,
    [barId, category.id],
  );
  const known = new Set(existing.rows.map((row) => row.name.toLowerCase()));
  const missing = wanted.filter((name) => !known.has(name.toLowerCase()));
  if (missing.length) {
    return {
      ok: false,
      message: `Não achei em ${category.name}: ${missing.join(', ')}.`,
    };
  }
  const preview = { category_name: category.name, names: wanted };
  if (mode !== 'apply') {
    return {
      ok: true,
      needs_confirmation: true,
      preview,
      message: `Vou deixar as subcategorias de ${category.name} nesta ordem: ${wanted.join(' → ')}. Confirmar?`,
    };
  }
  for (let index = 0; index < wanted.length; index += 1) {
    await pool.query(
      `UPDATE menu_items
          SET subcategory_order = $1
        WHERE barid = $2
          AND categoryid = $3
          AND LOWER(TRIM(subcategory)) = LOWER(TRIM($4))`,
      [index, barId, category.id, wanted[index]],
    );
  }
  return { ok: true, applied: true, preview, message: `Ordem das subcategorias de ${category.name} atualizada.` };
}

async function editItem(pool, { establishmentId, args, mode }) {
  const barId = await resolveBarId(pool, establishmentId);
  const item = await findItem(pool, barId, Number(args.item_id));
  if (!item) return { ok: false, message: 'Item não encontrado no cardápio desta casa.' };
  const columns = await itemColumns(pool);
  const changes = [];
  const sets = [];
  const values = [];

  if (args.price !== undefined && args.price !== null && args.price !== '') {
    const price = parseMenuPrice(args.price);
    if (price === null) return { ok: false, message: 'Não entendi o preço. Use algo como 32,90 ou sob consulta.' };
    values.push(price);
    sets.push(`price = $${values.length}`);
    changes.push(`preço para ${formatPrice(price)}`);
  }
  if (args.featured !== undefined && args.featured !== null && args.featured !== '') {
    if (!columns.has('featured')) {
      return { ok: false, message: 'Esta casa ainda não tem o campo de destaque.' };
    }
    const featured = args.featured === true || args.featured === 'true';
    values.push(featured);
    sets.push(`featured = $${values.length}`);
    changes.push(featured ? 'destaque ligado' : 'destaque desligado');
  }
  if (args.image_url) {
    values.push(String(args.image_url).trim());
    sets.push(`imageurl = $${values.length}`);
    changes.push('foto');
  }
  if (args.seals !== undefined && args.seals !== null && args.seals !== '') {
    if (!columns.has('seals')) return { ok: false, message: 'Esta casa ainda não tem selos no item.' };
    const seals = normalizeSealList(args.seals);
    if (!seals.ids.length) return { ok: false, message: 'Não reconheci o selo pedido.' };
    values.push(JSON.stringify(seals.ids));
    sets.push(`seals = $${values.length}`);
    changes.push(`selo ${seals.ids.join(', ')}`);
  }
  if (!sets.length) return { ok: false, message: 'Diga o que mudar: preço, destaque, foto ou selo.' };

  const preview = { item_id: item.id, name: item.name, changes };
  if (mode !== 'apply') {
    return {
      ok: true,
      needs_confirmation: true,
      preview,
      message: `Vou alterar "${item.name}": ${changes.join(', ')}. Confirmar?`,
    };
  }
  values.push(item.id, barId);
  await pool.query(
    `UPDATE menu_items SET ${sets.join(', ')} WHERE id = $${values.length - 1} AND barid = $${values.length}`,
    values,
  );
  return { ok: true, applied: true, preview, message: `"${item.name}" atualizado.` };
}

async function withMenuInsert(pool, barId, work) {
  const organizationId = await resolveOrganizationIdForBar(pool, barId);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (organizationId != null) {
      await client.query(`SELECT set_config('app.current_org', $1, true)`, [String(organizationId)]);
    } else {
      await client.query(`SELECT set_config('app.bypass_rls', 'on', true)`);
    }
    const created = await work(client, organizationId);
    await client.query('COMMIT');
    return created;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function createItem(pool, { establishmentId, args, mode }) {
  const barId = await resolveBarId(pool, establishmentId);
  const name = String(args.name || '').trim();
  const price = parseMenuPrice(args.price);
  const category = await findCategory(pool, barId, args.category_name);
  if (name.length < 2) return { ok: false, message: 'Qual é o nome do item?' };
  if (price === null) return { ok: false, message: 'Qual é o preço? Pode ser um valor ou sob consulta.' };
  if (!category) return { ok: false, message: `Não achei a categoria "${args.category_name || ''}".` };
  const subcategory = String(args.subcategory_name || '').trim() || null;
  const description = String(args.description || '').trim() || null;
  const preview = {
    name,
    price,
    category_name: category.name,
    subcategory_name: subcategory,
  };
  if (mode !== 'apply') {
    return {
      ok: true,
      needs_confirmation: true,
      preview,
      message: `Vou criar "${name}" em ${category.name}${subcategory ? ` / ${subcategory}` : ''}, ${formatPrice(price)}. Confirmar?`,
    };
  }
  const columns = await itemColumns(pool);
  const id = await withMenuInsert(pool, barId, async (client, organizationId) => {
    const orderResult = await client.query(
      'SELECT COALESCE(MAX("order"), 0) + 1 AS next_order FROM menu_items WHERE barid = $1 AND categoryid = $2',
      [barId, category.id],
    );
    const fields = ['name', 'description', 'price', 'categoryid', 'barid', 'subcategory', '"order"'];
    const values = [name, description, price, category.id, barId, subcategory, orderResult.rows[0].next_order];
    if (organizationId != null && columns.has('organization_id')) {
      fields.push('organization_id');
      values.push(organizationId);
    }
    const placeholders = values.map((_, index) => `$${index + 1}`);
    const inserted = await client.query(
      `INSERT INTO menu_items (${fields.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING id`,
      values,
    );
    return inserted.rows[0].id;
  });
  return { ok: true, applied: true, preview: { ...preview, item_id: id }, message: `"${name}" criado (#${id}).` };
}

async function deleteItem(pool, { establishmentId, args, mode }) {
  const barId = await resolveBarId(pool, establishmentId);
  const item = await findItem(pool, barId, Number(args.item_id));
  if (!item) return { ok: false, message: 'Item não encontrado no cardápio desta casa.' };
  const preview = { item_id: item.id, name: item.name };
  if (mode !== 'apply') {
    return {
      ok: true,
      needs_confirmation: true,
      preview,
      message: `Vou apagar "${item.name}" do cardápio. Ele vai para a lixeira. Confirmar?`,
    };
  }
  await pool.query(
    'UPDATE menu_items SET deleted_at = NOW(), visible = FALSE WHERE id = $1 AND barid = $2',
    [item.id, barId],
  );
  emitVisibility(barId, establishmentId, [item], false);
  return { ok: true, applied: true, preview, message: `"${item.name}" foi para a lixeira.` };
}

async function duplicateItem(pool, { establishmentId, args, mode }) {
  const barId = await resolveBarId(pool, establishmentId);
  const item = await findItem(pool, barId, Number(args.item_id));
  if (!item) return { ok: false, message: 'Item não encontrado no cardápio desta casa.' };
  const copyName = `${item.name} (cópia)`;
  const preview = { source_id: item.id, name: copyName };
  if (mode !== 'apply') {
    return {
      ok: true,
      needs_confirmation: true,
      preview,
      message: `Vou duplicar "${item.name}" como "${copyName}". Confirmar?`,
    };
  }
  const columns = await itemColumns(pool);
  const id = await withMenuInsert(pool, barId, async (client, organizationId) => {
    const fields = ['name', 'description', 'price', 'imageurl', 'categoryid', 'barid', 'subcategory', '"order"', 'visible'];
    const source = await client.query('SELECT * FROM menu_items WHERE id = $1', [item.id]);
    const row = source.rows[0];
    const values = [
      copyName,
      row.description,
      row.price,
      row.imageurl,
      row.categoryid,
      barId,
      row.subcategory,
      Number(row.order || 0) + 1,
      true,
    ];
    if (columns.has('seals')) {
      fields.push('seals');
      values.push(row.seals);
    }
    if (columns.has('featured')) {
      fields.push('featured');
      values.push(false);
    }
    if (organizationId != null && columns.has('organization_id')) {
      fields.push('organization_id');
      values.push(organizationId);
    }
    const placeholders = values.map((_, index) => `$${index + 1}`);
    const inserted = await client.query(
      `INSERT INTO menu_items (${fields.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING id`,
      values,
    );
    const newId = inserted.rows[0].id;
    try {
      await client.query(
        `INSERT INTO item_toppings (item_id, topping_id)
         SELECT $1, topping_id FROM item_toppings WHERE item_id = $2`,
        [newId, item.id],
      );
    } catch (error) {
      if (!/item_toppings/i.test(error.message)) throw error;
    }
    return newId;
  });
  return { ok: true, applied: true, preview: { ...preview, item_id: id }, message: `"${copyName}" criado (#${id}).` };
}

module.exports = {
  ensurePauseUntilColumn,
  releaseExpiredMenuPauses,
  resolvePauseUntil,
  listPausedItems,
  listFeaturedItems,
  setFeatured,
  setScopeVisibility,
  reorderCategories,
  reorderSubcategories,
  editItem,
  createItem,
  deleteItem,
  duplicateItem,
};
