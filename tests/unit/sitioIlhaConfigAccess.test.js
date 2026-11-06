const test = require('node:test');
const assert = require('node:assert');
const { isSitioIlhaBar, canViewSitioIlhaConfig } = require('../../services/cardapioMenuConfigService');

test('reconhece o Sítio Ilha pelo id, slug ou nome', () => {
  assert.equal(isSitioIlhaBar({ id: 15, name: 'Outro nome', slug: 'outro' }), true);
  assert.equal(isSitioIlhaBar({ id: 99, name: 'Sítio Ilha', slug: 'x' }), true);
  assert.equal(isSitioIlhaBar({ id: 99, name: 'Sitio Ilha', slug: 'sitio-ilha' }), true);
  assert.equal(isSitioIlhaBar({ id: 3, name: 'High Line Bar', slug: 'highline' }), false);
  assert.equal(isSitioIlhaBar({ id: 19, name: 'High Line Club', slug: 'highlineclub' }), false);
  assert.equal(isSitioIlhaBar({ id: 1, name: 'Seu Justino', slug: 'justino' }), false);
});

test('o cardápio do Sítio Ilha não fica preso a um único e-mail', () => {
  assert.equal(canViewSitioIlhaConfig('sitioilharj@gmail.com'), true);
  assert.equal(canViewSitioIlhaConfig('thiago@sitioilha.com.br'), true);
  assert.equal(canViewSitioIlhaConfig('jeffinho_ns@hotmail.com'), true);
});
