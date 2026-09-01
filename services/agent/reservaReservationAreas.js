'use strict';

/**
 * Catálogo operacional Reserva Pinheiros — áreas de reserva.
 * establishment_id operacional = legacy_place_id do slug reserva-pinheiros (ver migration 2026-09-02).
 * Nomes batem com restaurant_areas após migration 2026-08-31.
 */

const RESERVA_SUBAREAS = [
  {
    key: 'deck',
    label: 'Deck',
    areaName: 'Reserva - Deck',
    description: '2 mesas 6p + 1 mesa 8p + 1 mesa 4p',
    capacityPerShift: 24,
  },
  {
    key: 'salao',
    label: 'Salão',
    areaName: 'Reserva - Salão',
    description:
      '90 cadeiras + sofás retos (14p) + sofás L (8p) + banquetas bar (6); exclui mesa diretoria',
    capacityPerShift: 118,
  },
];

function getReservaSubareasForSelect() {
  return RESERVA_SUBAREAS.map(({ key, label, areaName }) => ({ key, label, areaName }));
}

function findReservaSubareaByAreaName(areaName) {
  const normalized = String(areaName || '').trim().toLowerCase();
  return RESERVA_SUBAREAS.find((s) => s.areaName.toLowerCase() === normalized);
}

module.exports = {
  RESERVA_SUBAREAS,
  getReservaSubareasForSelect,
  findReservaSubareaByAreaName,
};
