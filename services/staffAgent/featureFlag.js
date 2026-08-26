'use strict';

/**
 * Feature flag do Staff Agent Fase 1.
 *
 * STAFF_AGENT_PHASE1_ESTABLISHMENT_IDS=
 *   - vazio          → desligado
 *   - * ou all       → todas as casas (piloto)
 *   - 1,7,17         → só esses IDs operacionais (places/bars)
 *
 * STAFF_AGENT_ENABLED=false  → desliga mesmo com IDs
 */

const { FEATURE_FLAG_ENV } = require('./phase1ToolCatalog');

function rawFlagValue() {
  return String(process.env[FEATURE_FLAG_ENV] || '').trim();
}

function isAllowAllMode() {
  const raw = rawFlagValue().toLowerCase();
  return raw === '*' || raw === 'all' || raw === 'todas';
}

function parseAllowedIds() {
  if (isAllowAllMode()) return [];
  const raw = rawFlagValue();
  if (!raw) return [];
  return raw
    .split(/[,;\s]+/)
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);
}

function isStaffAgentGloballyEnabled() {
  const flag = String(process.env.STAFF_AGENT_ENABLED || 'true').trim().toLowerCase();
  if (flag === '0' || flag === 'false' || flag === 'off' || flag === 'no') return false;
  if (isAllowAllMode()) return true;
  return parseAllowedIds().length > 0;
}

function isEstablishmentEnabled(establishmentId) {
  if (!isStaffAgentGloballyEnabled()) return false;
  const id = Number(establishmentId);
  if (!Number.isFinite(id) || id <= 0) return false;
  if (isAllowAllMode()) return true;
  return parseAllowedIds().includes(id);
}

module.exports = {
  parseAllowedIds,
  isAllowAllMode,
  isStaffAgentGloballyEnabled,
  isEstablishmentEnabled,
};
