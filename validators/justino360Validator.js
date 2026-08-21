'use strict';

const {
  SEU_JUSTINO_ESTABLISHMENT_ID,
  INCIDENT_STATUSES,
  TASK_STATUSES,
  RUN_ITEM_STATUSES,
  PRIORITIES,
} = require('../services/justino360/constants');

function parseEstablishmentId(value) {
  const id = Number(value);
  if (!Number.isFinite(id) || id <= 0) return null;
  return id;
}

function assertJustinoEstablishment(establishmentId) {
  if (Number(establishmentId) !== SEU_JUSTINO_ESTABLISHMENT_ID) {
    return {
      ok: false,
      status: 403,
      message: 'Justino360 está disponível apenas para o Seu Justino.',
    };
  }
  return { ok: true };
}

function str(value, max = 500) {
  const s = String(value === undefined || value === null ? '' : value).trim();
  return s.slice(0, max);
}

function optionalStr(value, max = 2000) {
  if (value === undefined || value === null || value === '') return null;
  return str(value, max);
}

function parseId(value) {
  const id = Number(value);
  if (!Number.isFinite(id) || id <= 0) return null;
  return id;
}

/**
 * Booleano tri-state: `undefined`/`null`/`''` mantêm o default do servidor.
 * Necessário porque `Boolean(undefined)` apagaria a diferença entre
 * "cliente não informou" e "cliente pediu explicitamente false".
 */
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

function oneOf(value, allowed, fallback = null) {
  const v = String(value || '').trim().toLowerCase();
  if (allowed.includes(v)) return v;
  return fallback;
}

function validatePriority(value) {
  return oneOf(value, PRIORITIES, 'media');
}

function validateIncidentStatus(value) {
  return oneOf(value, INCIDENT_STATUSES, null);
}

function validateTaskStatus(value) {
  return oneOf(value, TASK_STATUSES, null);
}

function validateRunItemStatus(value) {
  return oneOf(value, RUN_ITEM_STATUSES, null);
}

module.exports = {
  parseEstablishmentId,
  assertJustinoEstablishment,
  str,
  optionalStr,
  parseId,
  parseBoolean,
  validatePriority,
  validateIncidentStatus,
  validateTaskStatus,
  validateRunItemStatus,
  SEU_JUSTINO_ESTABLISHMENT_ID,
};
