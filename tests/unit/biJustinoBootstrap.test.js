const test = require('node:test');
const assert = require('node:assert/strict');
const { coletarAbertura } = require('../../services/biJustino/bootstrapColeta');

test('a abertura grava a DRE e o 99Food numa leitura só', async () => {
  const gravados = [];
  const store = {
    async latestPayload() {
      return { payload: { monthRevenue: 10, bilheteria: [] } };
    },
    async saveSnapshot(_pool, row) {
      gravados.push(row);
      return { captured_at: '2026-10-28T18:00:00.000Z' };
    },
  };
  await coletarAbertura(null, {
    BI_APPS_SCRIPT_EMAIL: 'robo@seujustino.local',
    BI_APPS_SCRIPT_PASSWORD: 'segredo',
  }, {
    emit: false,
    store,
    readBootstrap: async () => ([
      {
        action: 'getDreBase',
        r: {
          ok: true,
          values: { revenue: '1.250,50', rent: '100' },
          mesPorCampo: { revenue: 'Setembro/26', rent: 'Setembro/26' },
        },
      },
      {
        action: 'get99Food',
        r: {
          ok: true,
          rows: [{
            snap: {
              pedidosConcluidos: 4,
              rendaVendas: 80,
              ticketMedio: 20,
              horasConectadoDia: 3,
              tempoPreparoMin: 12,
              itens: { vendidos: [] },
            },
          }],
        },
      },
    ]),
  });
  assert.equal(gravados.some((item) => item.source === 'dre_sharepoint' && item.payload.valores.revenue === 1250.5), true);
  assert.equal(gravados.some((item) => item.source === 'painel_novidades' && item.payload.food.pedidos === 4), true);
});
