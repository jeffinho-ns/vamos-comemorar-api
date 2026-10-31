/**
 * Seu Justino: o cliente escolhe só área coberta ou descoberta.
 * A reserva grava uma subárea livre do painel /admin/restaurant-reservations.
 * Coberta = lounges (area_id 1). Descoberta = quintal (area_id 2).
 */

const SEU_JUSTINO_ESTABLISHMENT_ID = 1;

const COBERTA_SUBAREAS = [
  { key: 'lounge-aquario-spaten', label: 'Lounge Aquario Spaten', tables: [{ number: '210', capacity: 8 }] },
  { key: 'lounge-aquario-tv', label: 'Lounge Aquario TV', tables: [{ number: '208', capacity: 10 }] },
  { key: 'lounge-palco', label: 'Lounge Palco', tables: [{ number: '204', capacity: 6 }, { number: '206', capacity: 6 }] },
  { key: 'lounge-bar', label: 'Lounge Bar', tables: [{ number: '200', capacity: 6 }, { number: '202', capacity: 6 }] },
];

const DESCOBERTA_SUBAREAS = [
  {
    key: 'quintal-lateral-esquerdo',
    label: 'Quintal Lateral Esquerdo',
    tables: ['20', '22', '24', '26', '28', '29'].map((number) => ({ number, capacity: 6 })),
  },
  {
    key: 'quintal-central-esquerdo',
    label: 'Quintal Central Esquerdo',
    tables: ['30', '32', '34', '36', '38', '39'].map((number) => ({ number, capacity: 4 })),
  },
  {
    key: 'quintal-central-direito',
    label: 'Quintal Central Direito',
    tables: ['40', '42', '44', '46', '48'].map((number) => ({ number, capacity: 4 })),
  },
  {
    key: 'quintal-lateral-direito',
    label: 'Quintal Lateral Direito',
    tables: ['50', '52', '54', '56', '58', '60', '62', '64'].map((number) => ({ number, capacity: 6 })),
  },
];

const GUEST_ZONES = {
  coberta: { key: 'coberta', area_id: 1, guestLabel: 'área coberta', subareas: COBERTA_SUBAREAS },
  descoberta: { key: 'descoberta', area_id: 2, guestLabel: 'área descoberta', subareas: DESCOBERTA_SUBAREAS },
};

function isSeuJustinoEstablishment(establishmentId) {
  return Number(establishmentId) === SEU_JUSTINO_ESTABLISHMENT_ID;
}

function normalizeZoneText(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function resolveJustinoGuestZone(text) {
  const normalized = normalizeZoneText(text);
  if (!normalized) return null;
  if (/\b(tanto faz|sem preferencia|qualquer uma|qualquer area|tanto coberta quanto)\b/.test(normalized)) {
    return 'qualquer';
  }
  const descoberta = /\b(descoberta|descoberto|quintal|area externa)\b/.test(normalized);
  const coberta = /\b(coberta|coberto|area interna|salao|lounge)\b/.test(normalized);
  if (descoberta && coberta) return null;
  if (descoberta) return 'descoberta';
  if (coberta) return 'coberta';
  return null;
}

function listSubareas() {
  return [
    ...COBERTA_SUBAREAS.map((subarea) => ({ ...subarea, area_id: 1, zone: 'coberta' })),
    ...DESCOBERTA_SUBAREAS.map((subarea) => ({ ...subarea, area_id: 2, zone: 'descoberta' })),
  ];
}

function resolveJustinoSubarea(text) {
  const normalized = normalizeZoneText(text);
  if (!normalized) return null;
  const aliases = [
    ['quintal-lateral-esquerdo', /\blateral esquerdo\b/],
    ['quintal-central-esquerdo', /\bcentral esquerdo\b/],
    ['quintal-central-direito', /\bcentral direito\b/],
    ['quintal-lateral-direito', /\blateral direito\b/],
    ['lounge-aquario-tv', /\baquario tv\b/],
    ['lounge-aquario-spaten', /\bspaten\b|\baquario spaten\b/],
    ['lounge-palco', /\bpalco\b/],
    ['lounge-bar', /\blounge bar\b/],
  ];
  for (const [key, pattern] of aliases) {
    if (pattern.test(normalized)) {
      return listSubareas().find((subarea) => subarea.key === key) || null;
    }
  }
  if (/\blounge\b/.test(normalized) && !/\bquintal\b/.test(normalized)) {
    return { zone: 'coberta', area_id: 1, key: null, label: 'área coberta' };
  }
  if (/\bquintal\b/.test(normalized) && !/\blounge\b/.test(normalized)) {
    return { zone: 'descoberta', area_id: 2, key: null, label: 'área descoberta' };
  }
  return null;
}

function guestZonePromptForClient() {
  return 'Você prefere a área coberta ou a área descoberta?';
}

function listJustinoAreaQuestion() {
  return guestZonePromptForClient();
}

function guestZoneLabel(zone) {
  if (zone === 'coberta') return GUEST_ZONES.coberta.guestLabel;
  if (zone === 'descoberta') return GUEST_ZONES.descoberta.guestLabel;
  return '';
}

function timesOverlap(timeA, timeB, windowMinutes = 120) {
  const parse = (value) => {
    const match = String(value || '').trim().slice(0, 5).match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return null;
    return Number(match[1]) * 60 + Number(match[2]);
  };
  const a = parse(timeA);
  const b = parse(timeB);
  if (a == null || b == null) return true;
  return Math.abs(a - b) < windowMinutes;
}

async function loadReservedTableNumbers(pool, reservationDate, reservationTime) {
  const result = await pool.query(
    `SELECT area_id, table_number,
            LEFT(COALESCE(reservation_time::text, ''), 5) AS reservation_time,
            UPPER(COALESCE(status, '')) AS status
       FROM restaurant_reservations
      WHERE establishment_id = $1
        AND reservation_date = $2
        AND area_id = ANY($3::int[])
        AND UPPER(COALESCE(status, '')) NOT IN ('CANCELLED','CANCELED','CANCELADA','NO_SHOW','NO-SHOW')`,
    [SEU_JUSTINO_ESTABLISHMENT_ID, reservationDate, [1, 2]]
  );
  const focus = reservationTime ? String(reservationTime).trim().slice(0, 5) : null;
  const reserved = new Set();
  for (const row of result.rows || []) {
    const status = String(row.status || '');
    const blocksAllDay = status === 'CONFIRMADA' || !focus;
    const blocksByTime = focus && timesOverlap(focus, row.reservation_time);
    if (!blocksAllDay && !blocksByTime) continue;
    String(row.table_number || '')
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean)
      .forEach((number) => reserved.add(`${row.area_id}:${number}`));
  }
  return reserved;
}

function pickTablesInSubarea(subarea, areaId, reserved, partySize, exclude) {
  const free = subarea.tables.filter((table) => {
    if (exclude.has(String(table.number))) return false;
    return !reserved.has(`${areaId}:${table.number}`);
  });
  const single = free
    .filter((table) => table.capacity >= partySize)
    .sort((a, b) => a.capacity - b.capacity || a.number.localeCompare(b.number, undefined, { numeric: true }));
  if (single[0]) {
    return {
      table_number: single[0].number,
      internalLabel: subarea.label,
      capacity: single[0].capacity,
      combined: null,
    };
  }
  const ordered = [...free].sort((a, b) => b.capacity - a.capacity);
  const chosen = [];
  let sum = 0;
  for (const table of ordered) {
    chosen.push(table);
    sum += table.capacity;
    if (sum >= partySize) break;
  }
  if (!chosen.length || sum < partySize) return null;
  return {
    table_number: chosen.map((table) => table.number).join(','),
    internalLabel: subarea.label,
    capacity: sum,
    combined: {
      mesas_count: chosen.length,
      table_numbers: chosen.map((table) => table.number),
      total_capacity: sum,
      escopo_combinacao: 'subarea',
    },
  };
}

function pickSlotInZone(zoneKey, reserved, partySize, excludeTableNumbers) {
  const zone = GUEST_ZONES[zoneKey];
  if (!zone) return null;
  const exclude = new Set((excludeTableNumbers || []).map((number) => String(number).trim()).filter(Boolean));
  const options = zone.subareas
    .map((subarea) => pickTablesInSubarea(subarea, zone.area_id, reserved, partySize, exclude))
    .filter(Boolean)
    .sort((a, b) => a.capacity - b.capacity || a.table_number.localeCompare(b.table_number));
  const best = options[0];
  if (!best) return null;
  return {
    area_id: zone.area_id,
    table_number: best.table_number,
    internalLabel: best.internalLabel,
    guestLabel: zone.guestLabel,
    zone: zone.key,
    combined: best.combined,
  };
}

async function pickJustinoReservationSlot(
  pool,
  { reservationDate, reservationTime = null, partySize, zone, subareaKey = null, excludeTableNumbers = [] } = {}
) {
  const size = Number(partySize);
  if (!reservationDate || !Number.isFinite(size) || size <= 0) return null;
  const reserved = await loadReservedTableNumbers(pool, reservationDate, reservationTime);
  const exclude = new Set((excludeTableNumbers || []).map((number) => String(number).trim()).filter(Boolean));
  if (subareaKey) {
    const subarea = listSubareas().find((item) => item.key === subareaKey);
    if (!subarea) return null;
    const picked = pickTablesInSubarea(subarea, subarea.area_id, reserved, size, exclude);
    if (!picked) return null;
    return {
      area_id: subarea.area_id,
      table_number: picked.table_number,
      internalLabel: subarea.label,
      guestLabel: subarea.label,
      zone: subarea.zone,
      subareaKey: subarea.key,
      combined: picked.combined,
    };
  }
  if (zone === 'qualquer') {
    return (
      pickSlotInZone('coberta', reserved, size, excludeTableNumbers) ||
      pickSlotInZone('descoberta', reserved, size, excludeTableNumbers)
    );
  }
  return pickSlotInZone(zone, reserved, size, excludeTableNumbers);
}

module.exports = {
  SEU_JUSTINO_ESTABLISHMENT_ID,
  GUEST_ZONES,
  isSeuJustinoEstablishment,
  resolveJustinoGuestZone,
  resolveJustinoSubarea,
  guestZonePromptForClient,
  listJustinoAreaQuestion,
  guestZoneLabel,
  pickJustinoReservationSlot,
};
