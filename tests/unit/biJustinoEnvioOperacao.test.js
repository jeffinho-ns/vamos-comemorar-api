const test = require('node:test');
const assert = require('node:assert/strict');
const { validarEnvioOperacao, juntarOperacao, gravarEnvioOperacao, aplicarEnvioOperacao } = require('../../services/biJustino/envioOperacao');
const { projecaoConsolidada } = require('../../services/biJustino/projecaoConsolidada');

test('o envio da operação exige data, nome e pelo menos um valor', () => {
  const vazio = validarEnvioOperacao({
    date: '2026-10-30',
    submittedByName: 'Ana',
    opPublic: 0,
    opLoss: 0,
    opMaintenance: 0,
    opDisposableReq: 0,
  }, new Date('2026-10-30T15:00:00Z'));
  assert.equal(vazio.erro, 'registro_em_branco');
  const ok = validarEnvioOperacao({
    date: '2026-10-30',
    submittedByName: 'Ana',
    opPublic: '2.716',
    opLoss: '150,50',
    opMaintenance: 0,
    opDisposableReq: 0,
    opIncidents: 'Fila no bar',
  }, new Date('2026-10-30T15:00:00Z'));
  assert.equal(ok.erro, undefined);
  assert.equal(ok.doc.values.opPublic, 2716);
  assert.equal(ok.doc.values.opLoss, 150.5);
  assert.equal(ok.doc.notes.opIncidents, 'Fila no bar');
});

test('o envio local substitui o mesmo dia da planilha e entra nas contas', async () => {
  assert.deepEqual(juntarOperacao(
    [{ date: '2026-10-29', opLoss: 10 }, { date: '2026-10-30', opLoss: 1 }],
    [{ date: '2026-10-30', values: { opLoss: 80, opMaintenance: 20, opPublic: 100, opDisposableReq: 0 } }],
  )[0].opLoss, 80);
  let gravou = null;
  let chamouPlanilha = false;
  const resultado = await gravarEnvioOperacao(null, {
    date: '2026-10-30',
    submittedByName: 'Gerente',
    opPublic: 10,
    opLoss: 5,
    opMaintenance: 0,
    opDisposableReq: 0,
  }, {
    agora: () => new Date('2026-10-30T15:00:00Z'),
    emit: false,
    store: {
      latestPayload: async () => null,
      saveSnapshot: async (_pool, body) => {
        gravou = body;
        return { id: 1 };
      },
    },
    readAction: async () => {
      chamouPlanilha = true;
      const error = new Error('login_recusado');
      throw error;
    },
  });
  assert.equal(resultado.ok, true);
  assert.equal(resultado.planilha, false);
  assert.equal(chamouPlanilha, true);
  assert.equal(gravou.source, 'envio_operacao');
  assert.equal(gravou.payload.docs[0].values.opLoss, 5);
  assert.equal(JSON.stringify(gravou).includes('@'), false);
  const aplicado = aplicarEnvioOperacao({
    monthRevenue: 100000,
    lancamentos: { operacao: [{ date: '2026-10-29', opLoss: 1, opMaintenance: 0 }] },
    projecao: { areas: [{ label: 'antigo' }] },
  }, gravou.payload);
  assert.equal(aplicado.projecao, undefined);
  const conta = projecaoConsolidada({
    faturamento: 100000,
    operacao: { docs: aplicado.lancamentos.operacao.map((linha) => ({ date: linha.date, values: linha })) },
    agora: new Date('2026-10-30T15:00:00Z'),
  });
  const operacao = conta.areas.find((area) => area.chave === 'op');
  assert.equal(operacao.real, 5);
  assert.equal(operacao.usandoReferencia, false);
});
