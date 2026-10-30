const test = require('node:test');
const assert = require('node:assert/strict');
const montar = require('../../routes/biJustinoAreas/financeiro');
const { ROTAS_ESCRITA, RECOLETA_ENVIO, AREAS_MES } = require('../../routes/biJustinoAreas/financeiro');
const { validarEnvio, validarFechamento, validarApagar } = require('../../services/biJustino/financeiro/envioMensal');
const { validarCmvTeoricoParcial, validarItensVendidos } = require('../../services/biJustino/cmv/robo');
const { validarColaborador, validarApagarColaborador } = require('../../services/biJustino/rh/colaborador');
const { validarQuadroMinimo, validarDecisaoFreelancers } = require('../../services/biJustino/rh/quadroMinimo');
const { encontrarLeitura, listarLeituras } = require('../../services/biJustino/espelho/catalogo');

function caminhosDoRouter(router) {
  return router.stack.filter((layer) => layer.route).map((layer) => layer.route.path).sort();
}

test('router registra um POST para cada rota de escrita do contrato', () => {
  const registrados = caminhosDoRouter(montar({}));
  const esperados = ROTAS_ESCRITA.map((r) => r.caminho).sort();
  assert.deepEqual(registrados, esperados);
  ROTAS_ESCRITA.forEach((r) => {
    assert.equal(typeof r.action, 'string');
    assert.ok(r.action.length > 0);
    assert.ok(Array.isArray(r.recoletar));
  });
});

test('recoleta do envio e fechamento bate com o catálogo do espelho', () => {
  assert.deepEqual(RECOLETA_ENVIO.financeiro, ['getEntries:financeiro', 'getRevenueOverview']);
  assert.deepEqual(RECOLETA_ENVIO.rh, ['getEntries:rh']);
  assert.deepEqual(RECOLETA_ENVIO.cmv, ['getEntries:cmv']);
  assert.deepEqual(AREAS_MES, ['financeiro', 'rh', 'cmv']);
  const chaves = new Set(listarLeituras().map((item) => item.chave));
  ROTAS_ESCRITA.forEach((r) => {
    r.recoletar.forEach((chave) => {
      if (chave.includes(':YYYY-MM')) return;
      assert.ok(chaves.has(chave) || encontrarLeitura(chave), `chave ausente no catálogo: ${chave}`);
    });
  });
});

test('submitEntry financeiro/rh/cmv valida payload e ação da planilha', () => {
  const fin = validarEnvio('financeiro', { date: '2026-10', values: { fnRent: 51613 }, submittedByName: 'Ana' });
  assert.equal(fin.ok, true);
  assert.equal(fin.payload.area, 'financeiro');
  assert.equal(fin.payload.date, '2026-10-01');
  const rh = validarEnvio('rh', { date: '2026-10-17', values: { rhCore: '104.744,00', rhHead: 42 } });
  assert.equal(rh.ok, true);
  assert.equal(rh.payload.date, '2026-10-01');
  assert.equal(rh.payload.values.rhCore, 104744);
  const cmv = validarEnvio('cmv', { date: '2026-10-17', values: { cmvSales: 1000 }, notes: { cmvNote: 'ok' } });
  assert.equal(cmv.ok, true);
  assert.equal(cmv.payload.date, '2026-10-17');
});

test('closeMonth/reopenMonth financeiro, rh e cmv', () => {
  assert.equal(validarFechamento('financeiro', { acao: 'fechar', monthKey: '2026-09' }).action, 'closeMonth');
  assert.equal(validarFechamento('rh', { acao: 'reabrir', monthKey: '2026-09' }).action, 'reopenMonth');
  const cmv = validarFechamento('cmv', { acao: 'fechar', monthKey: '2026-09' });
  assert.equal(cmv.ok, true);
  assert.deepEqual(cmv.payload, { area: 'cmv', monthKey: '2026-09' });
});

test('deleteEntry, colaborador, quadro mínimo e decisão de freelancer', () => {
  assert.deepEqual(validarApagar('financeiro', { dates: ['2026-10-01'] }).datas, ['2026-10-01']);
  const colab = validarColaborador({ nome: 'João', cargo: 'bar', nivel: 'pleno', contratacao: 'CLT', mesReferencia: '2026-10' });
  assert.equal(colab.ok, true);
  assert.equal(validarApagarColaborador({ id: 'abc' }).payload.id, 'abc');
  const quadro = validarQuadroMinimo({ rows: [{ sector: 'bar', atendimentoPorPessoa: 20, brigadaPadrao: 3 }] });
  assert.equal(quadro.ok, true);
  const dec = validarDecisaoFreelancers({ ids: ['p1'], approve: true });
  assert.equal(dec.ok, true);
  assert.equal(dec.payload.approve, true);
});

test('robô CMV: teórico parcial e ranking de itens vendidos', () => {
  const parcial = validarCmvTeoricoParcial({ date: '2026-10-17', custoFoodTeorico: 100, valorCobertoFood: 500, valorTotalFood: 800 });
  assert.equal(parcial.ok, true);
  assert.equal(parcial.payload.source, 'robo-zigpay');
  const itens = validarItensVendidos({
    date: '2026-10-17',
    items: [{ nome: 'Chopp', tipo: 'bebida', quantidade: 10, valorTotal: 150 }],
  });
  assert.equal(itens.ok, true);
  assert.equal(itens.payload.items.length, 1);
});
