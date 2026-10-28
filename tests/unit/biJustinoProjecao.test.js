const test = require('node:test');
const assert = require('node:assert/strict');
const { projecaoConsolidada } = require('../../services/biJustino/projecaoConsolidada');

test('sem envio das áreas, a projeção usa o faturamento do mês e a referência do painel', () => {
  const projecao = projecaoConsolidada({ faturamento: 100000, agora: new Date('2026-10-28T15:00:00Z') });
  assert.equal(projecao.faturamentoBruto, 100000);
  assert.equal(Number(projecao.cmvReal.toFixed(2)), 22.41);
  assert.equal(Math.round(projecao.controlaveis), 329575);
  assert.equal(Math.round(projecao.estruturais), 34247);
  assert.equal(projecao.envios.cmv, null);
  assert.equal(JSON.stringify(projecao).includes('submittedByName'), false);
});

test('o último envio de CMV e do Financeiro entra no lugar da referência', () => {
  const projecao = projecaoConsolidada({
    faturamento: 200000,
    agora: new Date('2026-10-28T15:00:00Z'),
    cmv: { docs: [{ date: '2026-10-20', values: { cmvFoodMix: 50, cmvFoodReal: 20, cmvBevReal: 10 }, submittedByName: 'Marcio' }] },
    financeiro: { docs: [{ date: '2026-10-21', values: { fnTax: 1, fnCard: 1, fnFee: 1, fnIncomeTax: 1 } }] },
    freelancers: [
      { status: 'aprovado', attendance: '', date: '2026-10-10', totalCost: 500, requestedByEmail: 'pessoa@seujustino.com.br', freelancerNames: 'Ana' },
    ],
  });
  assert.equal(projecao.cmvReal, 15);
  assert.equal(projecao.envios.cmv, '2026-10-20');
  assert.equal(projecao.envios.financeiro, '2026-10-21');
  assert.equal(JSON.stringify(projecao).includes('pessoa@seujustino.com.br'), false);
  assert.equal(JSON.stringify(projecao).includes('Marcio'), false);
  assert.ok(projecao.controlaveis > 500);
});
