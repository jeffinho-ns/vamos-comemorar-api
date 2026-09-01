'use strict';

/**
 * IDs operacionais Reserva Rooftop (legado) vs Reserva Pinheiros (novo).
 * Pinheiros resolve do env ou slug no banco após migration 2026-09-02.
 */

const RESERVA_ROOFTOP_PLACE_ID = 9;
const RESERVA_ROOFTOP_BAR_ID = 5;

let cachedPinheirosPlaceId = null;
let cacheAt = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

function pinheirosPlaceIdFromEnv() {
  const raw = Number(process.env.RESERVA_PINHEIROS_PLACE_ID);
  return Number.isFinite(raw) && raw > 0 ? raw : null;
}

async function resolveReservaPinheirosPlaceId(pool) {
  const fromEnv = pinheirosPlaceIdFromEnv();
  if (fromEnv) return fromEnv;

  if (cachedPinheirosPlaceId && Date.now() - cacheAt < CACHE_TTL_MS) {
    return cachedPinheirosPlaceId;
  }

  if (!pool) return null;

  try {
    const { rows } = await pool.query(
      `SELECT legacy_place_id
         FROM meu_backup_db.establishments
        WHERE lower(slug) = 'reserva-pinheiros'
        LIMIT 1`,
    );
    const id = Number(rows[0]?.legacy_place_id);
    if (Number.isFinite(id) && id > 0) {
      cachedPinheirosPlaceId = id;
      cacheAt = Date.now();
      return id;
    }
  } catch (err) {
    console.warn('[reservaEstablishmentIds] resolve pinheiros:', err.message);
  }
  return null;
}

function isReservaRooftopOperationalId(id) {
  return Number(id) === RESERVA_ROOFTOP_PLACE_ID || Number(id) === RESERVA_ROOFTOP_BAR_ID;
}

module.exports = {
  RESERVA_ROOFTOP_PLACE_ID,
  RESERVA_ROOFTOP_BAR_ID,
  pinheirosPlaceIdFromEnv,
  resolveReservaPinheirosPlaceId,
  isReservaRooftopOperationalId,
};
