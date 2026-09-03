'use strict';

/**
 * IDs operacionais Reserva Rooftop (legado) vs Reserva Pinheiros (novo).
 * Definidos após migration 2026-09-02 (place/bar Pinheiros criados no Render prod).
 */

const RESERVA_ROOFTOP_PLACE_ID = 9;
const RESERVA_ROOFTOP_BAR_ID = 5;
const RESERVA_PINHEIROS_PLACE_ID = 21;
const RESERVA_PINHEIROS_BAR_ID = 18;

function pinheirosPlaceIdFromEnv() {
  return RESERVA_PINHEIROS_PLACE_ID;
}

async function resolveReservaPinheirosPlaceId(_pool) {
  return RESERVA_PINHEIROS_PLACE_ID;
}

function isReservaRooftopOperationalId(id) {
  return Number(id) === RESERVA_ROOFTOP_PLACE_ID || Number(id) === RESERVA_ROOFTOP_BAR_ID;
}

function isReservaPinheirosOperationalId(id) {
  return Number(id) === RESERVA_PINHEIROS_PLACE_ID || Number(id) === RESERVA_PINHEIROS_BAR_ID;
}

/** Bar id do cardápio → place id das reservas. Não mistura as duas casas. */
function canonicalizeReservaEstablishmentId(id) {
  const n = Number(id);
  if (!Number.isFinite(n) || n <= 0) return n;
  if (n === RESERVA_ROOFTOP_BAR_ID) return RESERVA_ROOFTOP_PLACE_ID;
  if (n === RESERVA_PINHEIROS_BAR_ID) return RESERVA_PINHEIROS_PLACE_ID;
  return n;
}

/**
 * IDs para listar reservas: inclui o bar legado (reservas pequenas gravadas
 * com bars.id) sem cruzar Rooftop ↔ Pinheiros.
 */
function queryEstablishmentIdsForReservations(id) {
  const canonical = canonicalizeReservaEstablishmentId(id);
  if (canonical === RESERVA_ROOFTOP_PLACE_ID) {
    return [RESERVA_ROOFTOP_PLACE_ID, RESERVA_ROOFTOP_BAR_ID];
  }
  if (canonical === RESERVA_PINHEIROS_PLACE_ID) {
    return [RESERVA_PINHEIROS_PLACE_ID, RESERVA_PINHEIROS_BAR_ID];
  }
  return Number.isFinite(canonical) && canonical > 0 ? [canonical] : [];
}

module.exports = {
  RESERVA_ROOFTOP_PLACE_ID,
  RESERVA_ROOFTOP_BAR_ID,
  RESERVA_PINHEIROS_PLACE_ID,
  RESERVA_PINHEIROS_BAR_ID,
  pinheirosPlaceIdFromEnv,
  resolveReservaPinheirosPlaceId,
  isReservaRooftopOperationalId,
  isReservaPinheirosOperationalId,
  canonicalizeReservaEstablishmentId,
  queryEstablishmentIdsForReservations,
};
