'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  periodoPadrao,
  rotuloOrigem,
  rotuloIntent,
  montarDashboard,
} = require('../../services/whatsappDashboard');

test('periodoPadrao cobre 30 dias e o intervalo anterior do mesmo tamanho', () => {
  const p = periodoPadrao('2026-10-30');
  assert.equal(p.inicio, '2026-10-01');
  assert.equal(p.fim, '2026-10-30');
  assert.equal(p.anteriorInicio, '2026-09-01');
  assert.equal(p.anteriorFim, '2026-09-30');
});

test('rotuloOrigem e rotuloIntent traduzem códigos do Agilizaiapp', () => {
  assert.equal(rotuloOrigem('WHATSAPP'), 'WhatsApp');
  assert.equal(rotuloOrigem('PESSOAL'), 'Equipe');
  assert.equal(rotuloOrigem('CLIENTE'), 'Site / portal');
  assert.equal(rotuloIntent('PROCESS_RESERVATION'), 'Reserva');
  assert.equal(rotuloIntent('OPERATIONAL_INFO'), 'Funcionamento');
});

test('montarDashboard monta funil, origem e variação sem inventar dinheiro', () => {
  const d = montarDashboard({
    periodo: { inicio: '2026-10-01', fim: '2026-10-30' },
    conversas: { total: 100, resolvidas: 40, handoffAtivo: 3, passaramHumano: 10 },
    tentaramReservar: 60,
    reservas: {
      total: 80,
      pessoas: 240,
      whatsapp: 25,
      confirmadas: 20,
      compareceram: 12,
      canceladas: 4,
      noshow: 1,
    },
    reservasAnterior: { total: 50, pessoas: 150, whatsapp: 10 },
    conversasAnterior: { total: 80 },
    origens: [
      { origin: 'WHATSAPP', reservas: 25, pessoas: 80 },
      { origin: 'PESSOAL', reservas: 40, pessoas: 120 },
      { origin: 'CLIENTE', reservas: 15, pessoas: 40 },
    ],
    ia: { reservas: 18, conversas: 90 },
    temas: [{ intent: 'PROCESS_RESERVATION', n: 40 }, { intent: 'OPERATIONAL_INFO', n: 12 }],
    heatmap: [{ dow: 5, hora: 21, n: 8 }],
    serie: [{ date: '2026-10-30', conversas: 4, reservas: 2 }],
    tempoConversaoHoras: 12.5,
    contacts: { total: 90, optIn: 30 },
  });

  assert.equal(d.conversations_total, 100);
  assert.equal(d.reservations_whatsapp, 25);
  assert.equal(d.kpis.reservas, 80);
  assert.equal(d.kpis.pessoas, 240);
  assert.equal(d.kpis.pessoasPorReserva, 3);
  assert.equal(d.kpis.tempoConversaoHoras, 12.5);
  assert.equal(d.kpis.variacaoReservasPct, 60);
  assert.equal(d.funil[0].id, 'conversas');
  assert.equal(d.funil[0].valor, 100);
  assert.equal(d.funil.find((x) => x.id === 'reservas').valor, 25);
  assert.equal(d.ia.taxaPct, 20);
  assert.equal(d.origens[0].label, 'Equipe');
  assert.equal(d.origens[0].pct, 50);
  assert.equal(d.temas[0].tema, 'Reserva');
  assert.equal(d.heatmap[0].n, 8);
});
