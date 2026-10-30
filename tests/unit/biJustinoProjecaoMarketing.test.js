const test = require('node:test');
const assert = require('node:assert/strict');
const {
  validarProjecao,
  aplicarProjecaoMarketing,
  compactMkPlans,
  gravarProjecaoMarketing,
  apagarProjecaoMarketing,
} = require('../../services/biJustino/projecaoMarketing');

function storeFalso(inicial) {
  const gravados = [];
  return {
    gravados,
    latestPayload: async () => (inicial ? { payload: inicial } : null),
    saveSnapshot: async (_pool, item) => { gravados.push(item); return item; },
  };
}

test('a projeção exige data e algum valor, e calcula o faturamento projetado', () => {
  assert.equal(validarProjecao({ date: '2026-11-05' }).erro, 'projecao_em_branco');
  assert.equal(validarProjecao({ date: 'ontem', publicPlan: 10 }).erro, 'data_invalida');
  const ok = validarProjecao({ date: '2026-11-05', trafficPlan: '1.200,50', publicPlan: 300, ticketPlan: '130' });
  assert.equal(ok.doc.trafficPlan, 1200.5);
  assert.equal(ok.doc.revenuePlan, 39000);
});

test('a projeção local vence a da planilha na mesma data e some quando apagada', () => {
  const payload = aplicarProjecaoMarketing(
    { mkPlans: compactMkPlans({ docs: [{ date: '2026-11-05', publicPlan: 100, ticketPlan: 100 }, { date: '2026-11-06', publicPlan: 50, ticketPlan: 100 }] }) },
    { docs: [{ date: '2026-11-05', publicPlan: 300, ticketPlan: 130 }], removidos: ['2026-11-06'] },
  );
  assert.equal(payload.mkPlans.length, 1);
  assert.equal(payload.mkPlans[0].revenuePlan, 39000);
});

test('gravar guarda no banco mesmo se a planilha falhar', async () => {
  const store = storeFalso(null);
  const r = await gravarProjecaoMarketing({}, { date: '2026-11-05', publicPlan: 300, ticketPlan: 130 }, {
    store,
    emit: false,
    readAction: async () => { throw new Error('offline'); },
    agora: () => new Date('2026-10-30T18:00:00Z'),
  });
  assert.equal(r.ok, true);
  assert.equal(r.planilha, false);
  assert.equal(store.gravados[0].payload.docs[0].revenuePlan, 39000);
});

test('apagar tira do banco e marca a data pra coleta não trazer de volta', async () => {
  const store = storeFalso({ docs: [{ date: '2026-11-05', publicPlan: 300, ticketPlan: 130 }], removidos: [] });
  const r = await apagarProjecaoMarketing({}, { date: '2026-11-05' }, { store, emit: false, readAction: async () => ({ ok: true }) });
  assert.equal(r.planilha, true);
  assert.deepEqual(store.gravados[0].payload.docs, []);
  assert.deepEqual(store.gravados[0].payload.removidos, ['2026-11-05']);
});
