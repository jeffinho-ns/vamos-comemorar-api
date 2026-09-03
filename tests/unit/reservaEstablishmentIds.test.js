'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  RESERVA_ROOFTOP_PLACE_ID,
  RESERVA_ROOFTOP_BAR_ID,
  RESERVA_PINHEIROS_PLACE_ID,
  RESERVA_PINHEIROS_BAR_ID,
  canonicalizeReservaEstablishmentId,
  queryEstablishmentIdsForReservations,
} = require('../../services/reservaEstablishmentIds');
const { normalizeCanonicalEstablishmentId } = require('../../services/whatsappReservationService');
const { getDefaultWindowsForEstablishmentId } = require('../../services/operationalHours/defaultWeeklySchedule');
const { previewMergedRules, buildAreasNameFilterSql } = require('../../services/establishmentRules');

test('canonicalizeReservaEstablishmentId: bar Rooftop (5) vira place 9; bar Pinheiros (18) vira place 21', () => {
  assert.equal(canonicalizeReservaEstablishmentId(5), RESERVA_ROOFTOP_PLACE_ID);
  assert.equal(canonicalizeReservaEstablishmentId(9), RESERVA_ROOFTOP_PLACE_ID);
  assert.equal(canonicalizeReservaEstablishmentId(18), RESERVA_PINHEIROS_PLACE_ID);
  assert.equal(canonicalizeReservaEstablishmentId(21), RESERVA_PINHEIROS_PLACE_ID);
  assert.equal(canonicalizeReservaEstablishmentId(7), 7);
});

test('queryEstablishmentIdsForReservations inclui alias de bar sem misturar as duas casas', () => {
  assert.deepEqual(
    queryEstablishmentIdsForReservations(RESERVA_ROOFTOP_PLACE_ID).sort((a, b) => a - b),
    [RESERVA_ROOFTOP_BAR_ID, RESERVA_ROOFTOP_PLACE_ID],
  );
  assert.deepEqual(
    queryEstablishmentIdsForReservations(RESERVA_PINHEIROS_PLACE_ID).sort((a, b) => a - b),
    [RESERVA_PINHEIROS_BAR_ID, RESERVA_PINHEIROS_PLACE_ID],
  );
  assert.deepEqual(queryEstablishmentIdsForReservations(7), [7]);
});

test('normalizeCanonicalEstablishmentId não manda Pinheiros para o Rooftop', () => {
  assert.equal(normalizeCanonicalEstablishmentId(21, 'Reserva Pinheiros'), 21);
  assert.equal(normalizeCanonicalEstablishmentId(18, 'Reserva Pinheiros'), 21);
  assert.equal(normalizeCanonicalEstablishmentId(9, 'Reserva Rooftop'), 9);
  assert.equal(normalizeCanonicalEstablishmentId(5, 'Reserva Rooftop'), 9);
});

test('normalizeCanonicalEstablishmentId: "rooftop" sozinho não sequestra para place 9', () => {
  assert.equal(normalizeCanonicalEstablishmentId(7, 'área rooftop'), 7);
});

test('Pinheiros (21) tem janela padrão de restaurante (não herda giros do Rooftop)', () => {
  const friday = getDefaultWindowsForEstablishmentId(21, '2026-09-04');
  assert.ok(friday.length >= 1);
  assert.equal(friday[0], '12:00-22:30');
});

test('áreas: Rooftop filtra prefixo Reserva Rooftop; Pinheiros filtra Reserva - ', () => {
  const rooftop = previewMergedRules({ profile: 'rooftop' }, 'Reserva Rooftop', 9);
  const pinheiros = previewMergedRules({ profile: 'reserva' }, 'Reserva Pinheiros', 21);
  assert.equal(buildAreasNameFilterSql(rooftop, 'name').includes('Reserva Rooftop - '), true);
  assert.equal(buildAreasNameFilterSql(pinheiros, 'name').includes('Reserva - '), true);
  assert.equal(buildAreasNameFilterSql(rooftop, 'name').includes("ILIKE 'Reserva - %'"), false);
});
