'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  periodoPadrao,
  rotuloOrigem,
  rotuloIntent,
  montarDashboard,
} = require('../../services/whatsappDashboard');
const { montarOperacao, carregarOperacao } = require('../../services/whatsappOperacao');

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

test('montarOperacao preenche funil operacional, pico e semana sem inventar CSAT', () => {
  const op = montarOperacao({
    conversas: { total: 200, resolvidas: 180, passaramHumano: 40, ia: 160 },
    primeiraRespostaSegundos: 12.7,
    primeiraRespostaMediana: 8,
    origemSessoes: [
      { canal: 'WhatsApp orgânico', n: 150 },
      { canal: 'WhatsApp campanha', n: 50 },
    ],
    heatmapConversas: [{ dow: 3, hora: 14, n: 22 }, { dow: 5, hora: 21, n: 9 }],
    resolvidosPorDia: [{ dow: 1, n: 20 }, { dow: 5, n: 40 }],
    primeiraRespostaPorDia: [{ dow: 1, segundos: 10 }, { dow: 5, segundos: 30 }],
    tempoAtendimentoPorDia: [{ dow: 1, minutos: 8 }, { dow: 5, minutos: 15 }],
    categorias: [{ intent: 'PROCESS_RESERVATION', n: 70 }],
    cancelamentos: [
      { motivo: 'Cliente recusou', n: 10 },
      { motivo: 'No-show', n: 4 },
    ],
  });
  assert.equal(op.taxaResolucaoPct, 90);
  assert.equal(op.taxaIaPct, 80);
  assert.equal(op.primeiraRespostaSegundos, 12.7);
  assert.equal(op.resolucaoAutomatica.ia, 160);
  assert.equal(op.resolucaoAutomatica.humano, 40);
  assert.equal(op.origemSessoes[0].label, 'WhatsApp orgânico');
  assert.equal(op.origemSessoes[0].pct, 75);
  assert.equal(op.pico.dia, 'Qua');
  assert.equal(op.pico.hora, 14);
  assert.equal(op.resolvidosPorDia[0].dia, 'Seg');
  assert.equal(op.resolvidosPorDia[0].valor, 20);
  assert.equal(op.resolvidosPorDia[4].valor, 40);
  assert.equal(op.categorias[0].tema, 'Reserva');
  assert.equal(op.cancelamentos[0].motivo, 'Cliente recusou');
  assert.equal(op.cancelamentos[0].pct, 71.4);
});

test('carregarOperacao com pool falho devolve operação zerada', async () => {
  const pool = { query: async () => { throw new Error('sem banco'); } };
  const op = await carregarOperacao(pool, { inicio: '2026-10-01', fim: '2026-10-30' });
  assert.equal(op.total, 0);
  assert.equal(op.taxaResolucaoPct, 0);
  assert.equal(op.primeiraRespostaSegundos, null);
  assert.equal(op.resolvidosPorDia.length, 7);
});

test('montarOperacao vazio não inventa CSAT nem quebra a semana', () => {
  const op = montarOperacao({});
  assert.equal(op.taxaResolucaoPct, 0);
  assert.equal(op.taxaIaPct, 0);
  assert.equal(op.primeiraRespostaSegundos, null);
  assert.equal(op.resolucaoAutomatica.ia, 0);
  assert.equal(op.pico, null);
  assert.equal(op.resolvidosPorDia.length, 7);
  assert.equal(op.origemSessoes.length, 0);
  assert.equal(op.cancelamentos.length, 0);
});
