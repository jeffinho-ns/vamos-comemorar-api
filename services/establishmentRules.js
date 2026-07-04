'use strict';

/**
 * Regras por estabelecimento — substitui hardcodes de ID (8=Pracinha, 9=Rooftop, etc.)
 * Lê `establishments.config` com fallback para perfis legados conhecidos.
 */

const cache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000;

const LEGACY_PROFILES = {
  1: {
    profile: 'seu_justino',
    cardapio: { barId: 1 },
    reservations: { excludeAreaPrefix: 'Reserva Rooftop - ' },
  },
  2: {
    profile: 'oh_fregues',
    cardapio: { barId: 2 },
    reservations: { excludeAreaPrefix: 'Reserva Rooftop - ' },
  },
  4: {
    profile: 'oh_fregues',
    cardapio: { barId: 2 },
    reservations: { excludeAreaPrefix: 'Reserva Rooftop - ' },
  },
  7: {
    profile: 'highline',
    cardapio: { barId: 3 },
    reservations: { excludeAreaPrefix: 'Reserva Rooftop - ' },
  },
  8: {
    profile: 'pracinha',
    cardapio: { barId: 4 },
    reservations: { maxPartySize: 60, excludeAreaPrefix: 'Reserva Rooftop - ' },
  },
  9: {
    profile: 'rooftop',
    operationalAliases: [5, 9],
    cardapio: { barId: 5 },
    reservations: {
      maxDaily: 60,
      areaNamePrefix: 'Reserva Rooftop - ',
      dualShift: true,
      strictHours: true,
    },
  },
  5: {
    profile: 'rooftop',
    operationalAliases: [5, 9],
    cardapio: { barId: 5 },
    reservations: {
      maxDaily: 60,
      areaNamePrefix: 'Reserva Rooftop - ',
      dualShift: true,
      strictHours: true,
    },
  },
  10: {
    profile: 'sitio_ilha',
    reservations: { excludeAreaPrefix: 'Reserva Rooftop - ' },
  },
};

const DEFAULT_EXCLUDE_AREA_PREFIX = 'Reserva Rooftop - ';

function deepMerge(base, extra) {
  if (!extra || typeof extra !== 'object') return { ...base };
  const out = { ...base };
  for (const [k, v] of Object.entries(extra)) {
    if (v && typeof v === 'object' && !Array.isArray(v) && typeof out[k] === 'object') {
      out[k] = deepMerge(out[k] || {}, v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

function inferProfileFromName(name) {
  const lower = String(name || '').toLowerCase();
  if (lower.includes('rooftop')) return 'rooftop';
  if (lower.includes('pracinha')) return 'pracinha';
  if (lower.includes('highline') || lower.includes('high line')) return 'highline';
  if (lower.includes('fregu')) return 'oh_fregues';
  if (lower.includes('justino')) return 'seu_justino';
  if (lower.includes('ilha')) return 'sitio_ilha';
  return 'generic';
}

function normalizeRules(raw, establishmentName, operationalId) {
  const legacy = LEGACY_PROFILES[Number(operationalId)] || {};
  const fromConfig = raw?.rules ? raw.rules : raw || {};
  const merged = deepMerge(legacy, fromConfig);

  if (!merged.profile) {
    merged.profile = raw?.profile || inferProfileFromName(establishmentName);
  }
  if (!merged.reservations) merged.reservations = {};
  if (!merged.cardapio) merged.cardapio = {};

  return merged;
}

async function getEstablishmentRules(pool, operationalEstablishmentId) {
  const id = Number(operationalEstablishmentId);
  if (!Number.isFinite(id) || id <= 0) {
    return normalizeRules({}, '', id);
  }

  const cached = cache.get(id);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.rules;
  }

  let rules = normalizeRules({}, '', id);
  try {
    const { rows } = await pool.query(
      `SELECT name, config
         FROM meu_backup_db.establishments
        WHERE legacy_place_id = $1 OR legacy_bar_id = $1
        LIMIT 1`,
      [id],
    );
    if (rows[0]) {
      rules = normalizeRules(rows[0].config || {}, rows[0].name, id);
    }
  } catch (_) {
    rules = normalizeRules({}, '', id);
  }

  cache.set(id, { rules, at: Date.now() });
  return rules;
}

function clearRulesCache() {
  cache.clear();
}

function isProfile(rules, profile) {
  return rules?.profile === profile;
}

function isRooftop(rules) {
  return isProfile(rules, 'rooftop');
}

function isPracinha(rules) {
  return isProfile(rules, 'pracinha');
}

function getMaxDailyReservations(rules) {
  const n = Number(rules?.reservations?.maxDaily);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function getMaxPartySize(rules) {
  const n = Number(rules?.reservations?.maxPartySize);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function getCardapioBarId(rules, operationalId) {
  const fromRules = Number(rules?.cardapio?.barId);
  if (Number.isFinite(fromRules) && fromRules > 0) return fromRules;
  const legacy = LEGACY_PROFILES[Number(operationalId)];
  const legacyBar = Number(legacy?.cardapio?.barId);
  if (Number.isFinite(legacyBar) && legacyBar > 0) return legacyBar;
  return Number(operationalId);
}

function buildAreasNameFilterSql(rules, column = 'ra.name') {
  const prefix = rules?.reservations?.areaNamePrefix;
  if (prefix) {
    const safe = String(prefix).replace(/'/g, "''");
    return `${column} ILIKE '${safe}%'`;
  }
  const exclude =
    rules?.reservations?.excludeAreaPrefix || DEFAULT_EXCLUDE_AREA_PREFIX;
  const safeExclude = String(exclude).replace(/'/g, "''");
  return `${column} NOT ILIKE '${safeExclude}%'`;
}

function areaAllowedForRules(rules, areaName) {
  const prefix = rules?.reservations?.areaNamePrefix;
  const name = String(areaName || '');
  if (prefix) return name.startsWith(prefix);
  const exclude =
    rules?.reservations?.excludeAreaPrefix || DEFAULT_EXCLUDE_AREA_PREFIX;
  return !name.startsWith(exclude);
}

/** Restaurantes com bloqueio de mesa por overlap de horário (front calcula). */
function usesTableOverlapBlocking(rules) {
  if (rules?.reservations?.tableBlocking === 'overlap') return true;
  if (rules?.reservations?.tableBlocking === 'full_day') return false;
  return ['seu_justino', 'pracinha'].includes(rules?.profile);
}

/** Janela estendida de guest lists para eventos rooftop. */
function usesExtendedGuestListWindow(rules) {
  return isRooftop(rules) || rules?.events?.extendedGuestListWindow === true;
}

function previewMergedRules(config, establishmentName, operationalId) {
  return normalizeRules(config || {}, establishmentName, operationalId);
}

async function listOperationalMappings(pool) {
  const { rows } = await pool.query(
    `SELECT legacy_place_id, legacy_bar_id, name, config
       FROM meu_backup_db.establishments
      WHERE legacy_place_id IS NOT NULL OR legacy_bar_id IS NOT NULL`,
  );
  const map = {};
  for (const row of rows) {
    const rules = normalizeRules(row.config || {}, row.name, row.legacy_place_id);
    const barId = getCardapioBarId(rules, row.legacy_place_id);
    if (row.legacy_place_id) map[row.legacy_place_id] = barId;
    if (row.legacy_bar_id) map[row.legacy_bar_id] = barId;
    const aliases = rules.operationalAliases || [];
    for (const a of aliases) map[a] = barId;
  }
  return map;
}

module.exports = {
  getEstablishmentRules,
  clearRulesCache,
  isProfile,
  isRooftop,
  isPracinha,
  getMaxDailyReservations,
  getMaxPartySize,
  getCardapioBarId,
  buildAreasNameFilterSql,
  areaAllowedForRules,
  usesTableOverlapBlocking,
  usesExtendedGuestListWindow,
  listOperationalMappings,
  previewMergedRules,
  LEGACY_PROFILES,
};
