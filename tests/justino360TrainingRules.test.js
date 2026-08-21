'use strict';

/**
 * Regras de treinamento: validade (validity_days), reciclagem e reatribuição.
 * Rodar: node --test tests/justino360TrainingRules.test.js
 */
const {
  pickRoleKey,
  pickStatus,
  parseValidityDays,
  computeExpiresAt,
  isExpired,
  effectiveStatus,
  daysUntilExpiry,
  resolveAssignAction,
  progressRate,
  summarizeAssignments,
} = require('../services/justino360/trainingRules');

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const DAY = 24 * 60 * 60 * 1000;
const agora = new Date('2026-08-20T12:00:00.000Z');

// ---------- whitelists ----------
assert(pickRoleKey('garcom').value === 'garcom', 'função válida passa');
assert(pickRoleKey('GARCOM').value === 'garcom', 'função é normalizada para minúscula');
assert(pickRoleKey('').value === null, 'vazio significa curso geral');
assert(pickRoleKey('dono-do-bar').ok === false, 'função fora da lista é recusada');
assert(pickStatus('vencido').value === 'vencido', 'situação válida passa');
assert(pickStatus('sumido').ok === false, 'situação fora da lista é recusada');

// ---------- validity_days ----------
assert(parseValidityDays(undefined).value === null, 'sem validade = curso sem reciclagem');
assert(parseValidityDays('365').value === 365, 'string numérica do form é aceita');
assert(parseValidityDays(0).ok === false, 'zero dia não é validade válida');
assert(parseValidityDays(-30).ok === false, 'validade negativa é recusada');
assert(parseValidityDays(1.5).ok === false, 'validade fracionada é recusada');
assert(parseValidityDays(99999).ok === false, 'validade acima do teto é recusada');

// ---------- computeExpiresAt ----------
assert(computeExpiresAt(agora, null) === null, 'curso sem validade não expira');
const vence = computeExpiresAt(agora, 180);
assert(
  vence.getTime() === agora.getTime() + 180 * DAY,
  'expires_at deve ser a conclusão + validity_days'
);
assert(computeExpiresAt('data-invalida', 30) === null, 'conclusão inválida não gera validade');

// ---------- isExpired / daysUntilExpiry ----------
assert(isExpired(null, agora) === false, 'sem expires_at nunca está vencido');
assert(isExpired(new Date(agora.getTime() - DAY), agora) === true, 'validade de ontem venceu');
assert(isExpired(new Date(agora.getTime() + DAY), agora) === false, 'validade de amanhã está em dia');
assert(isExpired(agora, agora) === true, 'validade exatamente hoje conta como vencida');
assert(daysUntilExpiry(new Date(agora.getTime() + 10 * DAY), agora) === 10, 'faltam 10 dias');
assert(daysUntilExpiry(new Date(agora.getTime() - 5 * DAY), agora) === -5, 'venceu há 5 dias');
assert(daysUntilExpiry(null, agora) === null, 'sem validade não tem contagem');

// ---------- effectiveStatus ----------
assert(
  effectiveStatus({ status: 'concluido', expires_at: null }, agora) === 'concluido',
  'conclusão sem validade segue concluída'
);
assert(
  effectiveStatus(
    { status: 'concluido', expires_at: new Date(agora.getTime() - DAY) },
    agora
  ) === 'vencido',
  'conclusão com validade estourada aparece como vencida'
);
assert(
  effectiveStatus({ status: 'pendente', expires_at: null }, agora) === 'pendente',
  'pendente continua pendente'
);

// ---------- resolveAssignAction ----------
assert(resolveAssignAction(null) === 'create', 'quem nunca teve atribuição recebe uma nova');
assert(
  resolveAssignAction({ status: 'pendente' }, { now: agora }) === 'reset',
  'pendente é reatribuído'
);
assert(
  resolveAssignAction(
    { status: 'concluido', expires_at: new Date(agora.getTime() + 30 * DAY) },
    { now: agora }
  ) === 'keep',
  'conclusão em dia preserva o histórico da pessoa'
);
assert(
  resolveAssignAction(
    { status: 'concluido', expires_at: new Date(agora.getTime() - DAY) },
    { now: agora }
  ) === 'reset',
  'conclusão vencida entra em reciclagem'
);
assert(
  resolveAssignAction(
    { status: 'concluido', expires_at: new Date(agora.getTime() + 30 * DAY) },
    { now: agora, force: true }
  ) === 'reset',
  'gestão pode forçar reciclagem de quem está em dia'
);
assert(
  resolveAssignAction({ status: 'vencido' }, { now: agora }) === 'reset',
  'atribuição vencida volta para pendente'
);

// ---------- progressRate ----------
assert(progressRate(0, 0) === 0, 'curso sem atribuição tem 0%');
assert(progressRate(4, 1) === 25, '1 de 4 é 25%');
assert(progressRate(3, 3) === 100, 'todos concluídos é 100%');
assert(progressRate(3, 5) === 100, 'não passa de 100% com dado inconsistente');

// ---------- summarizeAssignments ----------
const resumo = summarizeAssignments([
  { status: 'concluido' },
  { status: 'concluido' },
  { status: 'vencido' },
  { status: 'pendente' },
]);
assert(resumo.assigned_count === 4, 'conta todas as atribuições');
assert(resumo.completed_count === 2, 'conta as conclusões');
assert(resumo.expired_count === 1, 'conta as vencidas');
assert(resumo.pending_count === 1, 'pendente = total - concluídas - vencidas');
assert(resumo.completion_rate === 50, '2 de 4 é 50%');
assert(summarizeAssignments().assigned_count === 0, 'curso sem atribuição não quebra');

// ---------- assignUsers (orquestração, sem banco) ----------
const { assignUsers } = require('../services/justino360/trainingRepository');

/** Pool falso: responde por regex, no estilo do teste do fluxo de checklist. */
function fakePool(script) {
  const calls = [];
  const client = {
    async query(sql, params) {
      calls.push({ sql: sql.replace(/\s+/g, ' ').trim(), params });
      const handler = script.find((s) => s.match.test(sql));
      return handler ? handler.result : { rows: [] };
    },
    release() {},
  };
  return { calls, connect: async () => client };
}

(async () => {
  const pool = fakePool([
    // 7 tem vínculo ativo, 8 e 9 também; 99 é de outra casa.
    {
      match: /SELECT DISTINCT p\.user_id/,
      result: { rows: [{ user_id: 7 }, { user_id: 8 }, { user_id: 9 }] },
    },
    {
      match: /FROM j360_training_assignments ta\s+WHERE ta\.training_id/,
      result: {
        rows: [
          // 7 concluiu e está em dia → mantém
          {
            id: 71,
            user_id: 7,
            status: 'concluido',
            expires_at: new Date(agora.getTime() + 60 * DAY),
          },
          // 8 está vencido → recicla
          { id: 81, user_id: 8, status: 'vencido', expires_at: null },
        ],
      },
    },
    { match: /INSERT INTO j360_training_assignments/, result: { rows: [{ id: 91, user_id: 9 }] } },
    { match: /UPDATE j360_training_assignments/, result: { rows: [{ id: 81, user_id: 8 }] } },
  ]);

  const outcome = await assignUsers(pool, {
    establishmentId: 1,
    trainingId: 5,
    userIds: [7, 8, 9, 99],
    dueAt: null,
    force: false,
    now: agora,
  });

  assert(outcome.skipped.length === 1 && outcome.skipped[0] === 99, 'gente de fora é ignorada');
  assert(outcome.kept === 1, 'conclusão em dia é preservada');
  assert(outcome.reset === 1, 'atribuição vencida é reciclada');
  assert(outcome.created === 1, 'quem nunca teve atribuição recebe uma nova');
  assert(outcome.rows.length === 3, 'só as 3 pessoas da casa entram no retorno');

  const insert = pool.calls.find((c) => /INSERT INTO j360_training_assignments/.test(c.sql));
  assert(
    insert.params[1].length === 1 && insert.params[1][0] === 9,
    'insert em lote só recebe quem não tinha atribuição'
  );
  const update = pool.calls.find((c) => /UPDATE j360_training_assignments/.test(c.sql));
  assert(update.params[0][0] === 81, 'update em lote só recebe as atribuições a reciclar');
  assert(pool.calls[0].sql === 'BEGIN', 'atribuição em lote roda em transação');
  assert(
    pool.calls[pool.calls.length - 1].sql === 'COMMIT',
    'transação da atribuição é confirmada'
  );

  console.log('justino360TrainingRules: ok');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
