const test = require('node:test');
const assert = require('node:assert/strict');
const { criarProxy } = require('../../services/biJustino/marketing/proxy');
const { ROTAS } = require('../../services/biJustino/areas/eventos');
const montar = require('../../routes/biJustinoAreas/eventos');
const { listarLeituras } = require('../../services/biJustino/espelho/catalogo');
const ev = require('../../services/biJustino/eventos/validacao');

const ACOES_TELA = [
  'saveEvento',
  'deleteEvento',
  'saveEventoTarefa',
  'deleteEventoTarefa',
  'concluirEventoTarefa',
  'saveEventoCotacao',
  'decideEventoCotacao',
  'saveEventoInteracao',
  'deleteEventoInteracao',
  'submitEventoCotacaoForApproval',
  'enviarContratoEventoCotacao',
];

function resFalsa() {
  const saida = { status: 200, body: null };
  return {
    saida,
    status(codigo) { saida.status = codigo; return this; },
    json(corpo) { saida.body = corpo; return this; },
  };
}

test('rotas de eventos cobrem as escritas da tela e recoletam só chaves do catálogo', () => {
  const conhecidas = new Set(listarLeituras().map((l) => l.chave));
  const porAcao = new Map(ROTAS.map((r) => [r.action, r]));
  for (const action of ACOES_TELA) {
    assert.ok(porAcao.has(action), `falta a ação ${action}`);
  }
  for (const rota of ROTAS) {
    assert.ok(!/^get/.test(rota.action), `${rota.caminho} não pode usar ação de leitura`);
    for (const chave of rota.recoletar || []) {
      assert.ok(conhecidas.has(chave), `${rota.caminho} recoleta chave fora do catálogo: ${chave}`);
    }
  }
  const caminhos = ROTAS.map((r) => r.caminho);
  assert.equal(new Set(caminhos).size, caminhos.length);
  assert.equal(porAcao.get('decideEventoCotacao').aprovacao, true);
  assert.equal(porAcao.get('enviarContratoEventoCotacao').aprovacao, true);
});

test('saveEvento exige data e cliente e devolve o id da planilha', async () => {
  assert.equal(ev.validarEvento({}).erro, 'data_invalida');
  const rota = ROTAS.find((r) => r.action === 'saveEvento');
  const chamadas = [];
  const handler = criarProxy({}, rota, {
    env: {},
    acesso: async () => true,
    gravar: async (_pool, _env, entrada) => {
      chamadas.push(entrada);
      return { ok: true, resposta: { ok: true, id: 'ev-9' } };
    },
  });
  const res = resFalsa();
  await handler({ user: { id: 3 }, body: { data: '2026-11-01', nomeCliente: ' ACME ' } }, res);
  assert.equal(res.saida.status, 200);
  assert.equal(res.saida.body.id, 'ev-9');
  assert.equal(chamadas[0].payload.nomeCliente, 'ACME');
  assert.deepEqual(chamadas[0].recoletar, ['getEventos']);
});

test('decidir cotação exige Diretoria; sem ela não grava', async () => {
  const router = montar({}, {
    acesso: async () => true,
    aprovacao: async () => false,
    gravar: async () => { throw new Error('não deveria gravar'); },
  });
  const camada = router.stack.find((l) => l.route && l.route.path === '/justino/eventos/cotacoes/decidir');
  const handler = camada.route.stack[0].handle;
  const res = resFalsa();
  await handler({ user: { id: 4 }, body: { id: 'cot-1', approve: true } }, res);
  assert.equal(res.saida.status, 403);
  assert.equal(res.saida.body.error, 'somente_diretoria');
});
