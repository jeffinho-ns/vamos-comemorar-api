'use strict';

/**
 * Feature flag do Staff Agent Fase 1.
 * STAFF_AGENT_PHASE1_ESTABLISHMENT_IDS=1,7  (CSV; vazio = desligado)
 * STAFF_AGENT_ENABLED=true  (opcional; se false, desliga mesmo com IDs)
 */

const { FEATURE_FLAG_ENV } = require('./phase1ToolCatalog');

function parseAllowedIds() {
  const raw = String(process.env[FEATURE_FLAG_ENV] || '').trim();
  if (!raw) return [];
  return raw
    .split(/[,;\s]+/)
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);
}

function isStaffAgentGloballyEnabled() {
  const flag = String(process.env.STAFF_AGENT_ENABLED || 'true').trim().toLowerCase();
  if (flag === '0' || flag === 'false' || flag === 'off' || flag === 'no') return false;
  return parseAllowedIds().length > 0;
}

function isEstablishmentEnabled(establishmentId) {
  if (!isStaffAgentGloballyEnabled()) return false;
  const id = Number(establishmentId);
  if (!Number.isFinite(id) || id <= 0) return false;
  return parseAllowedIds().includes(id);
}

module.exports = {
  parseAllowedIds,
  isStaffAgentGloballyEnabled,
  isEstablishmentEnabled,
};
