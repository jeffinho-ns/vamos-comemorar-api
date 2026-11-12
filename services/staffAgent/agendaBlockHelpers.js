'use strict';

/**
 * Helpers dos bloqueios de agenda (datas, horários, áreas, conflito).
 * Separado de agendaBlocks.js para manter os arquivos curtos.
 */

const { parseFlexibleDate, formatBr } = require('./dateUtils');
const { areasFilterForEstablishment } = require('../establishmentRules');

/** Aliases comuns → nomes/trechos que podem aparecer em restaurant_areas. */
const AREA_ALIAS_GROUPS = [
  ['rooftop', 'roof top', 'terraco', 'terraço', 'cobertura', 'roof'],
  ['deck', 'area descoberta', 'área descoberta', 'bar central', 'balada'],
  ['vip', 'area vip', 'área vip', 'lounge vip'],
  ['camarote', 'camarotes'],
  ['pista', 'pista de danca', 'pista de dança'],
  ['salao', 'salão', 'salao principal', 'salão principal'],
];

function normalize(text) {
  return String(text || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/** Aceita "18:30", "18h", "18", "18h30". Retorna "HH:MM:SS" ou null. */
function parseTimeHHMM(input) {
  const raw = String(input || '').trim();
  if (!raw) return null;
  const m = raw.match(/^(\d{1,2})(?:[:h](\d{2}))?h?$/i);
  if (!m) return null;
  const hour = Number(m[1]);
  const minute = m[2] ? Number(m[2]) : 0;
  if (hour > 23 || minute > 59) return null;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`;
}

/**
 * Janela do bloqueio. Sem horários = dia inteiro.
 * Com endDateIso, atravessa vários dias (um único block contínuo).
 * Fim antes do início no mesmo dia fecha no fim do dia, sem virar madrugada.
 */
function blockBounds(dateIso, startTime, endTime, endDateIso = null) {
  const start = startTime || '00:00:00';
  let end = endTime || '23:59:59';
  const endDate = endDateIso && endDateIso >= dateIso ? endDateIso : dateIso;
  if (endDate === dateIso && end <= start) end = '23:59:59';
  return {
    start: `${dateIso} ${start}`,
    end: `${endDate} ${end}`,
    fullDay: !startTime && !endTime,
    endDateIso: endDate,
  };
}

function formatTimeRange(startDatetime, endDatetime) {
  const start = String(startDatetime).slice(11, 16);
  const end = String(endDatetime).slice(11, 16);
  if (start === '00:00' && (end === '23:59' || end === '00:00')) return 'dia inteiro';
  return `das ${start} às ${end}`;
}

function normalizeAreaName(name) {
  return normalize(name).replace(/\s+/g, ' ');
}

function aliasGroupFor(wanted) {
  const n = normalizeAreaName(wanted);
  if (!n) return null;
  return (
    AREA_ALIAS_GROUPS.find((group) =>
      group.some((alias) => n === alias || n.includes(alias) || alias.includes(n))
    ) || null
  );
}

function matchByAliasGroup(options, wanted) {
  const group = aliasGroupFor(wanted);
  if (!group) return [];
  return options.filter((o) => {
    const name = normalizeAreaName(o.name);
    return group.some((alias) => name === alias || name.includes(alias) || alias.includes(name));
  });
}

/**
 * Highline: Rooftop (legado Terraço = area_id 5) e Deck (area_id 2).
 * Só aplica quando a casa é Highline e o id está nas opções.
 */
function matchHighlineCanonicalArea(establishmentId, options, wanted) {
  let isHighline = Number(establishmentId) === 7;
  let rooftopId = 5;
  let deckId = 2;
  try {
    const highline = require('../agent/highlineReservationAreas');
    if (typeof highline.isHighlineEstablishment === 'function') {
      isHighline = highline.isHighlineEstablishment(establishmentId);
    }
    const subs = Array.isArray(highline.HIGHLINE_SUBAREAS) ? highline.HIGHLINE_SUBAREAS : [];
    const roof = subs.find((s) => String(s.zone || '').toUpperCase() === 'ROOFTOP');
    const deck = subs.find((s) => String(s.zone || '').toUpperCase() === 'DECK');
    if (roof?.area_id) rooftopId = Number(roof.area_id);
    if (deck?.area_id) deckId = Number(deck.area_id);
  } catch (_) {
    /* catálogo opcional */
  }
  if (!isHighline) return null;
  const n = normalizeAreaName(wanted);
  const pick = (id) => options.find((o) => Number(o.id) === Number(id)) || null;
  if (['rooftop', 'terraco', 'cobertura', 'roof'].some((a) => n === a || n.includes(a))) {
    return pick(rooftopId);
  }
  if (['deck', 'bar central', 'area descoberta', 'balada'].some((a) => n === a || n.includes(a))) {
    return pick(deckId);
  }
  return null;
}

async function listAreasForEstablishment(pool, establishmentId) {
  const scopeSql = await areasFilterForEstablishment(pool, establishmentId);
  const { rows } = await pool.query(
    `SELECT ra.id, ra.name
       FROM restaurant_areas ra
      WHERE ra.is_active = TRUE
        AND ${scopeSql}
      ORDER BY ra.name`
  );
  return rows.map((r) => ({ id: r.id, name: r.name }));
}

/** Resolve área pelo nome dentro do escopo da casa (com aliases). */
async function resolveArea(pool, establishmentId, areaName) {
  const wanted = normalizeAreaName(areaName);
  if (!wanted) return { area: null, options: [] };

  const options = await listAreasForEstablishment(pool, establishmentId);
  const exact = options.find((o) => normalizeAreaName(o.name) === wanted);
  if (exact) return { area: exact, options };

  const highlineHit = matchHighlineCanonicalArea(establishmentId, options, wanted);
  if (highlineHit) return { area: highlineHit, options };

  const aliasHits = matchByAliasGroup(options, wanted);
  if (aliasHits.length === 1) return { area: aliasHits[0], options };
  if (aliasHits.length > 1) return { area: null, options, ambiguous: aliasHits };

  const partial = options.filter(
    (o) => normalizeAreaName(o.name).includes(wanted) || wanted.includes(normalizeAreaName(o.name))
  );
  if (partial.length === 1) return { area: partial[0], options };

  return { area: null, options, ambiguous: partial.length > 1 ? partial : null };
}

/**
 * Casa com módulo reservas ativo (org ∩ establishment_modules).
 * Fallback legado: se já tem áreas ativas no escopo, considera operacional.
 */
async function establishmentHasReservasModule(pool, establishmentId) {
  try {
    const { rows } = await pool.query(
      `SELECT 1
         FROM meu_backup_db.establishments e
         JOIN meu_backup_db.organization_modules om
           ON om.organization_id = e.organization_id
          AND om.module_key = 'reservas'
          AND COALESCE(om.is_enabled, TRUE) = TRUE
        WHERE (e.legacy_place_id = $1 OR e.id = $1)
          AND (
            NOT EXISTS (
              SELECT 1 FROM meu_backup_db.establishment_modules em0
               WHERE em0.establishment_id = e.id
            )
            OR EXISTS (
              SELECT 1 FROM meu_backup_db.establishment_modules em
               WHERE em.establishment_id = e.id
                 AND em.module_key = 'reservas'
                 AND COALESCE(em.is_enabled, TRUE) = TRUE
            )
          )
        LIMIT 1`,
      [establishmentId]
    );
    if (rows.length) return true;
  } catch (e) {
    console.warn('[staffAgent] check módulo reservas:', e.message);
  }

  try {
    const areas = await listAreasForEstablishment(pool, establishmentId);
    return areas.length > 0;
  } catch (_) {
    return false;
  }
}

function describeScope(areaName, startDatetime, endDatetime) {
  const where = areaName ? `a área ${areaName}` : 'a casa inteira';
  const when = formatTimeRange(startDatetime, endDatetime);
  return `${where} (${when})`;
}

async function findBlocksOnDate(pool, establishmentId, dateIso) {
  const { rows } = await pool.query(
    `SELECT b.id, b.reason, b.area_id, b.start_datetime, b.end_datetime, ra.name AS area_name
       FROM restaurant_reservation_blocks b
       LEFT JOIN restaurant_areas ra ON ra.id = b.area_id
      WHERE b.establishment_id = $1
        AND b.start_datetime::date <= $2
        AND b.end_datetime::date >= $2
      ORDER BY b.start_datetime ASC`,
    [establishmentId, dateIso]
  );
  return rows;
}

/**
 * Conflita quando os horários se sobrepõem E os escopos se tocam:
 * bloqueio geral (area_id NULL) conflita com qualquer área.
 */
function conflictingBlocks(blocks, { areaId, start, end }) {
  return blocks.filter((b) => {
    const sameScope =
      b.area_id == null || areaId == null || Number(b.area_id) === Number(areaId);
    if (!sameScope) return false;
    const bStart = String(b.start_datetime).replace('T', ' ').slice(0, 19);
    const bEnd = String(b.end_datetime).replace('T', ' ').slice(0, 19);
    return bStart <= end && bEnd >= start;
  });
}

module.exports = {
  parseFlexibleDate,
  parseTimeHHMM,
  blockBounds,
  formatBr,
  formatTimeRange,
  normalizeAreaName,
  resolveArea,
  listAreasForEstablishment,
  establishmentHasReservasModule,
  describeScope,
  findBlocksOnDate,
  conflictingBlocks,
};
