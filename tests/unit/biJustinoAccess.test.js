'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  isBiJustinoEmail,
  paginasBiJustino,
  podePaginaBiJustino,
  areaDoCaminhoBiJustino,
  filtrarChavesBiJustino,
} = require('../../services/biJustino/access');

const CAROLLINE = 'carolline.moreira@ideiaum.com.br';
const RENATO = 'renatocury@ideiaum.com.br';

test('Renato, Paula, Luis Felipe, Menda e Carolline leem o BI', () => {
  assert.equal(isBiJustinoEmail('renatocury@ideiaum.com.br'), true);
  assert.equal(isBiJustinoEmail(' Renato@SeuJustino.com.br '), true);
  assert.equal(isBiJustinoEmail('coordenadora.reservas@ideiaum.com.br'), true);
  assert.equal(isBiJustinoEmail('luisfelipe@ideiaum.com.br'), true);
  assert.equal(isBiJustinoEmail('gabrielmenda@ideiaum.com.br'), true);
  assert.equal(isBiJustinoEmail(CAROLLINE), true);
});

test('promoter e cliente com nome parecido ficam de fora', () => {
  assert.equal(isBiJustinoEmail('renato@ideiaum.com.br'), false);
  assert.equal(isBiJustinoEmail('garciabrangi@gmail.com'), false);
  assert.equal(isBiJustinoEmail('paula@reservas.com.br'), false);
  assert.equal(isBiJustinoEmail(''), false);
});

test('Carolline só vê RH, Documentos, Manual e Contatos', () => {
  assert.deepEqual(paginasBiJustino(CAROLLINE), ['rh', 'documentos', 'manual', 'contatos']);
  assert.equal(podePaginaBiJustino(CAROLLINE, 'rh'), true);
  assert.equal(podePaginaBiJustino(CAROLLINE, 'documentos'), true);
  assert.equal(podePaginaBiJustino(CAROLLINE, 'manual'), true);
  assert.equal(podePaginaBiJustino(CAROLLINE, 'contatos'), true);
  assert.equal(podePaginaBiJustino(CAROLLINE, 'master'), false);
  assert.equal(podePaginaBiJustino(CAROLLINE, 'marketing'), false);
  assert.equal(podePaginaBiJustino(CAROLLINE, 'financeiro'), false);
  assert.equal(podePaginaBiJustino(CAROLLINE, 'operacao'), false);
  assert.equal(podePaginaBiJustino(CAROLLINE, 'cmv'), false);
  assert.equal(podePaginaBiJustino(CAROLLINE, 'eventos'), false);
  assert.equal(podePaginaBiJustino(CAROLLINE, 'reservas'), false);
  assert.equal(podePaginaBiJustino(CAROLLINE, 'auditoriaop'), false);
  assert.equal(podePaginaBiJustino(CAROLLINE, 'auditoria'), false);
});

test('Renato e quem não tem recorte vê todas as páginas', () => {
  const todas = paginasBiJustino(RENATO);
  assert.ok(todas.includes('master'));
  assert.ok(todas.includes('rh'));
  assert.ok(todas.includes('marketing'));
  assert.equal(podePaginaBiJustino(RENATO, 'master'), true);
  assert.equal(podePaginaBiJustino('luisfelipe@ideiaum.com.br', 'financeiro'), true);
});

test('rotas de escrita apontam para a área certa', () => {
  assert.equal(areaDoCaminhoBiJustino('/justino/envio/rh'), 'rh');
  assert.equal(areaDoCaminhoBiJustino('/justino/rh/colaborador'), 'rh');
  assert.equal(areaDoCaminhoBiJustino('/justino/documentos/salvar'), 'documentos');
  assert.equal(areaDoCaminhoBiJustino('/justino/documentos/manual/pdf'), 'manual');
  assert.equal(areaDoCaminhoBiJustino('/justino/contatos/salvar'), 'contatos');
  assert.equal(areaDoCaminhoBiJustino('/justino/envio/financeiro'), 'financeiro');
  assert.equal(areaDoCaminhoBiJustino('/justino/marketing/demandas'), 'marketing');
  assert.equal(areaDoCaminhoBiJustino('/justino/diretoria/auditoria/aprovar'), 'master');
  assert.equal(areaDoCaminhoBiJustino('/justino/eventos/salvar'), 'eventos');
  assert.equal(areaDoCaminhoBiJustino('/justino/ao-vivo'), 'master');
  assert.equal(areaDoCaminhoBiJustino('/justino/marketing/duvidas'), 'duvidas');
  assert.equal(areaDoCaminhoBiJustino('/justino/operacao/permissoes'), 'permissoes');
});

test('Carolline lê só as chaves das áreas dela (e o apoio do RH)', () => {
  const pedidas = [
    'getEntries:rh',
    'getEmployees',
    'getDocumentacoes',
    'getManualPdfInfo',
    'getContatosEmergencia',
    'getRevenueOverview',
    'getEntries:financeiro',
    'getMkReunioes',
    'getEventos',
    'getAuditoriaOpItens',
  ];
  assert.deepEqual(filtrarChavesBiJustino(CAROLLINE, pedidas), [
    'getEntries:rh',
    'getEmployees',
    'getDocumentacoes',
    'getManualPdfInfo',
    'getContatosEmergencia',
    'getRevenueOverview',
    'getEntries:financeiro',
  ]);
  assert.deepEqual(filtrarChavesBiJustino(RENATO, pedidas), pedidas);
});
