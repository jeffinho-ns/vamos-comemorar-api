const test = require('node:test');
const assert = require('node:assert/strict');
const {
  getHighlineSubareas,
  resolveHighlineSubarea,
  isHighlineEstablishment,
  HIGHLINE_ESTABLISHMENT_ID,
} = require('../../services/agent/highlineReservationAreas');

test('Highline tem 9 subáreas do painel', () => {
  const areas = getHighlineSubareas();
  assert.equal(areas.length, 9);
  assert.ok(areas.some((a) => a.label === 'Área Deck - Frente'));
  assert.ok(areas.some((a) => a.label === 'Área Rooftop - Vista'));
});

test('resolveHighlineSubarea reconhece labels', () => {
  const sub = resolveHighlineSubarea('Área Rooftop - Bistrô');
  assert.ok(sub);
  assert.equal(sub.key, 'roof-bistro');
  assert.equal(sub.area_id, 5);
});

test('isHighlineEstablishment usa id configurado', () => {
  assert.equal(isHighlineEstablishment(HIGHLINE_ESTABLISHMENT_ID), true);
  assert.equal(isHighlineEstablishment(1), false);
});
