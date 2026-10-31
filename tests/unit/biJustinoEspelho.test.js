const test = require('node:test');
const assert = require('node:assert/strict');
const { listarLeituras, leiturasPorRitmo, encontrarLeitura, fonteDaChave } = require('../../services/biJustino/espelho/catalogo');
const { coletarEspelho, emLotes, TAMANHO_LOTE } = require('../../services/biJustino/espelho/coletor');
const { gravarNaPlanilha } = require('../../services/biJustino/espelho/escrita');
const { docsDe, misturarMkPlans, misturarEntradasMarketing } = require('../../services/biJustino/espelho/leitura');

function storeFalso() {
  const gravados = [];
  return {
    gravados,
    ensureTable: async () => undefined,
    saveSnapshot: async (_pool, item) => { gravados.push(item); return item; },
    podar: async () => undefined,
  };
}

const ENV = { BI_APPS_SCRIPT_EMAIL: 'robo@x.com', BI_APPS_SCRIPT_PASSWORD: 'segredo' };

test('o catálogo cobre as leituras da planilha e as chaves são únicas', () => {
  const todas = listarLeituras();
  const chaves = todas.map((l) => l.chave);
  assert.equal(new Set(chaves).size, chaves.length);
  assert.ok(todas.length >= 50);
  assert.ok(todas.every((l) => /^get[A-Za-z0-9]+$/.test(l.action)));
  assert.ok(leiturasPorRitmo('rapido').length > 0 && leiturasPorRitmo('lento').length > 0);
  assert.equal(encontrarLeitura('getEntries:marketing').payload.area, 'marketing');
  assert.equal(fonteDaChave('getMkReunioes'), 'planilha:getMkReunioes');
});

test('o coletor divide em lotes abaixo do limite do Apps Script e grava cada ação pela chave', async () => {
  const store = storeFalso();
  const lotes = [];
  const readBootstrap = async (calls) => {
    lotes.push(calls.length);
    return calls.map((c) => ({ action: c.action, payload: c.payload, r: { ok: true, items: [c.action] } }));
  };
  const saida = await coletarEspelho({}, ENV, { store, readBootstrap, emit: false, chaves: ['getMkReunioes', 'getEntries:rh', 'getEntries:cmv'] });
  assert.equal(saida.gravadas, 3);
  assert.ok(lotes.every((n) => n <= TAMANHO_LOTE && TAMANHO_LOTE < 50));
  const fontes = store.gravados.map((g) => g.source).sort();
  assert.deepEqual(fontes, ['planilha:getEntries:cmv', 'planilha:getEntries:rh', 'planilha:getMkReunioes']);
  assert.equal(emLotes([1, 2, 3, 4, 5], 2).length, 3);
});

test('um lote que falha não derruba os outros e respostas recusadas não são gravadas', async () => {
  const store = storeFalso();
  let vez = 0;
  const readBootstrap = async (calls) => {
    vez += 1;
    if (vez === 1) throw Object.assign(new Error('timeout'), { code: 'timeout' });
    return calls.map((c, i) => ({ action: c.action, payload: c.payload, r: i === 0 ? { ok: false } : { ok: true } }));
  };
  const readActions = async (calls) => calls.map(() => ({ ok: true, food: {} }));
  const saida = await coletarEspelho({}, ENV, { store, readBootstrap, readActions, emit: false, modo: 'completo' });
  assert.equal(saida.falhas, 1);
  assert.ok(store.gravados.some((g) => g.source === 'planilha:get99Food'));
  assert.ok(saida.gravadas > 0);
  assert.ok(saida.gravadas < saida.pedidas);
});

test('sem credenciais o espelho não tenta ler', async () => {
  const saida = await coletarEspelho({}, {}, { store: storeFalso(), readBootstrap: async () => { throw new Error('nao'); } });
  assert.equal(saida.motivo, 'credenciais_ausentes');
});

test('a escrita recusa ações de leitura e bloqueadas, e recoleta as chaves afetadas', async () => {
  assert.equal((await gravarNaPlanilha({}, ENV, { action: 'getMkPlans' })).erro, 'acao_invalida');
  assert.equal((await gravarNaPlanilha({}, ENV, { action: 'deleteUser' })).erro, 'acao_invalida');
  const recoletadas = [];
  const r = await gravarNaPlanilha({}, ENV, { action: 'saveMkReuniao', payload: { titulo: 'x' }, recoletar: ['getMkReunioes'] }, {
    readAction: async (action, _env, _f, payload) => ({ ok: true, action, payload }),
    coletar: async (_pool, _env, opts) => { recoletadas.push(...opts.chaves); },
  });
  assert.equal(r.ok, true);
  assert.deepEqual(recoletadas, ['getMkReunioes']);
  const falha = await gravarNaPlanilha({}, ENV, { action: 'saveMkReuniao' }, {
    readAction: async () => { throw Object.assign(new Error('x'), { code: 'forbidden' }); },
    coletar: async () => undefined,
  });
  assert.equal(falha.erro, 'forbidden');
});

test('misturarMkPlans usa o revenuePlan da planilha, o Zig se o espelho veio vazio, e o snapshot local vence a data', () => {
  assert.deepEqual(docsDe({ ok: true, docs: [{ date: '2026-10-30' }] }).map((d) => d.date), ['2026-10-30']);
  assert.deepEqual(docsDe({ mkPlans: [{ date: '2026-10-01' }] }).map((d) => d.date), ['2026-10-01']);
  const doZig = misturarMkPlans(null, null, { mkPlans: [{ date: '2026-10-30', publicPlan: 100, ticketPlan: 130, revenuePlan: 13000 }] });
  assert.equal(doZig.docs[0].revenuePlan, 13000);
  const localVence = misturarMkPlans(
    { docs: [{ date: '2026-10-30', publicPlan: 10, ticketPlan: 10, revenuePlan: 100 }] },
    { docs: [{ date: '2026-10-30', publicPlan: 300, ticketPlan: 130, revenuePlan: 39000 }] },
    null,
  );
  assert.equal(localVence.docs[0].revenuePlan, 39000);
});

test('misturarEntradasMarketing junta Zig, espelho e envio local pela data', () => {
  const r = misturarEntradasMarketing(
    { docs: [{ date: '2026-10-29', values: { mkTraffic: 1 } }] },
    { docs: [{ date: '2026-10-30', values: { mkTraffic: 9, mkShow: 10, mkWalkins: 0, mkTicket: 100 } }] },
    { lancamentos: { marketing: [{ date: '2026-10-28', mkTraffic: 2, mkShow: 5, mkTicket: 80 }] } },
  );
  assert.equal(r.docs.length, 3);
  assert.equal(r.docs[0].date, '2026-10-30');
  assert.equal(r.docs[0].values.mkTraffic, 9);
  assert.equal(r.docs[2].values.mkTraffic, 2);
});
