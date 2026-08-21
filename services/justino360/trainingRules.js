'use strict';

/**
 * Justino360 — regras de treinamento (LMS operacional).
 *
 * Tudo aqui é puro (sem I/O) para poder ser testado com `node --test`:
 * whitelist de função, validade/reciclagem por `validity_days` e a decisão
 * de o que fazer quando alguém é reatribuído a um curso que já fez.
 */

/**
 * Funções operacionais aceitas. Espelha a lista de
 * `routes/justino360/documents.js` — quando as duas telas forem unificadas,
 * esta lista deve virar a única fonte da verdade (mover para `constants.js`).
 * `null` = curso geral, para toda a equipe.
 */
const ROLE_KEYS = [
  'garcom',
  'barman',
  'caixa',
  'cozinha',
  'copa',
  'limpeza',
  'seguranca',
  'recepcao',
  'maitre',
  'runner',
  'gerencia',
];

const TRAINING_STATUSES = ['pendente', 'em_andamento', 'concluido', 'vencido'];

/** Situações que ainda cobram ação da pessoa. */
const OPEN_STATUSES = ['pendente', 'em_andamento', 'vencido'];

/** 10 anos: teto defensivo para não gravar validade absurda por erro de digitação. */
const MAX_VALIDITY_DAYS = 3650;

const INVALID_ROLE_MESSAGE = `Função inválida. Use uma de: ${ROLE_KEYS.join(', ')}.`;
const INVALID_STATUS_MESSAGE = `Situação inválida. Use uma de: ${TRAINING_STATUSES.join(', ')}.`;
const INVALID_VALIDITY_MESSAGE = `Validade deve ser um número inteiro de dias entre 1 e ${MAX_VALIDITY_DAYS}.`;

function pickRoleKey(value) {
  if (value === undefined || value === null || value === '') return { ok: true, value: null };
  const v = String(value).trim().toLowerCase();
  if (!ROLE_KEYS.includes(v)) return { ok: false, value: null };
  return { ok: true, value: v };
}

function pickStatus(value) {
  if (value === undefined || value === null || value === '') return { ok: true, value: null };
  const v = String(value).trim().toLowerCase();
  if (!TRAINING_STATUSES.includes(v)) return { ok: false, value: null };
  return { ok: true, value: v };
}

/**
 * `null` = curso sem reciclagem (vale para sempre). Qualquer outro valor precisa
 * ser inteiro positivo — string numérica vinda do form é aceita.
 */
function parseValidityDays(value) {
  if (value === undefined || value === null || value === '') return { ok: true, value: null };
  const days = Number(value);
  if (!Number.isInteger(days) || days < 1 || days > MAX_VALIDITY_DAYS) {
    return { ok: false, value: null };
  }
  return { ok: true, value: days };
}

function toDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Data em que a conclusão perde validade. `null` quando o curso não recicla. */
function computeExpiresAt(completedAt, validityDays) {
  const days = parseValidityDays(validityDays);
  if (!days.ok || days.value === null) return null;
  const base = toDate(completedAt);
  if (!base) return null;
  return new Date(base.getTime() + days.value * 24 * 60 * 60 * 1000);
}

function isExpired(expiresAt, now = new Date()) {
  const expires = toDate(expiresAt);
  if (!expires) return false;
  return expires.getTime() <= toDate(now).getTime();
}

/**
 * Situação real da atribuição: conclusão com validade estourada conta como
 * vencida mesmo que o banco ainda não tenha passado a varredura.
 */
function effectiveStatus(assignment, now = new Date()) {
  if (!assignment) return null;
  const status = String(assignment.status || 'pendente');
  if (status === 'concluido' && isExpired(assignment.expires_at, now)) return 'vencido';
  return status;
}

/** Dias restantes de validade (negativo quando já venceu, `null` sem validade). */
function daysUntilExpiry(expiresAt, now = new Date()) {
  const expires = toDate(expiresAt);
  if (!expires) return null;
  const diff = expires.getTime() - toDate(now).getTime();
  return Math.ceil(diff / (24 * 60 * 60 * 1000));
}

/**
 * O que fazer ao atribuir um curso a quem já tem registro:
 * - `create`: nunca teve atribuição;
 * - `keep`: conclusão ainda válida — não zera o histórico da pessoa;
 * - `reset`: pendente, em andamento, vencida, ou reciclagem forçada pela gestão.
 */
function resolveAssignAction(existing, { force = false, now = new Date() } = {}) {
  if (!existing) return 'create';
  if (force) return 'reset';
  const stillValid = existing.status === 'concluido' && !isExpired(existing.expires_at, now);
  return stillValid ? 'keep' : 'reset';
}

/** Percentual de conclusão do curso (0–100), arredondado. */
function progressRate(assignedCount, completedCount) {
  const assigned = Number(assignedCount) || 0;
  const completed = Number(completedCount) || 0;
  if (assigned <= 0) return 0;
  return Math.round((Math.min(completed, assigned) / assigned) * 100);
}

/** Agregado de progresso de um curso a partir da lista de atribuições. */
function summarizeAssignments(assignments = []) {
  const completed = assignments.filter((a) => a.status === 'concluido').length;
  const expired = assignments.filter((a) => a.status === 'vencido').length;
  return {
    assigned_count: assignments.length,
    completed_count: completed,
    expired_count: expired,
    pending_count: assignments.length - completed - expired,
    completion_rate: progressRate(assignments.length, completed),
  };
}

module.exports = {
  ROLE_KEYS,
  TRAINING_STATUSES,
  OPEN_STATUSES,
  MAX_VALIDITY_DAYS,
  INVALID_ROLE_MESSAGE,
  INVALID_STATUS_MESSAGE,
  INVALID_VALIDITY_MESSAGE,
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
};
