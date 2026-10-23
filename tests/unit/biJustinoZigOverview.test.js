'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { shapeZig, loadZigOverview } = require('../../services/biJustino/zigOverview');

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

test('com login e cópia velha, busca de novo e grava só o resumo na resposta', async () => {
  let gravou = null;
  const zig = await loadZigOverview(null, {
    BI_APPS_SCRIPT_EMAIL: 'robo@seujustino.local',
    BI_APPS_SCRIPT_PASSWORD: 'segredo',
  }, {
    now: () => Date.parse('2026-10-23T15:00:00.000Z'),
    freshMs: 1000,
    readAction: async () => ({
      monthKey: '2026-10',
      monthRevenueZig: 80,
      monthRevenue: 90,
      monthRevenueEventos: 10,
      token: 'nao-devolver',
    }),
    store: {
      latestPayload: async () => ({
        captured_at: '2026-10-23T14:00:00.000Z',
        payload: { monthRevenue: 1 },
      }),
      saveSnapshot: async (_pool, body) => {
        gravou = body;
        return { captured_at: '2026-10-23T15:00:00.000Z' };
      },
    },
  });
  assert.equal(gravou.source, 'faturamento_zig');
  assert.equal(gravou.action, 'getRevenueOverview');
  assert.equal(zig.zigMes, 80);
  assert.equal(zig.faturamentoMes, 90);
  assert.equal(JSON.stringify(zig).includes('segredo'), false);
  assert.equal(JSON.stringify(zig).includes('nao-devolver'), false);
});
