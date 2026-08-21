'use strict';

/**
 * Regras do fluxo Isa: Abertura → Checklist → NÃO OK → evidência → ocorrência → tarefa.
 * Rodar: node --test tests/justino360ChecklistFlow.test.js
 */
const {
  validateAnswer,
  registerNonConformity,
  syncRunStatus,
} = require('../services/justino360/checklistFlow');

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

// ---------- validateAnswer ----------
assert(validateAnswer({ status: 'ok' }) === null, 'OK não exige observação');
assert(validateAnswer({ status: 'na' }) === null, 'N/A não exige observação');
assert(
  validateAnswer({ status: 'nao_ok', observation: '' })?.status === 400,
  'NÃO OK sem observação deve ser recusado'
);
assert(
  validateAnswer({ status: 'nao_ok', observation: 'ab' })?.status === 400,
  'Observação curta deve ser recusada'
);
assert(
  validateAnswer({ status: 'nao_ok', observation: 'câmara fria a 12°C' }) === null,
  'NÃO OK com observação passa quando foto não é obrigatória'
);
assert(
  validateAnswer({ status: 'nao_ok', observation: 'câmara fria a 12°C', requiresPhoto: true })
    ?.status === 400,
  'Item com foto obrigatória exige evidência'
);
assert(
  validateAnswer({
    status: 'nao_ok',
    observation: 'câmara fria a 12°C',
    requiresPhoto: true,
    evidenceUrl: 'https://firebasestorage.example/j360/foto.jpg',
  }) === null,
  'Evidência satisfaz o item com foto obrigatória'
);

// ---------- registerNonConformity ----------
function fakeClient(script) {
  const calls = [];
  return {
    calls,
    async query(sql, params) {
      calls.push({ sql: sql.replace(/\s+/g, ' ').trim(), params });
      const handler = script.find((s) => s.match.test(sql));
      return handler ? handler.result : { rows: [] };
    },
  };
}

const baseParams = {
  establishmentId: 1,
  runItemId: 10,
  sectorId: 3,
  itemTitle: 'Temperatura das câmaras frias registrada',
  observation: 'Câmara a 12°C',
  evidenceUrl: 'https://firebasestorage.example/j360/foto.jpg',
  priority: 'alta',
  assignedTo: null,
  dueAt: null,
  actorId: 42,
  createTask: true,
};

(async () => {
  // Primeira resposta: cria ocorrência e tarefa.
  const novo = fakeClient([
    { match: /SELECT \* FROM j360_incidents/, result: { rows: [] } },
    { match: /INSERT INTO j360_incidents/, result: { rows: [{ id: 100, status: 'aberta' }] } },
    { match: /SELECT \* FROM j360_tasks/, result: { rows: [] } },
    { match: /INSERT INTO j360_tasks/, result: { rows: [{ id: 200, status: 'aberta' }] } },
  ]);
  const criado = await registerNonConformity(novo, baseParams);
  assert(criado.incident.id === 100, 'deve criar ocorrência');
  assert(criado.task.id === 200, 'deve criar tarefa');

  // Reresposta do mesmo item: atualiza, não duplica.
  const existente = fakeClient([
    { match: /SELECT \* FROM j360_incidents/, result: { rows: [{ id: 100 }] } },
    { match: /UPDATE j360_incidents/, result: { rows: [{ id: 100, status: 'aberta' }] } },
    { match: /SELECT \* FROM j360_tasks/, result: { rows: [{ id: 200 }] } },
  ]);
  const reaproveitado = await registerNonConformity(existente, baseParams);
  assert(reaproveitado.incident.id === 100, 'deve reutilizar ocorrência');
  assert(reaproveitado.task.id === 200, 'deve reutilizar tarefa');
  assert(
    !existente.calls.some((c) => /INSERT INTO j360_incidents/.test(c.sql)),
    'não deve inserir ocorrência duplicada'
  );
  assert(
    !existente.calls.some((c) => /INSERT INTO j360_tasks/.test(c.sql)),
    'não deve inserir tarefa duplicada'
  );

  // create_task = false: só ocorrência.
  const semTarefa = fakeClient([
    { match: /SELECT \* FROM j360_incidents/, result: { rows: [] } },
    { match: /INSERT INTO j360_incidents/, result: { rows: [{ id: 101 }] } },
  ]);
  const soOcorrencia = await registerNonConformity(semTarefa, {
    ...baseParams,
    createTask: false,
  });
  assert(soOcorrencia.task === null, 'não deve criar tarefa quando desligado');

  // ---------- syncRunStatus ----------
  const semPendentes = fakeClient([
    { match: /SELECT COUNT\(\*\)/, result: { rows: [{ c: 0 }] } },
    { match: /UPDATE j360_checklist_runs/, result: { rows: [{ status: 'concluido' }] } },
  ]);
  const concluido = await syncRunStatus(semPendentes, {
    runId: 5,
    currentStatus: 'em_andamento',
    actorId: 42,
  });
  assert(concluido.runStatus === 'concluido', 'sem pendentes conclui a execução');

  const reaberto = fakeClient([
    { match: /SELECT COUNT\(\*\)/, result: { rows: [{ c: 2 }] } },
    { match: /UPDATE j360_checklist_runs/, result: { rows: [{ status: 'em_andamento' }] } },
  ]);
  const voltou = await syncRunStatus(reaberto, {
    runId: 5,
    currentStatus: 'concluido',
    actorId: 42,
  });
  assert(voltou.runStatus === 'em_andamento', 'item reaberto reabre a execução');

  const emAndamento = fakeClient([
    { match: /SELECT COUNT\(\*\)/, result: { rows: [{ c: 3 }] } },
  ]);
  const segue = await syncRunStatus(emAndamento, {
    runId: 5,
    currentStatus: 'em_andamento',
    actorId: 42,
  });
  assert(segue.runStatus === 'em_andamento', 'com pendentes segue em andamento');
  assert(
    !emAndamento.calls.some((c) => /UPDATE j360_checklist_runs/.test(c.sql)),
    'não deve atualizar execução sem necessidade'
  );

  console.log('justino360ChecklistFlow: ok');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
