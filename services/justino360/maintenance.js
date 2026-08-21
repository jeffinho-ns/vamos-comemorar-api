'use strict';

/**
 * Regras de manutenção de ativos do Justino360.
 * Funções puras: as rotas cuidam de I/O, aqui ficam validação e formato de métricas.
 */
const {
  MAINTENANCE_DONE_STATUSES,
  MAINTENANCE_OPEN_STATUSES,
} = require('./constants');

function isDoneStatus(status) {
  return MAINTENANCE_DONE_STATUSES.includes(String(status || '').toLowerCase());
}

function isOpenStatus(status) {
  return MAINTENANCE_OPEN_STATUSES.includes(String(status || '').toLowerCase());
}

/**
 * Um chamado só abre em status aberto — encerramento passa pelo PATCH,
 * que é onde a evidência é cobrada.
 */
function validateOpening({ status }) {
  if (!status) return null;
  if (isOpenStatus(status)) return null;
  return {
    status: 400,
    message: 'Chamado novo entra como aberto. Use a conclusão para encerrar com evidência.',
  };
}

/**
 * Encerrar chamado exige foto/laudo: sem evidência não há como auditar o serviço.
 * `currentEvidenceUrl` cobre o caso de a evidência já ter sido anexada antes.
 */
function validateCompletion({ status, evidenceUrl, currentEvidenceUrl }) {
  if (!isDoneStatus(status)) return null;
  if (evidenceUrl || currentEvidenceUrl) return null;
  return {
    status: 400,
    message: 'Anexe a foto ou laudo do serviço para concluir o chamado.',
  };
}

function toInt(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

function toDecimal(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 10) / 10;
}

/**
 * Normaliza o retorno do Postgres (numeric vira string no driver `pg`)
 * para o formato consumido pelo painel de manutenção.
 */
function summarizeMaintenanceMetrics(row = {}, byKindRows = []) {
  return {
    abertos: toInt(row.abertos),
    em_andamento: toInt(row.em_andamento),
    concluidos: toInt(row.concluidos),
    concluidos_30d: toInt(row.concluidos_30d),
    tempo_medio_horas: toDecimal(row.tempo_medio_horas),
    preventivas_vencidas: toInt(row.preventivas_vencidas),
    por_tipo: (Array.isArray(byKindRows) ? byKindRows : []).map((k) => ({
      kind: String(k.kind || 'corretiva'),
      abertos: toInt(k.abertos),
      concluidos: toInt(k.concluidos),
    })),
  };
}

module.exports = {
  isDoneStatus,
  isOpenStatus,
  validateOpening,
  validateCompletion,
  summarizeMaintenanceMetrics,
};
