/**
 * Capacidade por área (Camarotes / Áreas VIP / Rooftop) no momento de confirmar reserva.
 * Cálculo no servidor — não confiar em números enviados pelo cliente.
 */

const {
  resolveHighlineSubareaLabelForTable,
  isHighlineEstablishment,
} = require('./agent/highlineReservationAreas');

const EXCLUDED_STATUS_SQL = `
  UPPER(REPLACE(COALESCE(status, ''), '-', '_')) NOT IN (
    'CANCELLED', 'CANCELED', 'CANCELADA',
    'COMPLETED', 'CONCLUIDA', 'CONCLUÍDA', 'FINALIZADA', 'FINALIZED',
    'NO_SHOW', 'NOSHOW'
  )
`;

function normalizeLabel(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Áreas que exigem aviso/bloqueio de capacidade ao confirmar.
 * Apenas camarote, área VIP e rooftop (comparação sem acento/caixa).
 * Não trata "Bar Central" nem "Terraço" como gatilho.
 */
function isCapacityRestrictedAreaName(name) {
  const n = normalizeLabel(name);
  if (!n) return false;
  if (/\bcamarotes?\b/.test(n)) return true;
  if (/\brooftop\b/.test(n)) return true;
  if (/\bareas?\s+vip\b/.test(n)) return true;
  if (n === 'vip') return true;
  return false;
}

function isConfirmingStatus(status) {
  const s = String(status || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/_/g, '-');
  return s === 'confirmed' || s === 'confirmada';
}

function resolveAreaCapacity(areaRow) {
  if (!areaRow) return 0;
  const dinner = Math.max(0, Number(areaRow.capacity_dinner) || 0);
  const lunch = Math.max(0, Number(areaRow.capacity_lunch) || 0);
  const generic =
    areaRow.capacity != null ? Math.max(0, Number(areaRow.capacity) || 0) : 0;
  if (dinner > 0) return dinner;
  if (lunch > 0) return lunch;
  return generic;
}

function emptyResult(overrides = {}) {
  return {
    applies: false,
    area_name: null,
    capacity: 0,
    reserved_people: 0,
    requested_people: 0,
    fits: true,
    remaining: null,
    ...overrides,
  };
}

function pickRestrictedLabel(candidates) {
  for (const c of candidates) {
    if (isCapacityRestrictedAreaName(c)) return String(c).trim();
  }
  return null;
}

/**
 * @param {import('pg').Pool} pool
 * @param {object} args
 * @param {number} [args.reservationId]
 * @param {number} [args.areaId]
 * @param {string} [args.reservationDate] YYYY-MM-DD
 * @param {number} [args.establishmentId]
 * @param {number} [args.requestedPeople]
 * @param {number} [args.excludeReservationId]
 * @param {string} [args.areaDisplayName]
 * @param {string} [args.tableNumber]
 */
async function checkAreaCapacity(pool, args = {}) {
  const reservationId = Number(args.reservationId) || null;
  let areaId = args.areaId != null ? Number(args.areaId) : null;
  let reservationDate = args.reservationDate
    ? String(args.reservationDate).slice(0, 10)
    : null;
  let establishmentId =
    args.establishmentId != null ? Number(args.establishmentId) : null;
  let requestedPeople =
    args.requestedPeople != null ? Math.max(0, Number(args.requestedPeople) || 0) : null;
  let areaDisplayName =
    args.areaDisplayName != null ? String(args.areaDisplayName) : null;
  let tableNumber = args.tableNumber != null ? String(args.tableNumber) : null;
  let areaNameFromDb = null;
  let excludeReservationId =
    args.excludeReservationId != null
      ? Number(args.excludeReservationId)
      : reservationId;

  if (reservationId) {
    const rr = await pool.query(
      `
      SELECT
        rr.id,
        rr.area_id,
        rr.reservation_date,
        rr.establishment_id,
        rr.number_of_people,
        rr.area_display_name,
        rr.table_number,
        COALESCE(NULLIF(TRIM(rr.area_display_name), ''), ra.name) AS area_name,
        ra.name AS restaurant_area_name,
        ra.capacity_dinner,
        ra.capacity_lunch
      FROM restaurant_reservations rr
      LEFT JOIN restaurant_areas ra ON ra.id = rr.area_id
      WHERE rr.id = $1
      `,
      [reservationId]
    );
    if (!rr.rows[0]) {
      const err = new Error('Reserva não encontrada');
      err.statusCode = 404;
      throw err;
    }
    const row = rr.rows[0];
    areaId = areaId != null && Number.isFinite(areaId) ? areaId : Number(row.area_id) || null;
    reservationDate =
      reservationDate ||
      (row.reservation_date ? String(row.reservation_date).slice(0, 10) : null);
    establishmentId =
      establishmentId != null && Number.isFinite(establishmentId)
        ? establishmentId
        : Number(row.establishment_id) || null;
    if (requestedPeople == null) {
      requestedPeople = Math.max(0, Number(row.number_of_people) || 0);
    }
    areaDisplayName = areaDisplayName || row.area_display_name || null;
    tableNumber = tableNumber || row.table_number || null;
    areaNameFromDb = row.restaurant_area_name || row.area_name || null;

    if (!args._areaRow && row.area_id) {
      args._areaRow = {
        capacity_dinner: row.capacity_dinner,
        capacity_lunch: row.capacity_lunch,
        name: row.restaurant_area_name,
      };
    }
  }

  if (!areaId || !reservationDate || !establishmentId) {
    return emptyResult({
      requested_people: requestedPeople || 0,
    });
  }

  let areaRow = args._areaRow || null;
  if (!areaRow) {
    const areaResult = await pool.query(
      `
      SELECT id, name, capacity_dinner, capacity_lunch, establishment_id
      FROM restaurant_areas
      WHERE id = $1
      `,
      [areaId]
    );
    areaRow = areaResult.rows[0] || null;
  }

  if (areaRow && areaRow.establishment_id != null) {
    const areaEst = Number(areaRow.establishment_id);
    if (
      Number.isFinite(areaEst) &&
      areaEst > 0 &&
      areaEst !== Number(establishmentId)
    ) {
      const err = new Error('Área não pertence a este estabelecimento');
      err.statusCode = 403;
      throw err;
    }
  }

  areaNameFromDb = areaNameFromDb || areaRow?.name || null;

  const highlineLabel =
    isHighlineEstablishment(establishmentId) && tableNumber
      ? resolveHighlineSubareaLabelForTable(tableNumber, areaId)
      : null;

  const labelCandidates = [
    areaDisplayName,
    highlineLabel,
    areaNameFromDb,
  ].filter(Boolean);

  const restrictedLabel = pickRestrictedLabel(labelCandidates);
  const applies = Boolean(restrictedLabel);

  if (!applies) {
    return emptyResult({
      area_name: areaNameFromDb || areaDisplayName || null,
      requested_people: requestedPeople || 0,
    });
  }

  const capacity = resolveAreaCapacity(areaRow);
  const people =
    requestedPeople != null && Number.isFinite(requestedPeople)
      ? Math.max(0, requestedPeople)
      : 0;

  const reservedResult = await pool.query(
    `
    SELECT COALESCE(SUM(number_of_people), 0)::int AS total_people
    FROM restaurant_reservations
    WHERE reservation_date = $1
      AND area_id = $2
      AND establishment_id = $3
      AND ($4::int IS NULL OR id <> $4)
      AND ${EXCLUDED_STATUS_SQL}
    `,
    [
      reservationDate,
      areaId,
      establishmentId,
      excludeReservationId && Number.isFinite(excludeReservationId)
        ? excludeReservationId
        : null,
    ]
  );

  const reservedPeople = Math.max(
    0,
    parseInt(reservedResult.rows[0]?.total_people, 10) || 0
  );

  const capacityConfigured = capacity > 0;
  const totalAfter = reservedPeople + people;
  const fits = !capacityConfigured || totalAfter <= capacity;
  const remaining = capacityConfigured ? capacity - totalAfter : null;

  return {
    applies: true,
    area_name: restrictedLabel || areaNameFromDb,
    capacity,
    reserved_people: reservedPeople,
    requested_people: people,
    fits,
    remaining,
  };
}

module.exports = {
  normalizeLabel,
  isCapacityRestrictedAreaName,
  isConfirmingStatus,
  resolveAreaCapacity,
  checkAreaCapacity,
};
