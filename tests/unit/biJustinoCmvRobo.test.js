const test = require('node:test');
const assert = require('node:assert/strict');
const { validarCmvTeoricoParcial, validarItensVendidos, CAMPOS_PARCIAL } = require('../../services/biJustino/cmv/robo');
const { encontrarLeitura, mesAtual } = require('../../services/biJustino/espelho/catalogo');

test('cmv teórico parcial exige data e números não negativos; preenche os campos ausentes com 0', () => {
  assert.equal(validarCmvTeoricoParcial({ date: '17/10/2026' }).error, 'data_invalida');
  assert.equal(validarCmvTeoricoParcial({ date: '2026-10-17', custoFoodTeorico: -5 }).error, 'valor_invalido:custoFoodTeorico');
  const r = validarCmvTeoricoParcial({ date: '2026-10-17', custoFoodTeorico: '1.200,50', valorCobertoFood: 5000, valorTotalFood: 8000 });
  assert.equal(r.ok, true);
  assert.equal(r.payload.custoFoodTeorico, 1200.5);
  assert.equal(r.payload.valorTotalMisto, 0);
  assert.equal(r.payload.source, 'robo-zigpay');
  CAMPOS_PARCIAL.forEach((campo) => assert.equal(typeof r.payload[campo], 'number'));
});

test('itens vendidos validam cada item e mantêm custoUnit só quando informado', () => {
  assert.equal(validarItensVendidos({ date: '2026-10-17' }).error, 'itens_ausentes');
  assert.equal(validarItensVendidos({ date: '2026-10-17', items: [{ nome: 'Chopp', tipo: 'sobremesa' }] }).error, 'item_invalido:0');
  assert.equal(validarItensVendidos({ date: '2026-10-17', items: [{ nome: 'Chopp', tipo: 'bebida', quantidade: -1 }] }).error, 'item_invalido:0');
  const r = validarItensVendidos({ date: '2026-10-17', items: [
    { sku: '1', nome: 'Chopp', categoria: 'Cervejas', tipo: 'bebida', quantidade: 120, valorTotal: '1.800,00', custoUnit: 4.5 },
    { nome: 'Feijoada', tipo: 'comida', quantidade: 30, valorTotal: 2700 },
  ] });
  assert.equal(r.ok, true);
  assert.equal(r.payload.items[0].custoUnit, 4.5);
  assert.equal(r.payload.items[0].valorTotal, 1800);
  assert.equal('custoUnit' in r.payload.items[1], false);
});

test('catálogo pede ao Apps Script os mesmos parâmetros do painel (mes, limit 30)', () => {
  const dre = encontrarLeitura(`getDreParaMes:${mesAtual()}`);
  assert.ok(dre);
  assert.equal(dre.payload.mes, mesAtual());
  assert.equal('mesKey' in dre.payload, false);
  assert.ok(encontrarLeitura(`getEmployeesMonth:${mesAtual()}`));
  assert.equal(encontrarLeitura('getCmvTeoricoParcial').payload.limit, 30);
  assert.equal(encontrarLeitura('getZigItemSalesRanking').payload.days, 30);
});
