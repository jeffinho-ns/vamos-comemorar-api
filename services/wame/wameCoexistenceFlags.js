'use strict';

/**
 * Feature flags de coexistência Meta/Wame por establishment_id.
 *
 * Estado inicial: comportamento atual para envio/receive/mirror.
 * Highline (7) entra com protectSession + blockPhoneLineAdmin ligados
 * (bloqueia só operações destrutivas de sessão/admin de linha).
 *
 * Env:
 *   WAME_COEXISTENCE_FLAGS='{"7":{"integration":"official_coexistence","protectSession":true,"blockPhoneLineAdmin":true,"suspendSolOutbound":false}}'
 *   WAME_COEXISTENCE_PROTECTED_IDS=7          (atalho: liga protectSession+blockPhoneLineAdmin)
 *   WAME_COEXISTENCE_SUSPEND_SOL_OUTBOUND_IDS= (vazio = ninguém)
 *   WAME_COEXISTENCE_DISABLE_DEFAULTS=true     (não aplica defaults Highline)
 *
 * Rollback: limpar as envs acima ou WAME_COEXISTENCE_DISABLE_DEFAULTS=true
 * e remover ids das listas / JSON.
 */

const DEFAULT_HIGHLINE_ID = 7;

function trimEnv(name) {
  const value = process.env[name];
  return value == null ? '' : String(value).trim();
}

function parseIdList(raw) {
  if (!raw) return new Set();
  return new Set(
    String(raw)
      .split(/[\s,;]+/)
      .map((part) => Number(part))
      .filter((id) => Number.isFinite(id) && id > 0),
  );
}

function parseFlagsJson() {
  const raw = trimEnv('WAME_COEXISTENCE_FLAGS');
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out = {};
    for (const [key, value] of Object.entries(parsed)) {
      const id = Number(key);
      if (!Number.isFinite(id) || id <= 0 || !value || typeof value !== 'object') continue;
      out[id] = { ...value };
    }
    return out;
  } catch (error) {
    console.warn('[wameCoexistenceFlags] WAME_COEXISTENCE_FLAGS inválido:', error.message);
    return {};
  }
}

function resolveHighlineId() {
  try {
    const { getOperationalIdForProfile } = require('../../tenancy/operationalProfileIds');
    const fromProfile = Number(getOperationalIdForProfile('highline'));
    if (Number.isFinite(fromProfile) && fromProfile > 0) return fromProfile;
  } catch (_) {
    /* tenancy pode falhar em testes isolados */
  }
  const envId = Number(trimEnv('HIGHLINE_ESTABLISHMENT_ID') || DEFAULT_HIGHLINE_ID);
  return Number.isFinite(envId) && envId > 0 ? envId : DEFAULT_HIGHLINE_ID;
}

function defaultsDisabled() {
  return trimEnv('WAME_COEXISTENCE_DISABLE_DEFAULTS').toLowerCase() === 'true';
}

function buildFlagMap() {
  const map = parseFlagsJson();
  const protectedIds = parseIdList(trimEnv('WAME_COEXISTENCE_PROTECTED_IDS'));
  const suspendIds = parseIdList(trimEnv('WAME_COEXISTENCE_SUSPEND_SOL_OUTBOUND_IDS'));

  if (!defaultsDisabled()) {
    const highlineId = resolveHighlineId();
    if (!map[highlineId]) {
      map[highlineId] = {
        integration: 'official_coexistence',
        protectSession: true,
        blockPhoneLineAdmin: true,
        suspendSolOutbound: false,
      };
    }
    protectedIds.add(highlineId);
  }

  for (const id of protectedIds) {
    const existing = map[id] || {};
    map[id] = {
      ...existing,
      integration: existing.integration || 'official_coexistence',
      protectSession: existing.protectSession !== false,
      blockPhoneLineAdmin: existing.blockPhoneLineAdmin !== false,
      suspendSolOutbound: existing.suspendSolOutbound === true,
    };
  }

  for (const id of suspendIds) {
    const existing = map[id] || {};
    map[id] = {
      ...existing,
      integration: existing.integration || 'official_coexistence',
      protectSession: Boolean(existing.protectSession),
      blockPhoneLineAdmin: Boolean(existing.blockPhoneLineAdmin),
      suspendSolOutbound: true,
    };
  }

  return map;
}

function getCoexistenceFlags(establishmentId) {
  const id = Number(establishmentId);
  if (!Number.isFinite(id) || id <= 0) return null;
  const flags = buildFlagMap()[id];
  if (!flags) return null;
  return {
    establishmentId: id,
    integration: String(flags.integration || 'unknown'),
    protectSession: flags.protectSession === true,
    blockPhoneLineAdmin: flags.blockPhoneLineAdmin === true,
    suspendSolOutbound: flags.suspendSolOutbound === true,
  };
}

function isCoexistenceProtected(establishmentId) {
  const flags = getCoexistenceFlags(establishmentId);
  return Boolean(flags && (flags.protectSession || flags.blockPhoneLineAdmin));
}

function shouldProtectSession(establishmentId) {
  return Boolean(getCoexistenceFlags(establishmentId)?.protectSession);
}

function shouldBlockPhoneLineAdmin(establishmentId) {
  return Boolean(getCoexistenceFlags(establishmentId)?.blockPhoneLineAdmin);
}

function shouldSuspendSolOutbound(establishmentId) {
  return Boolean(getCoexistenceFlags(establishmentId)?.suspendSolOutbound);
}

function listProtectedEstablishmentIds() {
  return Object.keys(buildFlagMap())
    .map(Number)
    .filter((id) => {
      const flags = getCoexistenceFlags(id);
      return flags && (flags.protectSession || flags.blockPhoneLineAdmin || flags.suspendSolOutbound);
    })
    .sort((a, b) => a - b);
}

module.exports = {
  DEFAULT_HIGHLINE_ID,
  getCoexistenceFlags,
  isCoexistenceProtected,
  shouldProtectSession,
  shouldBlockPhoneLineAdmin,
  shouldSuspendSolOutbound,
  listProtectedEstablishmentIds,
  resolveHighlineId,
};
