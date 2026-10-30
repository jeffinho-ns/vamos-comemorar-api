const test = require('node:test');
const assert = require('node:assert/strict');
const { criarProxy } = require('../../services/biJustino/marketing/proxy');
const { ROTAS } = require('../../routes/biJustinoAreas/marketing');
const { listarLeituras } = require('../../services/biJustino/espelho/catalogo');

const ACOES_TELA = [
  'saveMkReuniao',
  'deleteMkReuniao',
  'saveIgAtivacao',
  'deleteIgAtivacao',
  'decidirGoogleAvaliacao',
  'sugerirGoogleAvaliacao',
  'submitGoogleAvaliacoes',
  'atualizarInstagram',
  'atualizarBandRanking',
  'saveBandRanking',
];

function resFalsa() {
  const saida = { status: 200, body: null };
  return {
    saida,
    status(codigo) { saida.status = codigo; return this; },
    json(corpo) { saida.body = corpo; return this; },
  };
}

test('rotas de marketing cobrem as escritas da tela e recoletam só chaves do catálogo', () => {
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
});

test('saveMkReuniao grava payload validado e pede recoleta de getMkReunioes', async () => {
  const rota = ROTAS.find((r) => r.action === 'saveMkReuniao');
  const chamadas = [];
  const handler = criarProxy({}, rota, {
    env: {},
    acesso: async () => true,
    gravar: async (_pool, _env, entrada) => {
      chamadas.push(entrada);
      return { ok: true, resposta: { ok: true, id: 'dem-1' } };
    },
  });
  const res = resFalsa();
  await handler({ user: { id: 2 }, body: { titulo: ' Calendário de novembro ', tipo: 'demanda' } }, res);
  assert.equal(res.saida.status, 200);
  assert.equal(res.saida.body.id, 'dem-1');
  assert.equal(chamadas[0].action, 'saveMkReuniao');
  assert.equal(chamadas[0].payload.titulo, 'Calendário de novembro');
  assert.deepEqual(chamadas[0].recoletar, ['getMkReunioes']);
});

test('decidirGoogleAvaliacao recusa id inválido com 400 e acesso negado com 403', async () => {
  const rota = ROTAS.find((r) => r.action === 'decidirGoogleAvaliacao');
  const handler = criarProxy({}, rota, {
    env: {},
    acesso: async () => true,
    gravar: async () => { throw new Error('não deveria gravar'); },
  });
  const res = resFalsa();
  await handler({ user: { id: 1 }, body: { id: 'zz', status: 'publicada' } }, res);
  assert.equal(res.saida.status, 400);
  assert.equal(res.saida.body.error, 'id_invalido');

  const negado = criarProxy({}, rota, {
    env: {},
    acesso: async () => false,
    gravar: async () => { throw new Error('não deveria gravar'); },
  });
  const res2 = resFalsa();
  await negado({ user: { id: 1 }, body: { id: 'abc123', status: 'publicada', textoFinal: 'Olá!' } }, res2);
  assert.equal(res2.saida.status, 403);
  assert.equal(res2.saida.body.error, 'acesso_negado');
});
