'use strict';

/**
 * Regras de manutenção de ativos do Justino360.
 * Rodar: node --test tests/justino360Maintenance.test.js
 */
const {
  isDoneStatus,
  isOpenStatus,
  validateOpening,
  validateCompletion,
  summarizeMaintenanceMetrics,
} = require('../services/justino360/maintenance');

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

// ---------- status ----------
assert(isOpenStatus('aberta'), 'aberta é status aberto');
assert(isOpenStatus('aguardando_peca'), 'aguardando peça segue aberto');
assert(!isOpenStatus('concluida'), 'concluída não é aberto');
assert(isDoneStatus('concluida'), 'concluída encerra o chamado');
assert(isDoneStatus('concluido'), 'legado no masculino também encerra');
assert(!isDoneStatus('cancelada'), 'cancelada não conta como concluída');

// ---------- abertura ----------
assert(validateOpening({ status: null }) === null, 'sem status usa o default aberta');
assert(validateOpening({ status: 'em_andamento' }) === null, 'pode abrir já em andamento');
assert(
  validateOpening({ status: 'concluida' })?.status === 400,
  'não pode nascer concluído — encerramento exige evidência'
);

// ---------- conclusão ----------
assert(
  validateCompletion({ status: 'em_andamento' }) === null,
  'mudança de status intermediário não exige evidência'
);
assert(
  validateCompletion({ status: 'concluida' })?.status === 400,
  'concluir sem evidência deve ser recusado'
);
assert(
  validateCompletion({
    status: 'concluida',
    evidenceUrl: 'https://firebasestorage.example/j360/chopeira.jpg',
  }) === null,
  'evidência nova libera a conclusão'
);
assert(
  validateCompletion({
    status: 'concluida',
    currentEvidenceUrl: 'https://firebasestorage.example/j360/laudo.pdf',
  }) === null,
  'evidência anexada antes também libera'
);

// ---------- métricas ----------
const metrics = summarizeMaintenanceMetrics(
  {
    abertos: 3,
    em_andamento: 1,
    concluidos: 7,
    concluidos_30d: 4,
    // `pg` devolve numeric como string.
    tempo_medio_horas: '12.35',
    preventivas_vencidas: 2,
  },
  [{ kind: 'corretiva', abertos: '2', concluidos: '5' }]
);
assert(metrics.abertos === 3, 'abertos preservado');
assert(metrics.tempo_medio_horas === 12.4, 'tempo médio vira número com 1 casa');
assert(metrics.por_tipo[0].abertos === 2, 'contagem por tipo vira inteiro');
assert(metrics.preventivas_vencidas === 2, 'preventivas vencidas preservadas');

const empty = summarizeMaintenanceMetrics();
assert(empty.abertos === 0 && empty.concluidos === 0, 'base vazia zera contadores');
assert(empty.tempo_medio_horas === null, 'sem conclusão não há tempo médio');
assert(Array.isArray(empty.por_tipo) && empty.por_tipo.length === 0, 'por_tipo sempre array');

console.log('justino360Maintenance: OK');
