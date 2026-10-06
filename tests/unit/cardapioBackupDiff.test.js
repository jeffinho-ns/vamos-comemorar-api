const test = require('node:test');
const assert = require('node:assert');
const { buildMenuDiff } = require('../../services/cardapioBackupDiff');

function snapshot(overrides = {}) {
  return {
    categories: [
      { id: 1, name: 'Bebidas', order: 0 },
      { id: 2, name: 'Comidas', order: 1 },
    ],
    items: [
      {
        id: 10,
        name: 'Gin',
        price: 32,
        description: 'dose',
        categoryId: 1,
        subCategory: 'Gin',
        order: 0,
        visible: 1,
        featured: false,
        imageUrl: 'gin.jpg',
        deletedAt: null,
        toppings: [],
      },
    ],
    ...overrides,
  };
}

test('cardápio idêntico não tem diferença', () => {
  const menu = snapshot();
  const diff = buildMenuDiff(menu, menu);
  assert.equal(diff.unchanged, true);
  assert.equal(diff.totals.missingItems, 0);
});

test('categoria e item apagados aparecem como sumidos', () => {
  const before = snapshot();
  const current = snapshot({
    categories: [{ id: 2, name: 'Comidas', order: 1 }],
    items: [],
  });
  const diff = buildMenuDiff(before, current);
  assert.deepEqual(diff.missingCategories.map((category) => category.name), ['Bebidas']);
  assert.deepEqual(diff.missingItems.map((item) => item.name), ['Gin']);
  assert.equal(diff.missingItems[0].categoryName, 'Bebidas');
});

test('item criado depois do backup aparece como extra', () => {
  const before = snapshot();
  const current = snapshot();
  current.items = [
    ...current.items,
    {
      id: 11,
      name: 'Tônica',
      price: 12,
      categoryId: 1,
      deletedAt: null,
      toppings: [],
      visible: 1,
      featured: false,
    },
  ];
  const diff = buildMenuDiff(before, current);
  assert.deepEqual(diff.extraItems.map((item) => item.name), ['Tônica']);
});

test('mudança de preço e item na lixeira contam como alteração e exclusão', () => {
  const before = snapshot();
  const current = snapshot();
  current.items = [
    { ...current.items[0], price: 40 },
    {
      id: 12,
      name: 'Whisky',
      price: 48,
      categoryId: 1,
      deletedAt: '2026-10-05T00:00:00.000Z',
      toppings: [],
      visible: 1,
      featured: false,
    },
  ];
  before.items = [
    ...before.items,
    {
      id: 12,
      name: 'Whisky',
      price: 48,
      categoryId: 1,
      deletedAt: null,
      toppings: [],
      visible: 1,
      featured: false,
    },
  ];
  const diff = buildMenuDiff(before, current);
  assert.equal(diff.changedItems[0].name, 'Gin');
  assert.equal(diff.changedItems[0].changes[0].label, 'Preço');
  assert.equal(diff.changedItems[0].changes[0].to, 40);
  assert.deepEqual(diff.missingItems.map((item) => item.name), ['Whisky']);
});
