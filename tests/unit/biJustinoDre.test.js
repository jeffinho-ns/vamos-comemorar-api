'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { mesAlvo, extrairDre, mesesPresentes } = require('../../services/biJustino/dreLeitura');
const { faltando, loadDre } = require('../../services/biJustino/dreSharepoint');

test('o mês da DRE é o anterior, no fuso de São Paulo', () => {
  const alvo = mesAlvo(new Date('2026-10-28T20:00:00.000Z'));
  assert.equal(alvo.label, 'Setembro/26');
  assert.equal(alvo.key, '2026-09');
});

test('soma as receitas e busca o mês anterior quando o campo está zerado', () => {
  const rotulos = [
    '',
    '(+) Faturamento',
    'Receita Alimentos',
    'Receita Bebidas',
    '(-) Deduções',
    'Total Impostos S/ Faturamento',
    'Energia Elétrica',
  ];
  const dre = extrairDre({
    mesLabel: 'Setembro/26',
    rotulos,
    fields: { revenue: '(+) Faturamento', tax: 'Total Impostos S/ Faturamento', energy: 'Energia Elétrica' },
    colunas: {
      'Setembro/26': [0, 0, 100, 40, 0, 0, 0],
      'Agosto/26': [0, 0, 80, 20, 0, 15, 900],
    },
  });
  assert.equal(dre.valores.revenue, 140);
  assert.equal(dre.valores.tax, 15);
  assert.equal(dre.fallbacks.tax, 'Agosto/26');
  assert.equal(dre.valores.energy, 900);
  assert.deepEqual(mesesPresentes('Setembro/26', ['', 'Agosto/26', 'Setembro/26']), ['Setembro/26', 'Agosto/26']);
});

test('sem as variáveis da Microsoft, não chama o SharePoint', async () => {
  let chamou = false;
  const dre = await loadDre(null, {}, {
    now: () => Date.parse('2026-10-28T20:00:00.000Z'),
    fetchImpl: async () => {
      chamou = true;
      return { ok: true, json: async () => ({}) };
    },
    store: {
      latestPayload: async () => null,
      saveSnapshot: async () => ({ captured_at: '2026-10-28T20:00:00.000Z' }),
    },
  });
  assert.equal(chamou, false);
  assert.equal(dre.disponivel, false);
  assert.equal(dre.motivo, 'credenciais_ausentes');
  assert.equal(faltando({}).includes('MS_CLIENT_SECRET'), true);
  assert.equal(JSON.stringify(dre).includes('segredo'), false);
});
