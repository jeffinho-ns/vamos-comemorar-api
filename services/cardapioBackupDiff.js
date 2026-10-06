'use strict';

const FIELD_LABELS = {
  name: 'Nome',
  price: 'Preço',
  description: 'Descrição',
  categoryId: 'Categoria',
  subCategory: 'Subcategoria',
  order: 'Ordem',
  visible: 'Visibilidade',
  featured: 'Destaque',
  imageUrl: 'Foto',
  toppings: 'Complementos',
};

function asText(value) {
  if (value == null) return '';
  return String(value).trim();
}

function asNumber(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function isLive(item) {
  return !item.deletedAt;
}

function visibleFlag(value) {
  if (value == null) return true;
  if (value === false || value === 0 || value === '0') return false;
  return true;
}

function toppingSignature(toppings) {
  return (Array.isArray(toppings) ? toppings : [])
    .map((topping) => `${asText(topping.name).toLowerCase()}|${Number(topping.price || 0).toFixed(2)}`)
    .sort()
    .join(';');
}

function categoryName(categories, categoryId) {
  const found = (categories || []).find((category) => Number(category.id) === Number(categoryId));
  return found ? found.name : '';
}

function itemChanges(before, after, categories) {
  const changes = [];
  if (asText(before.name) !== asText(after.name)) {
    changes.push({ field: 'name', label: FIELD_LABELS.name, from: before.name, to: after.name });
  }
  if (asNumber(before.price) !== asNumber(after.price)) {
    changes.push({ field: 'price', label: FIELD_LABELS.price, from: before.price, to: after.price });
  }
  if (asText(before.description) !== asText(after.description)) {
    changes.push({ field: 'description', label: FIELD_LABELS.description, from: 'alterada', to: 'alterada' });
  }
  if (Number(before.categoryId) !== Number(after.categoryId)) {
    changes.push({
      field: 'categoryId',
      label: FIELD_LABELS.categoryId,
      from: categoryName(categories, before.categoryId) || before.categoryId,
      to: categoryName(categories, after.categoryId) || after.categoryId,
    });
  }
  if (asText(before.subCategory) !== asText(after.subCategory)) {
    changes.push({
      field: 'subCategory',
      label: FIELD_LABELS.subCategory,
      from: before.subCategory || '',
      to: after.subCategory || '',
    });
  }
  if (asNumber(before.order) !== asNumber(after.order)) {
    changes.push({ field: 'order', label: FIELD_LABELS.order, from: before.order, to: after.order });
  }
  if (visibleFlag(before.visible) !== visibleFlag(after.visible)) {
    changes.push({
      field: 'visible',
      label: FIELD_LABELS.visible,
      from: visibleFlag(before.visible) ? 'visível' : 'oculto',
      to: visibleFlag(after.visible) ? 'visível' : 'oculto',
    });
  }
  if (Boolean(before.featured) !== Boolean(after.featured)) {
    changes.push({
      field: 'featured',
      label: FIELD_LABELS.featured,
      from: before.featured ? 'sim' : 'não',
      to: after.featured ? 'sim' : 'não',
    });
  }
  if (asText(before.imageUrl) !== asText(after.imageUrl)) {
    changes.push({ field: 'imageUrl', label: FIELD_LABELS.imageUrl, from: 'anterior', to: 'atual' });
  }
  if (toppingSignature(before.toppings) !== toppingSignature(after.toppings)) {
    changes.push({ field: 'toppings', label: FIELD_LABELS.toppings, from: 'anterior', to: 'atual' });
  }
  return changes;
}

function byName(left, right) {
  return asText(left.name).localeCompare(asText(right.name), 'pt-BR');
}

/**
 * Compara o cardápio salvo no backup com o cardápio atual.
 * "missing" = existia no backup e sumiu. "extra" = foi criado depois.
 */
function buildMenuDiff(snapshot, current) {
  const backupCategories = snapshot.categories || [];
  const currentCategories = current.categories || [];
  const backupItems = (snapshot.items || []).filter(isLive);
  const currentItems = (current.items || []).filter(isLive);
  const backupCategoryById = new Map(backupCategories.map((category) => [Number(category.id), category]));
  const currentCategoryById = new Map(currentCategories.map((category) => [Number(category.id), category]));
  const backupItemById = new Map(backupItems.map((item) => [Number(item.id), item]));
  const currentItemById = new Map(currentItems.map((item) => [Number(item.id), item]));
  const allCategories = [...backupCategories, ...currentCategories];

  const missingCategories = backupCategories
    .filter((category) => !currentCategoryById.has(Number(category.id)))
    .map((category) => ({ id: Number(category.id), name: category.name }));
  const extraCategories = currentCategories
    .filter((category) => !backupCategoryById.has(Number(category.id)))
    .map((category) => ({ id: Number(category.id), name: category.name }));
  const changedCategories = [];
  for (const category of backupCategories) {
    const live = currentCategoryById.get(Number(category.id));
    if (!live) continue;
    const changes = [];
    if (asText(category.name) !== asText(live.name)) {
      changes.push({ field: 'name', label: 'Nome', from: category.name, to: live.name });
    }
    if (asNumber(category.order) !== asNumber(live.order)) {
      changes.push({ field: 'order', label: 'Ordem', from: category.order, to: live.order });
    }
    if (changes.length) {
      changedCategories.push({ id: Number(category.id), name: live.name, changes });
    }
  }

  const missingItems = backupItems
    .filter((item) => !currentItemById.has(Number(item.id)))
    .map((item) => ({
      id: Number(item.id),
      name: item.name,
      categoryName: categoryName(allCategories, item.categoryId),
    }));
  const extraItems = currentItems
    .filter((item) => !backupItemById.has(Number(item.id)))
    .map((item) => ({
      id: Number(item.id),
      name: item.name,
      categoryName: categoryName(allCategories, item.categoryId),
    }));
  const changedItems = [];
  for (const item of backupItems) {
    const live = currentItemById.get(Number(item.id));
    if (!live) continue;
    const changes = itemChanges(item, live, allCategories);
    if (changes.length) {
      changedItems.push({ id: Number(item.id), name: live.name, changes });
    }
  }

  missingCategories.sort(byName);
  extraCategories.sort(byName);
  changedCategories.sort(byName);
  missingItems.sort(byName);
  extraItems.sort(byName);
  changedItems.sort(byName);

  const totals = {
    missingCategories: missingCategories.length,
    extraCategories: extraCategories.length,
    changedCategories: changedCategories.length,
    missingItems: missingItems.length,
    extraItems: extraItems.length,
    changedItems: changedItems.length,
  };
  const unchanged = Object.values(totals).every((count) => count === 0);

  return {
    unchanged,
    missingCategories,
    extraCategories,
    changedCategories,
    missingItems,
    extraItems,
    changedItems,
    totals,
  };
}

module.exports = {
  buildMenuDiff,
  visibleFlag,
};
