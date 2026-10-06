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

test('só o e-mail do Jeffinho vê o Sítio Ilha na configuração', () => {
  assert.equal(canViewSitioIlhaConfig('jeffinho_ns@hotmail.com'), true);
  assert.equal(canViewSitioIlhaConfig('Jeffinho_NS@hotmail.com'), true);
  assert.equal(canViewSitioIlhaConfig(' renatocury@ideiaum.com.br '), false);
  assert.equal(canViewSitioIlhaConfig(''), false);
});
