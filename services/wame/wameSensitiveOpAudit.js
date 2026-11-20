'use strict';

/**
 * Audit log de operações sensíveis Wame/coexistência.
 * Só metadados operacionais — nunca tokens, PII ou conteúdo de mensagem.
 */

const MAX_BUFFER = 200;
const recentOps = [];

function pushRecent(entry) {
  recentOps.push(entry);
  if (recentOps.length > MAX_BUFFER) {
    recentOps.splice(0, recentOps.length - MAX_BUFFER);
  }
}

function auditSensitiveOp({
  op,
  establishmentId = null,
  outcome = 'unknown',
  actorUserId = null,
  reason = null,
  detail = null,
} = {}) {
  const entry = {
    at: new Date().toISOString(),
    op: String(op || 'unknown'),
    establishmentId: (() => {
      const id = Number(establishmentId);
      return Number.isFinite(id) && id > 0 ? id : null;
    })(),
    outcome: String(outcome || 'unknown'),
    actorUserId: (() => {
      const id = Number(actorUserId);
      return Number.isFinite(id) && id > 0 ? id : null;
    })(),
    reason: reason ? String(reason).slice(0, 200) : null,
    detail:
      detail && typeof detail === 'object'
        ? Object.fromEntries(
            Object.entries(detail)
              .filter(([key]) => !/token|secret|password|authorization|message|text|body/i.test(key))
              .slice(0, 12),
          )
        : null,
  };

  console.log('[wameSensitiveOpAudit]', JSON.stringify(entry));
  pushRecent(entry);
  return entry;
}

function getRecentSensitiveOps({ limit = 50, establishmentId = null } = {}) {
  const max = Math.min(Math.max(Number(limit) || 50, 1), MAX_BUFFER);
  const id = Number(establishmentId);
  const filtered = Number.isFinite(id) && id > 0
    ? recentOps.filter((row) => row.establishmentId === id)
    : recentOps;
  return filtered.slice(-max);
}

function clearSensitiveOpAuditForTests() {
  recentOps.length = 0;
}

module.exports = {
  auditSensitiveOp,
  getRecentSensitiveOps,
  clearSensitiveOpAuditForTests,
};
