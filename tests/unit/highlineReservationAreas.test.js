const test = require('node:test');
const assert = require('node:assert/strict');
const {
  getHighlineSubareas,
  resolveHighlineSubarea,
  isHighlineEstablishment,
  HIGHLINE_ESTABLISHMENT_ID,
  evaluateHighlineSubareaFromCache,
  pickCombinedTablesForArea,
} = require('../../services/agent/highlineReservationAreas');

const DECK_TABLES = [
  { table_number: '01', capacity: 8 },
  { table_number: '02', capacity: 8 },
  { table_number: '03', capacity: 8 },
  { table_number: '04', capacity: 8 },
  { table_number: '05', capacity: 2 },
  { table_number: '06', capacity: 2 },
  { table_number: '07', capacity: 2 },
  { table_number: '08', capacity: 2 },
  { table_number: '09', capacity: 6 },
  { table_number: '10', capacity: 6 },
  { table_number: '11', capacity: 6 },
  { table_number: '12', capacity: 6 },
  { table_number: '15', capacity: 3 },
  { table_number: '16', capacity: 3 },
  { table_number: '17', capacity: 3 },
];

function buildDeckCache(reserved = []) {
  const tablesByArea = new Map([[2, DECK_TABLES.map((t) => ({ ...t, area_id: 2 }))]]);
  const reservedByArea = new Map([[2, new Set(reserved.map(String))]]);
  return { tablesByArea, reservedByArea };
}

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

test('grupo 50 combina mesas em toda area_id 2 (Deck), não só na subárea', () => {
  const subarea = resolveHighlineSubarea('deck-frente');
  const { tablesByArea, reservedByArea } = buildDeckCache();

  const combo = pickCombinedTablesForArea(tablesByArea, reservedByArea, 2, 50);
  assert.ok(combo);
  assert.ok(combo.total_capacity >= 50);
  assert.ok(combo.mesas_count > 4);

  const evaluation = evaluateHighlineSubareaFromCache(
    subarea,
    50,
    tablesByArea,
    reservedByArea
  );
  assert.equal(evaluation.tem_mesa_para_grupo, true);
  assert.equal(evaluation.mesa_sugerida.escopo_combinacao, 'area');
  assert.ok(evaluation.mesa_sugerida.capacity >= 50);
});

test('grupo 8 ainda cabe numa mesa única do Deck sem combinar', () => {
  const subarea = resolveHighlineSubarea('deck-esquerdo');
  const { tablesByArea, reservedByArea } = buildDeckCache();

  const evaluation = evaluateHighlineSubareaFromCache(
    subarea,
    8,
    tablesByArea,
    reservedByArea
  );
  assert.equal(evaluation.tem_mesa_para_grupo, true);
  assert.equal(evaluation.mesa_sugerida.mesas_combinadas, false);
  assert.equal(evaluation.mesa_sugerida.table_number, '01');
});
