'use strict';

/**
 * Feature flag do Staff Agent Fase 1.
 *
 * STAFF_AGENT_PHASE1_ESTABLISHMENT_IDS=
 *   - vazio → desligado
 *   - qualquer valor (*, all, 1, 1,7,…) → ligado
 *
 * Comportamento padrão (piloto): ligado = TODAS as casas.
 * Whitelist de verdade só com STAFF_AGENT_PHASE1_STRICT=true.
 *
 * STAFF_AGENT_ENABLED=false → desliga tudo
 */

const FLAG_ENV = 'STAFF_AGENT_PHASE1_ESTABLISHMENT_IDS';

function rawFlagValue() {
  const direct = process.env[FLAG_ENV];
  // Fallback se o catálogo/export divergir em algum deploy antigo.
  const value = direct != null ? direct : process.env.STAFF_AGENT_PHASE1_ESTABLISHMENT_IDS;
  return String(value || '')
    .trim()
    .replace(/^["']+|["']+$/g, '');
}

function isStrictWhitelist() {
  const flag = String(process.env.STAFF_AGENT_PHASE1_STRICT || '')
    .trim()
    .toLowerCase();
  return flag === '1' || flag === 'true' || flag === 'yes' || flag === 'on';
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
  return rawFlagValue().length > 0;
}

/** Piloto: se a feature está on, libera todas — salvo STRICT. */
function isAllowAllMode() {
  if (!isStaffAgentGloballyEnabled()) return false;
  if (!isStrictWhitelist()) return true;
  const raw = rawFlagValue().toLowerCase();
  return raw === '*' || raw === 'all' || raw === 'todas';
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
  FLAG_ENV,
};
