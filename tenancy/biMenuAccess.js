'use strict';

const { parseMenuAccessInput, sanitizeMenuAccess } = require('./menuAccess');

const BI_PAGE_KEYS = Object.freeze([
  'master',
  'operacao',
  'marketing',
  'financeiro',
  'rh',
  'cmv',
  'eventos',
  'reservas',
  'auditoriaop',
  'auditoria',
  'documentos',
  'manual',
  'contatos',
]);

const BI_PAGE_KEY_SET = new Set(BI_PAGE_KEYS);

function sanitizeBiMenuAccess(arr) {
  const seen = new Set();
  const out = [];
  for (const raw of parseMenuAccessInput(arr)) {
    const key = String(raw || '').trim().toLowerCase();
    if (!key || !BI_PAGE_KEY_SET.has(key) || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

function hasBiJustinoAccess(menuAccess, biMenuAccess) {
  return (
    sanitizeMenuAccess(menuAccess).includes('bi-justino') &&
    sanitizeBiMenuAccess(biMenuAccess).length > 0
  );
}

function unionBiMenuAccess(rows) {
  const seen = new Set();
  const out = [];
  for (const row of rows || []) {
    if (!sanitizeMenuAccess(row && row.menu_access).includes('bi-justino')) continue;
    for (const key of sanitizeBiMenuAccess(row && row.bi_menu_access)) {
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(key);
    }
  }
  return out;
}

const SEU_JUSTINO_ESTABLISHMENT_ID = 1;

function stripBiOutsideSeuJustino(establishmentId, menuAccess, biMenuAccess) {
  if (Number(establishmentId) === SEU_JUSTINO_ESTABLISHMENT_ID) {
    return {
      menuAccess: sanitizeMenuAccess(menuAccess),
      biMenuAccess: sanitizeBiMenuAccess(biMenuAccess),
    };
  }
  return {
    menuAccess: sanitizeMenuAccess(menuAccess).filter((key) => key !== 'bi-justino'),
    biMenuAccess: [],
  };
}

function resolveStoredBiMenuAccess(menuAccess, biMenuAccessInput) {
  if (!sanitizeMenuAccess(menuAccess).includes('bi-justino')) return [];
  if (biMenuAccessInput === undefined) return undefined;
  return sanitizeBiMenuAccess(biMenuAccessInput);
}

module.exports = {
  BI_PAGE_KEYS,
  sanitizeBiMenuAccess,
  hasBiJustinoAccess,
  unionBiMenuAccess,
  resolveStoredBiMenuAccess,
  stripBiOutsideSeuJustino,
  SEU_JUSTINO_ESTABLISHMENT_ID,
};
