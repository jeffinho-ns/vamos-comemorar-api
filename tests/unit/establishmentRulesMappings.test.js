'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  resolveCardapioBarIdForEstablishmentRow,
  previewMergedRules,
  usesExtendedGuestListWindow,
} = require('../../services/establishmentRules');

test('Sitio Ilha: profile default aponta cardapio.barId 15', () => {
  const rules = previewMergedRules({}, 'Sitio Ilha', 10);
  assert.equal(rules.profile, 'sitio_ilha');
  assert.equal(Number(rules.cardapio?.barId), 15);
});

test('resolveCardapioBarIdForEstablishmentRow: place 10 + legacy_bar 15 => 15', () => {
  const barId = resolveCardapioBarIdForEstablishmentRow(
    { legacy_place_id: 10, legacy_bar_id: 15, name: 'Sitio Ilha' },
    previewMergedRules({}, 'Sitio Ilha', 10),
  );
  assert.equal(barId, 15);
});

test('resolveCardapioBarIdForEstablishmentRow: sem config usa legacy_bar_id', () => {
  const barId = resolveCardapioBarIdForEstablishmentRow(
    { legacy_place_id: 4, legacy_bar_id: 2, name: 'Oh Fregues' },
    { cardapio: {} },
  );
  assert.equal(barId, 2);
});

test('Reserva Pinheiros: check-ins usam só o dia do evento (sem janela estendida)', () => {
  const rules = previewMergedRules({ profile: 'reserva' }, 'Reserva Pinheiros', 9);
  assert.equal(rules.profile, 'reserva');
  assert.equal(usesExtendedGuestListWindow(rules), false);
});

test('Rooftop legado: mantém janela estendida para check-ins', () => {
  const rules = previewMergedRules({ profile: 'rooftop' }, 'Reserva Rooftop', 9);
  assert.equal(usesExtendedGuestListWindow(rules), true);
});
