'use strict';

const {
  SEU_JUSTINO_ESTABLISHMENT_ID,
  INCIDENT_STATUSES,
  TASK_STATUSES,
  RUN_ITEM_STATUSES,
  PRIORITIES,
  MAINTENANCE_KINDS,
  MAINTENANCE_STATUSES,
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

/**
 * Timestamp tri-state para PATCH/POST: distingue "não informado" de "limpar".
 * Aceita ISO e o `YYYY-MM-DDTHH:mm` que o <input type="datetime-local"> envia.
 * @returns {{ ok: boolean, value: string|null }}
 */
function parseTimestamp(value) {
  if (value === undefined || value === null || value === '') return { ok: true, value: null };
  const parsed = new Date(str(value, 40));
  if (Number.isNaN(parsed.getTime())) return { ok: false, value: null };
  return { ok: true, value: parsed.toISOString() };
}

/** Data `YYYY-MM-DD` para filtros por janela. */
function parseDateOnly(value) {
  if (value === undefined || value === null || value === '') return { ok: true, value: null };
  const raw = str(value, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return { ok: false, value: null };
  const parsed = new Date(`${raw}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return { ok: false, value: null };
  return { ok: true, value: raw };
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

function validateMaintenanceKind(value) {
  return oneOf(value, MAINTENANCE_KINDS, 'corretiva');
}

function validateMaintenanceStatus(value) {
  return oneOf(value, MAINTENANCE_STATUSES, null);
}

module.exports = {
  parseEstablishmentId,
  assertJustinoEstablishment,
  str,
  optionalStr,
  parseId,
  parseBoolean,
  parseTimestamp,
  parseDateOnly,
  oneOf,
  validatePriority,
  validateIncidentStatus,
  validateTaskStatus,
  validateRunItemStatus,
  validateMaintenanceKind,
  validateMaintenanceStatus,
  SEU_JUSTINO_ESTABLISHMENT_ID,
};
