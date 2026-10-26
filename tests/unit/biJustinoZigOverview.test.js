'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { shapeZig, loadZigOverview, collectZigSnapshot, scheduleZigSync, resetZigSync } = require('../../services/biJustino/zigOverview');

test('a visão da Zig só devolve os números, sem o restante do payload', () => {
  const shaped = shapeZig({
    monthKey: '2026-10',
    monthRevenue: 120000,
    monthRevenueZig: 100000,
    monthRevenueEventos: 20000,
    password: 'nao-pode-sair',
    email: 'robo@seujustino.local',
  }, '2026-10-23T12:00:00.000Z');
  const dumped = JSON.stringify(shaped);
  assert.equal(shaped.disponivel, true);
  assert.equal(shaped.mes, '2026-10');
  assert.equal(shaped.faturamentoMes, 120000);
  assert.equal(shaped.zigMes, 100000);
  assert.equal(shaped.eventosMes, 20000);
  assert.equal(dumped.includes('nao-pode-sair'), false);
  assert.equal(dumped.includes('robo@'), false);
});

test('sem login do painel, não chama a planilha e não inventa número', async () => {
  let chamou = false;
  const zig = await loadZigOverview(null, {}, {
    now: () => Date.parse('2026-10-23T15:00:00.000Z'),
    readAction: async () => {
      chamou = true;
      return {};
    },
    store: {
      latestPayload: async () => null,
      saveSnapshot: async () => ({ captured_at: '2026-10-23T15:00:00.000Z' }),
    },
  });
  assert.equal(chamou, false);
  assert.equal(zig.disponivel, false);
  assert.equal(zig.motivo, 'credenciais_ausentes');
});

test('a página lê a cópia do banco e não chama a planilha', async () => {
  let chamou = false;
  const zig = await loadZigOverview(null, {
    BI_APPS_SCRIPT_EMAIL: 'robo@seujustino.local',
    BI_APPS_SCRIPT_PASSWORD: 'segredo',
  }, {
    readAction: async () => {
      chamou = true;
      return { monthRevenue: 999 };
    },
    store: {
      latestPayload: async () => ({
        captured_at: '2026-10-23T14:00:00.000Z',
        payload: { monthKey: '2026-10', monthRevenue: 1, monthRevenueZig: 1, serieMes: [{ dia: '2026-10-01', zig: 1, eventos: 0 }] },
      }),
    },
  });
  assert.equal(chamou, false);
  assert.equal(zig.disponivel, true);
  assert.equal(zig.faturamentoMes, 1);
  assert.equal(zig.serieMes.length, 1);
  assert.equal(JSON.stringify(zig).includes('segredo'), false);
});

test('a coleta grava no banco antes de a página poder ler o número novo', async () => {
  resetZigSync();
  let gravou = null;
  const env = {
    BI_APPS_SCRIPT_EMAIL: 'robo@seujustino.local',
    BI_APPS_SCRIPT_PASSWORD: 'segredo',
  };
  const store = {
    latestPayload: async () => ({
      captured_at: '2026-10-23T14:00:00.000Z',
      payload: { monthRevenue: 1 },
    }),
    saveSnapshot: async (_pool, body) => {
      gravou = body;
      return { captured_at: '2026-10-23T15:00:00.000Z' };
    },
  };
  const lidoAntes = await loadZigOverview(null, env, { store });
  assert.equal(lidoAntes.faturamentoMes, 1);
  assert.equal(lidoAntes.serieMes.length, 0);

  const gravado = await collectZigSnapshot(null, env, {
    emit: false,
    store,
    readAction: async () => ({
      monthKey: '2026-10',
      monthRevenueZig: 80,
      monthRevenue: 90,
      monthRevenueEventos: 10,
      token: 'nao-devolver',
    }),
    buscarZigPainel: async () => ({
      serieMes: [{ dia: '2026-10-21', zig: 80, eventos: 10 }],
      serieAno: [],
      custos: [{ label: 'Marketing', valor: 4500 }],
    }),
  });

  assert.equal(gravou.source, 'faturamento_zig');
  assert.equal(gravou.payload.monthRevenue, 90);
  assert.equal(gravou.payload.serieMes[0].zig, 80);
  assert.equal(gravado.faturamentoMes, 90);
  assert.equal(gravado.serieMes[0].eventos, 10);
  assert.equal(JSON.stringify(gravado).includes('segredo'), false);
  assert.equal(JSON.stringify(gravado).includes('nao-devolver'), false);
  assert.equal(typeof scheduleZigSync, 'function');
});
