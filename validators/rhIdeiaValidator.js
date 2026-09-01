'use strict';

const { GRUPO_IDEIA_ORG_SLUG, SCOPES, PRIORITIES } = require('../services/rhIdeia/constants');

function parseEstablishmentId(value) {
  const id = Number(value);
  if (!Number.isFinite(id) || id <= 0) return null;
  return id;
}

function parseOrganizationId(value) {
  const id = Number(value);
  if (!Number.isFinite(id) || id <= 0) return null;
  return id;
}

function parseId(value) {
  const id = Number(value);
  if (!Number.isFinite(id) || id <= 0) return null;
  return id;
}

function str(value, max = 500) {
  const s = String(value === undefined || value === null ? '' : value).trim();
  return s.slice(0, max);
}

function optionalStr(value, max = 2000) {
  if (value === undefined || value === null || value === '') return null;
  return str(value, max);
}

function parseBoolean(value, defaultValue = false) {
  if (value === undefined || value === null || value === '') return defaultValue;
  if (typeof value === 'string') {
    const v = value.trim().toLowerCase();
    if (['false', '0', 'no', 'nao', 'não'].includes(v)) return false;
    if (['true', '1', 'yes', 'sim'].includes(v)) return true;
    return defaultValue;
  }
  if (typeof value === 'number') return value !== 0;
  return Boolean(value);
}

function pickScope(value, fallback = 'organization') {
  if (value === undefined || value === null || value === '') return { ok: true, value: fallback };
  const v = String(value).trim().toLowerCase();
  if (!SCOPES.includes(v)) return { ok: false, value: null };
  return { ok: true, value: v };
}

function pickPriority(value, fallback) {
  if (value === undefined || value === null || value === '') return { ok: true, value: fallback };
  const v = String(value).trim().toLowerCase();
  if (!PRIORITIES.includes(v)) return { ok: false, value: null };
  return { ok: true, value: v };
}

function pickTimestamp(value) {
  if (value === undefined || value === null || value === '') return { ok: true, value: null };
  const raw = optionalStr(value, 40);
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return { ok: false, value: null };
  return { ok: true, value: parsed.toISOString() };
}

/** establishment_id null quando scope=organization */
function resolveScopeEstablishment(scope, establishmentId) {
  if (scope === 'organization') return null;
  return establishmentId;
}

module.exports = {
  GRUPO_IDEIA_ORG_SLUG,
  parseEstablishmentId,
  parseOrganizationId,
  parseId,
  str,
  optionalStr,
  parseBoolean,
  pickScope,
  pickPriority,
  pickTimestamp,
  resolveScopeEstablishment,
};
