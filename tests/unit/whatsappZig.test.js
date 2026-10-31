'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { montarZigPeriodo, aplicarPessoas, carregarZigPeriodo } = require('../../services/whatsappZig');

const DOCS = [
  { date: '2026-10-01', revenue: 100, publico: 10 },
  { date: '2026-10-19', revenue: 200, publico: 20 },
  { date: '2026-10-20', revenue: 300, publico: '' },
  { date: '2026-09-02', revenue: 90, publico: 9 },
];

test('montarZigPeriodo soma a casa no período e estima pax × ticket, sem R$ por cliente', () => {
  const zig = montarZigPeriodo({
    docs: DOCS,
    inicio: '2026-10-01',
    fim: '2026-10-30',
    pessoasCompareceram: 12,
    pessoasWhatsapp: 5,
  });
  assert.equal(zig.fonte, 'ZigPay');
  assert.equal(zig.casa, 'Seu Justino');
  assert.equal(zig.faturamento, 600);
  assert.equal(zig.publico, 30);
  assert.equal(zig.ticketMedio, 10);
  assert.equal(zig.pessoasCompareceram, 12);
  assert.equal(zig.receitaEstimadaReservas, 120);
  assert.equal(zig.receitaEstimadaWhatsapp, 50);
  assert.equal(zig.serie.length, 3);
  assert.equal(zig.serie[0].date, '2026-10-01');
  assert.equal(zig.serie[0].faturamento, 100);
});

test('montarZigPeriodo sem público no período não inventa ticket nem estimativa', () => {
  const zig = montarZigPeriodo({
    docs: [{ date: '2026-10-05', revenue: 80, publico: '' }],
    inicio: '2026-10-01',
    fim: '2026-10-30',
    pessoasCompareceram: 12,
    pessoasWhatsapp: 5,
  });
  assert.equal(zig.faturamento, 80);
  assert.equal(zig.ticketMedio, null);
  assert.equal(zig.receitaEstimadaReservas, null);
  assert.equal(zig.receitaEstimadaWhatsapp, null);
});

test('carregarZigPeriodo devolve null se a casa não é o Seu Justino', async () => {
  const zig = await carregarZigPeriodo(
    {},
    { inicio: '2026-10-01', fim: '2026-10-30', establishmentId: 7 },
    {
      resolveJustinoPlaceIds: async () => [1],
      store: { latestPayload: async () => ({ payload: { docs: DOCS } }) },
    },
  );
  assert.equal(zig, null);
});

test('carregarZigPeriodo devolve null sem snapshot ou sem casa', async () => {
  const semCasa = await carregarZigPeriodo({}, { inicio: '2026-10-01', fim: '2026-10-30' }, {
    resolveJustinoPlaceIds: async () => [1],
    store: { latestPayload: async () => ({ payload: { docs: DOCS } }) },
  });
  assert.equal(semCasa, null);
  const semSnap = await carregarZigPeriodo(
    {},
    { inicio: '2026-10-01', fim: '2026-10-30', establishmentId: 1, pessoasCompareceram: 12 },
    {
      resolveJustinoPlaceIds: async () => [1],
      store: { latestPayload: async () => null },
    },
  );
  assert.equal(semSnap, null);
});

test('aplicarPessoas preenche a estimativa depois do SELECT de reservas', () => {
  const base = montarZigPeriodo({
    docs: DOCS,
    inicio: '2026-10-01',
    fim: '2026-10-30',
  });
  const zig = aplicarPessoas(base, 12, 5);
  assert.equal(zig.receitaEstimadaReservas, 120);
  assert.equal(zig.receitaEstimadaWhatsapp, 50);
  assert.equal(aplicarPessoas(null, 12, 5), null);
});
