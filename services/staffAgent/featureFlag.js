'use strict';

/**
 * Feature flag do Staff Agent Fase 1.
 *
 * STAFF_AGENT_PHASE1_ESTABLISHMENT_IDS=
 *   - vazio          → desligado
 *   - * / all / todas → ligado (todas as casas)
 *   - 1,7,17         → ligado (piloto: todas as casas, ver STRICT abaixo)
 *
 * STAFF_AGENT_PHASE1_STRICT=true
 *   → a lista CSV vira whitelist de verdade (só esses IDs)
 *   → default do piloto: false (qualquer lista não-vazia libera todas)
 *
 * STAFF_AGENT_ENABLED=false → desliga tudo
 */

const { FEATURE_FLAG_ENV } = require('./phase1ToolCatalog');

function rawFlagValue() {
  return String(process.env[FEATURE_FLAG_ENV] || '')
    .trim()
    .replace(/^["']+|["']+$/g, '');
}

function isStrictWhitelist() {
  const flag = String(process.env.STAFF_AGENT_PHASE1_STRICT || '')
    .trim()
    .toLowerCase();
  return flag === '1' || flag === 'true' || flag === 'yes' || flag === 'on';
}

function isAllowAllMode() {
  const raw = rawFlagValue().toLowerCase();
  if (raw === '*' || raw === 'all' || raw === 'todas') return true;
  // Piloto: lista preenchida sem STRICT = todas as casas.
  if (!isStrictWhitelist() && parseAllowedIds().length > 0) return true;
  return false;
}

function parseAllowedIds() {
  const raw = rawFlagValue();
  if (!raw) return [];
  const lower = raw.toLowerCase();
  if (lower === '*' || lower === 'all' || lower === 'todas') return [];
  return raw
    .split(/[,;\s]+/)
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);
}

function isStaffAgentGloballyEnabled() {
  const flag = String(process.env.STAFF_AGENT_ENABLED || 'true').trim().toLowerCase();
  if (flag === '0' || flag === 'false' || flag === 'off' || flag === 'no') return false;
  const raw = rawFlagValue().toLowerCase();
  if (raw === '*' || raw === 'all' || raw === 'todas') return true;
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
  isStrictWhitelist,
  isStaffAgentGloballyEnabled,
  isEstablishmentEnabled,
};
