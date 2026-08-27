'use strict';

/**
 * Regras por estabelecimento — lê `establishments.config` (sem mapa hardcoded por ID).
 */

const cache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000;

const DEFAULT_EXCLUDE_AREA_PREFIX = 'Reserva Rooftop - ';

const PROFILE_DEFAULTS = {
  rooftop: {
    reservations: {
      maxDaily: 60,
      areaNamePrefix: 'Reserva Rooftop - ',
      dualShift: true,
      strictHours: true,
    },
    cardapio: { barId: 5 },
    operationalAliases: [5, 9],
  },
  pracinha: {
    reservations: { maxPartySize: 60, excludeAreaPrefix: DEFAULT_EXCLUDE_AREA_PREFIX },
    cardapio: { barId: 4 },
  },
  highline: {
    reservations: { excludeAreaPrefix: DEFAULT_EXCLUDE_AREA_PREFIX },
    cardapio: { barId: 3 },
  },
  oh_fregues: {
    reservations: { excludeAreaPrefix: DEFAULT_EXCLUDE_AREA_PREFIX },
    cardapio: { barId: 2 },
  },
  seu_justino: {
    reservations: { excludeAreaPrefix: DEFAULT_EXCLUDE_AREA_PREFIX },
    cardapio: { barId: 1 },
  },
  sitio_ilha: {
    reservations: { excludeAreaPrefix: DEFAULT_EXCLUDE_AREA_PREFIX },
    cardapio: { barId: 15 },
  },
  generic: {
    reservations: { excludeAreaPrefix: DEFAULT_EXCLUDE_AREA_PREFIX },
  },
};

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
  const fromConfig = raw?.rules ? raw.rules : raw || {};
  const profile =
    raw?.profile ||
    fromConfig.profile ||
    inferProfileFromName(establishmentName);
  const profileDefaults = PROFILE_DEFAULTS[profile] || PROFILE_DEFAULTS.generic;
  const merged = deepMerge(
    { profile, ...profileDefaults },
    fromConfig,
  );
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
    } else {
      // Fallback: places.name (ex.: "Seu Justino") para inferir profile sem config SaaS.
      let placeName = '';
      try {
        const place = await pool.query(
          'SELECT name FROM places WHERE id = $1 LIMIT 1',
          [id],
        );
        placeName = place.rows[0]?.name || '';
      } catch (_placeError) {
        placeName = '';
      }
      rules = normalizeRules({}, placeName, id);
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
  return Number(operationalId);
}

/**
 * Place id ≠ bar id (ex.: Sitio Ilha place 10 / bar 15, Oh Freguês place 4 / bar 2).
 * Preferência: config.cardapio.barId → legacy_bar_id → legacy_place_id.
 */
function resolveCardapioBarIdForEstablishmentRow(row, rules) {
  const fromRules = Number(rules?.cardapio?.barId);
  if (Number.isFinite(fromRules) && fromRules > 0) return fromRules;
  const legacyBar = Number(row?.legacy_bar_id);
  if (Number.isFinite(legacyBar) && legacyBar > 0) return legacyBar;
  const placeId = Number(row?.legacy_place_id);
  if (Number.isFinite(placeId) && placeId > 0) return placeId;
  return null;
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

/**
 * SQL de escopo de áreas por estabelecimento, ADITIVO ao legado:
 *   - áreas próprias do estabelecimento (establishment_id = <id>), OU
 *   - áreas legadas globais (establishment_id IS NULL) que passam no filtro por nome.
 *
 * `establishmentId` é coagido para Number e validado (seguro para inline no SQL).
 */
function buildAreasScopeSql(
  rules,
  establishmentId,
  { nameColumn = 'name', establishmentColumn = 'establishment_id' } = {},
) {
  const nameFilter = buildAreasNameFilterSql(rules, nameColumn);
  const id = Number(establishmentId);
  if (!Number.isFinite(id) || id <= 0) {
    // Sem contexto de estabelecimento: mantém comportamento legado (só filtro por nome).
    return nameFilter;
  }
  return `((${establishmentColumn} = ${id}) OR (${establishmentColumn} IS NULL AND (${nameFilter})))`;
}

/**
 * Estabelecimentos cujo gerenciamento de áreas é CONGELADO (subáreas fixas no
 * código): Highline e Seu Justino. Para esses, não permitimos adoção/CRUD de
 * áreas próprias, preservando a lógica operacional existente.
 */
function areasManagementFrozen(rules) {
  return ['highline', 'seu_justino'].includes(rules?.profile);
}

/**
 * IDs de restaurant_areas canônicos usados pelo modal admin / IA, mesmo quando
 * a linha no banco está com establishment_id de outro lugar (legado compartilhado).
 * Highline: 2=Deck/Bar/Balada, 5=Rooftop, 7001=Rotativo.
 * Seu Justino: 1=Lounge (Área Coberta), 2=Quintal (Área Descoberta).
 */
function getCanonicalAreaIdsForRules(rules) {
  const profile = String(rules?.profile || '').trim().toLowerCase();
  if (profile === 'highline') {
    const rotativo = Number(process.env.HIGHLINE_ROTATIVO_AREA_ID || 7001);
    const ids = [2, 5];
    if (Number.isFinite(rotativo) && rotativo > 0) ids.push(rotativo);
    return ids;
  }
  if (profile === 'seu_justino') {
    return [1, 2];
  }
  return [];
}

/** Fragmento SQL: inclui áreas canônicas do perfil (ids literais seguros). */
function buildCanonicalAreasSql(rules, { idColumn = 'id' } = {}) {
  const ids = getCanonicalAreaIdsForRules(rules)
    .map((n) => Number(n))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (!ids.length) return null;
  return `${idColumn} = ANY(ARRAY[${ids.join(',')}]::int[])`;
}

/**
 * Um estabelecimento é "autogerido" (self-managed) quando já possui áreas
 * próprias (establishment_id = id). Nesse caso passa a ver/editar SOMENTE as
 * suas áreas; caso contrário, usa o catálogo legado por convenção de nome.
 */
async function establishmentHasOwnedAreas(pool, establishmentId) {
  const id = Number(establishmentId);
  if (!Number.isFinite(id) || id <= 0) return false;
  const { rows } = await pool.query(
    'SELECT 1 FROM restaurant_areas WHERE establishment_id = $1 AND is_active = TRUE LIMIT 1',
    [id],
  );
  return rows.length > 0;
}

/**
 * Uma área é permitida para um estabelecimento se for própria dele (establishment_id = id)
 * ou legada global (establishment_id NULL) permitida pelo filtro de nome.
 */
function areaAllowedForEstablishment(rules, area, establishmentId) {
  if (!area) return false;
  const id = Number(establishmentId);
  const areaId = Number(area.id);
  const canonical = new Set(getCanonicalAreaIdsForRules(rules));
  if (Number.isFinite(areaId) && canonical.has(areaId)) {
    return true;
  }
  const areaEstId =
    area.establishment_id != null ? Number(area.establishment_id) : null;
  if (areaEstId != null && Number.isFinite(id) && id > 0) {
    return areaEstId === id;
  }
  if (areaEstId != null) {
    // Área própria de OUTRO estabelecimento
    return false;
  }
  return areaAllowedForRules(rules, area.name);
}

/**
 * SQL de escopo das áreas visíveis para um estabelecimento.
 * Self-managed (já tem áreas próprias): próprias + canônicas do perfil.
 * Caso contrário: catálogo legado por convenção de nome (+ canônicas).
 */
async function areasFilterForEstablishment(pool, establishmentId, { idColumn = 'ra.id', nameColumn = 'ra.name', establishmentColumn = 'ra.establishment_id' } = {}) {
  const rules = await getEstablishmentRules(pool, establishmentId);
  const canonicalSql = buildCanonicalAreasSql(rules, { idColumn });
  if (await establishmentHasOwnedAreas(pool, establishmentId)) {
    const owned = `${establishmentColumn} = ${Number(establishmentId)}`;
    return canonicalSql ? `(${owned} OR ${canonicalSql})` : owned;
  }
  const scopeSql = buildAreasScopeSql(rules, establishmentId, {
    nameColumn,
    establishmentColumn,
  });
  return canonicalSql ? `(${scopeSql} OR ${canonicalSql})` : scopeSql;
}

function usesTableOverlapBlocking(rules) {
  if (rules?.reservations?.tableBlocking === 'overlap') return true;
  if (rules?.reservations?.tableBlocking === 'full_day') return false;
  return ['seu_justino', 'pracinha'].includes(rules?.profile);
}

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
    const barId = resolveCardapioBarIdForEstablishmentRow(row, rules);
    if (!Number.isFinite(barId) || barId <= 0) continue;
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
  resolveCardapioBarIdForEstablishmentRow,
  buildAreasNameFilterSql,
  buildAreasScopeSql,
  areaAllowedForRules,
  areaAllowedForEstablishment,
  areasManagementFrozen,
  getCanonicalAreaIdsForRules,
  buildCanonicalAreasSql,
  establishmentHasOwnedAreas,
  areasFilterForEstablishment,
  usesTableOverlapBlocking,
  usesExtendedGuestListWindow,
  listOperationalMappings,
  previewMergedRules,
};
