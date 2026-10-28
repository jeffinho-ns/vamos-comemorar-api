'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { avaliarConfig } = require('../../services/biJustino/notaAtendimento');
const { montar } = require('../../services/biJustino/painelNovidades');

test('a nota de atendimento pesa a IA do WhatsApp e ignora item não lido', () => {
  const saude = avaliarConfig({
    iaWhatsappLigada: true,
    regrasChars: 900,
    followUpLigado: true,
    followUpIntervalos: [15, 120],
    humanoGrupoGrande: true,
    humanoSemMesas: true,
    humanoForaPrazo: true,
    sac: { ativosMais24h: 0 },
  }, Date.parse('2026-10-28T15:00:00.000Z'));
  assert.equal(saude.nota, 100);
  assert.equal(saude.faixa, 'Bom');
});

test('o resumo das fontes novas não devolve e-mail nem o json cru', () => {
  const extra = montar([
    { rows: [{ capturedAt: 1, snap: { pedidosConcluidos: 12, rendaVendas: 340, itens: { vendidos: [{ nome: 'Feijoada', volume: 4 }] } } }] },
    { rows: [['2026-10-01', '99Food', 100]] },
    { rows: [{ nota: 2, status: 'novo', respondida: false, texto: 'demorou', sugestao: 'Olá!', decididoPor: 'pessoa@email.com' }] },
    { cols: ['status', 'pessoas'], rows: [['confirmada', 4]] },
    { rows: [{ periodo: 'outubro', conversas: 10, totalReservas: 3, comparecimentoPct: 80, porIAPct: 40 }] },
    { rows: [] },
  ]);
  const dumped = JSON.stringify(extra);
  assert.equal(extra.food.pedidos, 12);
  assert.equal(extra.food.vendidos[0].nome, 'Feijoada');
  assert.equal(extra.delivery[0].plataforma, '99Food');
  assert.equal(extra.avaliacoes.pendentes, 1);
  assert.equal(extra.crm.funil.reservas, 3);
  assert.equal(dumped.includes('pessoa@email.com'), false);
  assert.equal(dumped.includes('decididoPor'), false);
});
