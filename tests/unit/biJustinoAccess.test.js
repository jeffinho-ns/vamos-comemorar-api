'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  isBiJustinoEmail,
  paginasBiJustino,
  podePaginaBiJustino,
  areaDoCaminhoBiJustino,
  filtrarChavesBiJustino,
  canReadBiJustino,
  canReadBiJustinoArea,
} = require('../../services/biJustino/access');

const CAROLLINE = 'carolline.moreira@ideiaum.com.br';
const MENDA = 'gabrielmenda@ideiaum.com.br';
const GERENTE = 'gerente.sjm@seujustino.com.br';
const RENATO = 'renatocury@ideiaum.com.br';

test('Renato, Paula, Luis Felipe, Menda e Carolline leem o BI', () => {
  assert.equal(isBiJustinoEmail('renatocury@ideiaum.com.br'), true);
  assert.equal(isBiJustinoEmail(' Renato@SeuJustino.com.br '), true);
  assert.equal(isBiJustinoEmail('coordenadora.reservas@ideiaum.com.br'), true);
  assert.equal(isBiJustinoEmail('luisfelipe@ideiaum.com.br'), true);
  assert.equal(isBiJustinoEmail('gabrielmenda@ideiaum.com.br'), true);
  assert.equal(isBiJustinoEmail(CAROLLINE), true);
  assert.equal(isBiJustinoEmail(GERENTE), true);
});

test('promoter e cliente com nome parecido ficam de fora', () => {
  assert.equal(isBiJustinoEmail('renato@ideiaum.com.br'), false);
  assert.equal(isBiJustinoEmail('garciabrangi@gmail.com'), false);
  assert.equal(isBiJustinoEmail('paula@reservas.com.br'), false);
  assert.equal(isBiJustinoEmail(''), false);
});

test('Carolline vê todo o BI menos a Diretoria', () => {
  assert.deepEqual(paginasBiJustino(CAROLLINE), [
    'operacao', 'marketing', 'financeiro', 'rh', 'cmv', 'eventos', 'reservas',
    'auditoriaop', 'auditoria', 'documentos', 'manual', 'contatos',
  ]);
  assert.equal(podePaginaBiJustino(CAROLLINE, 'master'), false);
  assert.equal(podePaginaBiJustino(CAROLLINE, 'operacao'), true);
  assert.equal(podePaginaBiJustino(CAROLLINE, 'marketing'), true);
  assert.equal(podePaginaBiJustino(CAROLLINE, 'financeiro'), true);
  assert.equal(podePaginaBiJustino(CAROLLINE, 'rh'), true);
  assert.equal(podePaginaBiJustino(CAROLLINE, 'cmv'), true);
  assert.equal(podePaginaBiJustino(CAROLLINE, 'eventos'), true);
  assert.equal(podePaginaBiJustino(CAROLLINE, 'reservas'), true);
  assert.equal(podePaginaBiJustino(CAROLLINE, 'auditoriaop'), true);
  assert.equal(podePaginaBiJustino(CAROLLINE, 'auditoria'), true);
  assert.equal(podePaginaBiJustino(CAROLLINE, 'documentos'), true);
  assert.equal(podePaginaBiJustino(CAROLLINE, 'manual'), true);
  assert.equal(podePaginaBiJustino(CAROLLINE, 'contatos'), true);
});

test('Menda só vê Marketing, Eventos, Reservas, Documentos, Manual e Contatos', () => {
  assert.deepEqual(paginasBiJustino(MENDA), [
    'marketing', 'eventos', 'reservas', 'documentos', 'manual', 'contatos',
  ]);
  assert.equal(podePaginaBiJustino(MENDA, 'marketing'), true);
  assert.equal(podePaginaBiJustino(MENDA, 'eventos'), true);
  assert.equal(podePaginaBiJustino(MENDA, 'reservas'), true);
  assert.equal(podePaginaBiJustino(MENDA, 'documentos'), true);
  assert.equal(podePaginaBiJustino(MENDA, 'manual'), true);
  assert.equal(podePaginaBiJustino(MENDA, 'contatos'), true);
  assert.equal(podePaginaBiJustino(MENDA, 'master'), false);
  assert.equal(podePaginaBiJustino(MENDA, 'operacao'), false);
  assert.equal(podePaginaBiJustino(MENDA, 'financeiro'), false);
  assert.equal(podePaginaBiJustino(MENDA, 'rh'), false);
  assert.equal(podePaginaBiJustino(MENDA, 'cmv'), false);
  assert.equal(podePaginaBiJustino(MENDA, 'auditoriaop'), false);
  assert.equal(podePaginaBiJustino(MENDA, 'auditoria'), false);
});

test('Menda lê as chaves das áreas dele e não as da Diretoria, RH ou auditoria', () => {
  const pedidas = [
    'getMkPlans',
    'getEventos',
    'getReservations',
    'getDocumentacoes',
    'getManualPdfInfo',
    'getContatosEmergencia',
    'getRevenueOverview',
    'getEmployees',
    'getSalaries',
    'getAuditLog',
    'getAuditoriaOpItens',
    'getEntries:cmv',
    'getCmvTeoricoParcial',
  ];
  assert.deepEqual(filtrarChavesBiJustino(MENDA, pedidas), [
    'getMkPlans',
    'getEventos',
    'getReservations',
    'getDocumentacoes',
    'getManualPdfInfo',
    'getContatosEmergencia',
    'getRevenueOverview',
    'getEntries:cmv',
  ]);
});

test('gerente do Seu Justino só vê Operação, Documentos, Manual e Contatos', () => {
  assert.deepEqual(paginasBiJustino(GERENTE), ['operacao', 'documentos', 'manual', 'contatos']);
  assert.equal(podePaginaBiJustino(GERENTE, 'operacao'), true);
  assert.equal(podePaginaBiJustino(GERENTE, 'documentos'), true);
  assert.equal(podePaginaBiJustino(GERENTE, 'manual'), true);
  assert.equal(podePaginaBiJustino(GERENTE, 'contatos'), true);
  assert.equal(podePaginaBiJustino(GERENTE, 'master'), false);
  assert.equal(podePaginaBiJustino(GERENTE, 'marketing'), false);
  assert.equal(podePaginaBiJustino(GERENTE, 'financeiro'), false);
  assert.equal(podePaginaBiJustino(GERENTE, 'rh'), false);
  assert.equal(podePaginaBiJustino(GERENTE, 'cmv'), false);
  assert.equal(podePaginaBiJustino(GERENTE, 'eventos'), false);
  assert.equal(podePaginaBiJustino(GERENTE, 'reservas'), false);
  assert.equal(podePaginaBiJustino(GERENTE, 'auditoriaop'), false);
  assert.equal(podePaginaBiJustino(GERENTE, 'auditoria'), false);
});

test('gerente lê a operação e os documentos, e não o financeiro nem a auditoria', () => {
  const pedidas = [
    'getEntries:operacao',
    'getMeterReadings',
    'getDocumentacoes',
    'getManualPdfInfo',
    'getContatosEmergencia',
    'getEmployees',
    'getSalaries',
    'getRevenueOverview',
    'getAuditLog',
    'getEntries:financeiro',
  ];
  assert.deepEqual(filtrarChavesBiJustino(GERENTE, pedidas), [
    'getEntries:operacao',
    'getMeterReadings',
    'getDocumentacoes',
    'getManualPdfInfo',
    'getContatosEmergencia',
    'getEmployees',
  ]);
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

test('Carolline lê as áreas abertas e continua sem a Diretoria', () => {
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
    'getDreParaMes:2026-11',
    'getCmvTeoricoParcial',
    'getAuditLog',
  ];
  assert.deepEqual(filtrarChavesBiJustino(CAROLLINE, pedidas), pedidas);
  assert.equal(podePaginaBiJustino(CAROLLINE, 'master'), false);
  assert.deepEqual(filtrarChavesBiJustino(RENATO, pedidas), pedidas);
});

test('paginas e chaves do UEP prevalecem sobre o recorte de e-mail', () => {
  assert.deepEqual(paginasBiJustino(MENDA, ['operacao', 'cmv']), ['operacao', 'cmv']);
  assert.equal(podePaginaBiJustino(MENDA, 'operacao', ['operacao', 'cmv']), true);
  assert.equal(podePaginaBiJustino(MENDA, 'marketing', ['operacao', 'cmv']), false);
  assert.deepEqual(
    filtrarChavesBiJustino(MENDA, ['getEntries:operacao', 'getMkPlans', 'getCmvTeoricoParcial'], ['operacao', 'cmv']),
    ['getEntries:operacao', 'getCmvTeoricoParcial'],
  );
});

function poolUep(row) {
  return {
    async query(sql) {
      if (/FROM users/i.test(sql)) {
        return { rows: [{ email: 'colaborador@seujustino.test', is_super_admin: false }] };
      }
      if (/user_establishment_permissions/i.test(sql)) {
        return { rows: row ? [row] : [] };
      }
      throw new Error(`query inesperada: ${sql}`);
    },
  };
}

test('canReadBiJustino libera UEP com bi-justino e páginas, mesmo fora da allowlist', async () => {
  const user = { id: 44, email: 'colaborador@seujustino.test' };
  const pool = poolUep({
    menu_access: ['bi-justino'],
    bi_menu_access: ['marketing', 'eventos'],
  });
  assert.equal(await canReadBiJustino(pool, user), true);
  assert.equal(await canReadBiJustinoArea(pool, user, 'marketing'), true);
  assert.equal(await canReadBiJustinoArea(pool, user, 'master'), false);
});

test('canReadBiJustino nega UEP com bi-justino mas sem páginas', async () => {
  const user = { id: 45, email: 'colaborador@seujustino.test' };
  const pool = poolUep({ menu_access: ['bi-justino'], bi_menu_access: [] });
  assert.equal(await canReadBiJustino(pool, user), false);
});

test('canReadBiJustino Area usa fallback de e-mail quando não há páginas UEP', async () => {
  const user = { id: 7, email: MENDA };
  const pool = poolUep(null);
  assert.equal(await canReadBiJustino(pool, user), true);
  assert.equal(await canReadBiJustinoArea(pool, user, 'marketing'), true);
  assert.equal(await canReadBiJustinoArea(pool, user, 'master'), false);
});
