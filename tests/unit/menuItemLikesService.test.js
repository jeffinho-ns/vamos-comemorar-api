const test = require('node:test');
const assert = require('node:assert');
const { normalizeVisitorKey, parseItemIds } = require('../../services/menuItemLikesService');

test('aceita identificador anônimo estável e rejeita valor curto ou vazio', () => {
  assert.equal(normalizeVisitorKey(' 11111111-2222-4333-8444-555555555555 '), '11111111-2222-4333-8444-555555555555');
  assert.equal(normalizeVisitorKey('curto'), null);
  assert.equal(normalizeVisitorKey(''), null);
  assert.equal(normalizeVisitorKey('chave com espaço invalida!!'), null);
});

test('normaliza ids de itens curtidos sem repetir e sem aceitar lixo', () => {
  assert.deepEqual(parseItemIds(['10', 10, '0', '-3', 'abc', 22, null]), [10, 22]);
  assert.equal(parseItemIds('10').length, 0);
  assert.equal(parseItemIds(Array.from({ length: 400 }, (_, index) => index + 1)).length, 300);
});
