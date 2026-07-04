'use strict';

/**
 * Mapeia profile SaaS (highline, rooftop, …) → establishment_id operacional (place/bar).
 * Carregado do banco no boot; evita hardcode de IDs no código da IA.
 */

let profileToOperationalId = Object.create(null);
let aliasPatterns = [];
let warmed = false;

async function warmOperationalProfileIds(pool) {
  if (!pool) return profileToOperationalId;
  try {
    const { rows } = await pool.query(
      `SELECT legacy_place_id, legacy_bar_id, name,
              COALESCE(config->'rules'->>'profile', config->>'profile') AS profile
         FROM meu_backup_db.establishments
        WHERE legacy_place_id IS NOT NULL OR legacy_bar_id IS NOT NULL`,
    );
    const map = Object.create(null);
    const aliases = [];
    for (const row of rows) {
      const opId = Number(row.legacy_place_id || row.legacy_bar_id);
      const profile = String(row.profile || '').trim().toLowerCase();
      if (Number.isFinite(opId) && opId > 0 && profile) {
        map[profile] = opId;
      }
      if (Number.isFinite(opId) && opId > 0 && row.name) {
        aliases.push({ name: row.name, id: opId, profile });
      }
    }
    profileToOperationalId = map;
    aliasPatterns = aliases;
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
  if (Number.isFinite(fromDb) && fromDb > 0) return fromDb;
  if (key === 'highline') {
    const env = Number(process.env.HIGHLINE_ESTABLISHMENT_ID);
    if (Number.isFinite(env) && env > 0) return env;
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
    return aliasPatterns.map((a) => {
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
};
