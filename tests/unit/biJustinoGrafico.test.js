const test = require('node:test');
const assert = require('node:assert/strict');
const { montarGrafico, valorEvento } = require('../../services/biJustino/graficoDiretoria');

const AGORA = new Date('2026-10-21T15:00:00-03:00');

test('evento sem contrato assinado e sem pagamento fica fora da linha', () => {
  assert.equal(valorEvento({
    status: 'realizado',
    data: '2026-10-02',
    statusContrato: 'pendente',
    statusPagamento: 'aguardando',
    valorTotal: 900,
  }), 0);
});

test('o gráfico separa ZigPay e eventos e o custo usa o último envio', () => {
  const grafico = montarGrafico({
    docs: [{ date: '2026-10-01', revenue: 100 }],
    eventos: [
      { status: 'realizado', data: '2026-10-02', statusContrato: 'assinado', valorContrato: 40, valorExcedente: 10, valorTotal: 999 },
      { status: 'orcamento', data: '2026-10-03', statusContrato: 'assinado', valorContrato: 80 },
    ],
    entradas: {
      marketing: { docs: [{ values: { mkTraffic: 4500, mkOther: 0, mkAttractions: 0 } }] },
      financeiro: { docs: [] },
      rh: { docs: [] },
      operacao: { docs: [{ values: { opLoss: 0, opMaintenance: 0 } }] },
      cmv: { docs: [{ values: { cmvFoodMix: 30, cmvFoodReal: 20, cmvBevReal: 20 } }] },
    },
    freelancers: [{ status: 'aprovado', attendance: '', date: '2026-10-04', totalCost: 100 }],
    now: AGORA,
  });

  assert.equal(grafico.serieMes[0].zig, 100);
  assert.equal(grafico.serieMes[0].eventos, 0);
  assert.equal(grafico.serieMes[1].eventos, 50);
  assert.equal(grafico.serieMes[2].eventos, 0);
  assert.equal(grafico.serieAno.length, 12);
  assert.equal(grafico.serieAno[11].rotulo, 'Out');
  assert.equal(grafico.serieAno[11].zig, 100);
  assert.equal(grafico.serieAno[11].eventos, 50);
  assert.equal(grafico.custos[0].label, 'Marketing');
  assert.equal(grafico.custos[0].valor, 4500);
  assert.equal(grafico.custos[3].valor, 0);
  assert.equal(grafico.custos[2].valor, 100);
});
