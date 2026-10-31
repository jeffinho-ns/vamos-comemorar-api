'use strict';

/**
 * Mapeia profile SaaS (highline, rooftop, …) → establishment_id operacional (place/bar).
 * Carregado do banco no boot; evita hardcode de IDs no código da IA.
 */

let profileToOperationalId = Object.create(null);
let aliasPatterns = [];
let warmed = false;

function normalizeVenueName(name) {
  return String(name || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

/** Apê e áreas internas compartilham o profile da casa, mas não são o id operacional. */
function isAncillaryVenueName(name) {
  return /\bape\b/.test(normalizeVenueName(name));
}

/**
 * Um profile aponta para a casa principal (menor id), nunca para uma área interna.
 * Sem isso, "Apê do Pracinha" (place 17) sobrescrevia o Pracinha (place 8) e a
 * reserva caía numa casa sem horário nem programação.
 */
function pickCatalogAliases(rows) {
  const aliases = [];
  for (const row of rows || []) {
    if (isAncillaryVenueName(row.name)) continue;
    const opId = Number(row.legacy_place_id || row.legacy_bar_id);
    const profile = String(row.profile || '').trim().toLowerCase();
    if (!Number.isFinite(opId) || opId <= 0 || !row.name) continue;
    aliases.push({ name: row.name, id: opId, profile });
  }
  return aliases;
}

function pickProfileOperationalIds(rows) {
  const ordered = [...(rows || [])].sort(
    (a, b) => Number(a.id || 0) - Number(b.id || 0)
  );
  const map = Object.create(null);
  for (const row of ordered) {
    const opId = Number(row.legacy_place_id || row.legacy_bar_id);
    const profile = String(row.profile || '').trim().toLowerCase();
    if (!Number.isFinite(opId) || opId <= 0 || !profile) continue;
    if (isAncillaryVenueName(row.name)) continue;
    if (!map[profile]) map[profile] = opId;
  }
  return map;
}

async function warmOperationalProfileIds(pool) {
  if (!pool) return profileToOperationalId;
  try {
    const { rows } = await pool.query(
      `SELECT id, legacy_place_id, legacy_bar_id, name,
              COALESCE(config->'rules'->>'profile', config->>'profile') AS profile
         FROM meu_backup_db.establishments
        WHERE legacy_place_id IS NOT NULL OR legacy_bar_id IS NOT NULL
        ORDER BY id`,
    );
    profileToOperationalId = pickProfileOperationalIds(rows);
    aliasPatterns = pickCatalogAliases(rows);
    warmed = true;
  } catch (err) {
    console.warn('[operationalProfileIds] warm falhou:', err.message);
  }
  return profileToOperationalId;
}

function getOperationalIdForProfile(profile) {
  const key = String(profile || '').trim().toLowerCase();
  if (!key) return null;
  const fromDb = profileToOperationalId[key];
  if (Number.isFinite(fromDb) && fromDb > 0) {
    if (fromDb === 17) return key === 'pracinha' ? 8 : null;
    return fromDb;
  }
  if (key === 'highline') {
    const env = Number(process.env.HIGHLINE_ESTABLISHMENT_ID || 7);
    if (Number.isFinite(env) && env > 0) return env;
  }
  if (key === 'reserva') {
    const { RESERVA_PINHEIROS_PLACE_ID } = require('../services/reservaEstablishmentIds');
    return RESERVA_PINHEIROS_PLACE_ID;
  }
  return null;
}

function isOperationalProfile(establishmentId, profile) {
  const expected = getOperationalIdForProfile(profile);
  if (!expected) return false;
  return Number(establishmentId) === Number(expected);
}

function getAliasPatternsFromCatalog() {
  if (aliasPatterns.length > 0) {
    return aliasPatterns.filter((a) => !isAncillaryVenueName(a.name)).map((a) => {
      const escaped = String(a.name)
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return { pattern: new RegExp(`\\b${escaped}\\b`, 'i'), id: a.id };
    });
  }
  return null;
}

function isWarmed() {
  return warmed;
}

module.exports = {
  warmOperationalProfileIds,
  getOperationalIdForProfile,
  isOperationalProfile,
  getAliasPatternsFromCatalog,
  isWarmed,
  pickProfileOperationalIds,
  pickCatalogAliases,
  isAncillaryVenueName,
};
