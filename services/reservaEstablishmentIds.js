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

module.exports = {
  RESERVA_ROOFTOP_PLACE_ID,
  RESERVA_ROOFTOP_BAR_ID,
  RESERVA_PINHEIROS_PLACE_ID,
  RESERVA_PINHEIROS_BAR_ID,
  pinheirosPlaceIdFromEnv,
  resolveReservaPinheirosPlaceId,
  isReservaRooftopOperationalId,
  isReservaPinheirosOperationalId,
};
