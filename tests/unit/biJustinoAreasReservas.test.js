const test = require('node:test');
const assert = require('node:assert/strict');
const { criarProxy } = require('../../services/biJustino/marketing/proxy');
const { ROTAS } = require('../../services/biJustino/areas/reservas');
const montar = require('../../routes/biJustinoAreas/reservas');
const { listarLeituras } = require('../../services/biJustino/espelho/catalogo');
const reservas = require('../../services/biJustino/operacao/reservas');

const ACOES_TELA = [
  'submitReservationEntry',
  'submitReservationEntriesBatch',
  'updateReservationEntry',
  'deleteReservationEntry',
  'submitCrmReservas',
  'submitCrmFunil',
  'submitCrmConfig',
];

function resFalsa() {
  const saida = { status: 200, body: null };
  return {
    saida,
    status(codigo) { saida.status = codigo; return this; },
    json(corpo) { saida.body = corpo; return this; },
  };
}

test('rotas de reservas cobrem as escritas da tela e recoletam só chaves do catálogo', () => {
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

test('submitReservationEntry normaliza pax/hora e recoleta reservas', async () => {
  const ok = reservas.validarNova({
    date: '2026-10-30', pax: 0, tipo: 'vip', origem: 'instagram', ativacaoId: 'ig-1', hora: '20:30',
    nomeCliente: ' Ana ', convidados: ' b \n a ', clientRequestId: 'req-1',
  });
  assert.equal(ok.payload.pax, 1);
  assert.equal(ok.payload.tipo, 'normal');
  assert.equal(ok.payload.ativacaoId, 'ig-1');
  assert.equal(ok.payload.hora, '20:30');

  const rota = ROTAS.find((r) => r.action === 'submitReservationEntry');
  const chamadas = [];
  const handler = criarProxy({}, rota, {
    env: {},
    acesso: async () => true,
    gravar: async (_pool, _env, entrada) => {
      chamadas.push(entrada);
      return { ok: true, resposta: { ok: true, id: 'res-1' } };
    },
  });
  const res = resFalsa();
  await handler({ user: { id: 5 }, body: { date: '2026-10-30', pax: 4, nomeCliente: 'Ana', clientRequestId: 'req-1' } }, res);
  assert.equal(res.saida.status, 200);
  assert.equal(res.saida.body.id, 'res-1');
  assert.deepEqual(chamadas[0].recoletar, ['getReservationEntries', 'getReservations']);
});

test('CRM só a Diretoria grava; lote vazio devolve 400', async () => {
  const router = montar({}, {
    acesso: async () => true,
    aprovacao: async () => false,
    gravar: async () => { throw new Error('não deveria gravar'); },
  });
  const camada = router.stack.find((l) => l.route && l.route.path === '/justino/reservas/crm/reservas');
  const handler = camada.route.stack[0].handle;
  const res = resFalsa();
  await handler({ user: { id: 6 }, body: { rows: [{ id: 'a1' }] } }, res);
  assert.equal(res.saida.status, 403);
  assert.equal(res.saida.body.error, 'somente_diretoria');

  const lote = ROTAS.find((r) => r.action === 'submitReservationEntriesBatch');
  const hLote = criarProxy({}, lote, {
    env: {},
    acesso: async () => true,
    gravar: async () => { throw new Error('não deveria gravar'); },
  });
  const res2 = resFalsa();
  await hLote({ user: { id: 6 }, body: { items: [] } }, res2);
  assert.equal(res2.saida.status, 400);
  assert.equal(res2.saida.body.error, 'lote_vazio');
});
