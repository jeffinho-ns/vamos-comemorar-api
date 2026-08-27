'use strict';

/**
 * Helpers dos bloqueios de agenda (datas, horários, áreas, conflito).
 * Separado de agendaBlocks.js para manter os arquivos curtos.
 */

const { todayIsoSp } = require('./dateUtils');
const { areasFilterForEstablishment } = require('../establishmentRules');

const WEEKDAYS = [
  ['domingo'],
  ['segunda', 'segunda-feira'],
  ['terca', 'terça', 'terca-feira', 'terça-feira'],
  ['quarta', 'quarta-feira'],
  ['quinta', 'quinta-feira'],
  ['sexta', 'sexta-feira'],
  ['sabado', 'sábado'],
];

function normalize(text) {
  return String(text || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function addDaysIso(iso, days) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

/** Aceita YYYY-MM-DD, DD/MM, DD/MM/YYYY, hoje, amanhã, dia da semana. */
function parseFlexibleDate(input) {
  const raw = String(input || '').trim();
  if (!raw) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

  const today = todayIsoSp();
  const n = normalize(raw);

  if (n === 'hoje') return today;
  if (n === 'amanha') return addDaysIso(today, 1);
  if (n === 'depois de amanha' || n === 'depois-de-amanha') return addDaysIso(today, 2);

  const br = raw.match(/^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?$/);
  if (br) {
    const day = Number(br[1]);
    const month = Number(br[2]);
    let year = br[3] ? Number(br[3]) : Number(today.slice(0, 4));
    if (year < 100) year += 2000;
    if (day < 1 || day > 31 || month < 1 || month > 12) return null;
    const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    // "15/09" sem ano e já passou → assume próximo ano.
    if (!br[3] && iso < today) {
      return `${year + 1}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
    return iso;
  }

  const weekdayIndex = WEEKDAYS.findIndex((names) => names.includes(n));
  if (weekdayIndex >= 0) {
    const [y, m, d] = today.split('-').map(Number);
    const current = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    const delta = (weekdayIndex - current + 7) % 7 || 7;
    return addDaysIso(today, delta);
  }

  return null;
}

function formatBr(iso) {
  const [y, m, d] = String(iso).split('-');
  return `${d}/${m}/${y}`;
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
 * Fim antes do início (ex.: 22h → 02h) fecha no fim do dia, sem virar madrugada.
 */
function blockBounds(dateIso, startTime, endTime) {
  const start = startTime || '00:00:00';
  let end = endTime || '23:59:59';
  if (end <= start) end = '23:59:59';
  return {
    start: `${dateIso} ${start}`,
    end: `${dateIso} ${end}`,
    fullDay: !startTime && !endTime,
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

/** Resolve área pelo nome dentro do escopo da casa. */
async function resolveArea(pool, establishmentId, areaName) {
  const wanted = normalizeAreaName(areaName);
  if (!wanted) return { area: null, options: [] };

  const scopeSql = await areasFilterForEstablishment(pool, establishmentId);
  const { rows } = await pool.query(
    `SELECT ra.id, ra.name
       FROM restaurant_areas ra
      WHERE ra.is_active = TRUE
        AND ${scopeSql}
      ORDER BY ra.name`
  );

  const options = rows.map((r) => ({ id: r.id, name: r.name }));
  const exact = options.find((o) => normalizeAreaName(o.name) === wanted);
  if (exact) return { area: exact, options };

  const partial = options.filter(
    (o) => normalizeAreaName(o.name).includes(wanted) || wanted.includes(normalizeAreaName(o.name))
  );
  if (partial.length === 1) return { area: partial[0], options };

  return { area: null, options, ambiguous: partial.length > 1 ? partial : null };
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
  resolveArea,
  describeScope,
  findBlocksOnDate,
  conflictingBlocks,
};
