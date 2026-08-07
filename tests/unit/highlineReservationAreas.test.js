const test = require('node:test');
const assert = require('node:assert/strict');

process.env.HIGHLINE_ESTABLISHMENT_ID = process.env.HIGHLINE_ESTABLISHMENT_ID || '7';

const {
  getHighlineSubareas,
  resolveHighlineSubarea,
  isHighlineEstablishment,
  HIGHLINE_ESTABLISHMENT_ID,
  evaluateHighlineSubareaFromCache,
  pickCombinedTablesForArea,
  resolveHighlineSubareaLabelForTable,
} = require('../../services/agent/highlineReservationAreas');

const DECK_TABLES = [
  { table_number: '01', capacity: 8 },
  { table_number: '02', capacity: 8 },
  { table_number: '03', capacity: 8 },
  { table_number: '04', capacity: 8 },
  { table_number: '09', capacity: 6 },
  { table_number: '10', capacity: 6 },
  { table_number: '11', capacity: 6 },
  { table_number: '12', capacity: 6 },
  { table_number: '13', capacity: 2 },
  { table_number: '14', capacity: 2 },
  { table_number: '15', capacity: 2 },
  { table_number: '16', capacity: 2 },
  { table_number: '17', capacity: 2 },
];

function buildDeckCache(reserved = []) {
  const tablesByArea = new Map([[2, DECK_TABLES.map((t) => ({ ...t, area_id: 2 }))]]);
  const reservedByArea = new Map([[2, new Set(reserved.map(String))]]);
  return { tablesByArea, reservedByArea };
}

test('Highline tem subáreas do painel novo', () => {
  const areas = getHighlineSubareas();
  assert.ok(areas.length >= 11);
  assert.ok(areas.some((a) => a.label === 'Deck - Mesas'));
  assert.ok(areas.some((a) => a.label === 'Bar Central - Bistrôs de Espera'));
  assert.ok(areas.some((a) => a.label === 'Rooftop - Lounges'));
  assert.ok(areas.some((a) => a.label === 'Rotativo - Lista de Espera'));
});

test('resolveHighlineSubarea reconhece labels novos e aliases antigos', () => {
  const sub = resolveHighlineSubarea('Rooftop - Bistrôs');
  assert.ok(sub);
  assert.equal(sub.key, 'roof-bistros');
  assert.equal(sub.area_id, 5);

  const legacy = resolveHighlineSubarea('deck-frente');
  assert.ok(legacy);
  assert.equal(legacy.key, 'deck-mesas');

  const bar = resolveHighlineSubarea('Bar Central');
  assert.ok(bar);
  assert.equal(bar.key, 'bar-central');
});

test('isHighlineEstablishment usa id configurado', () => {
  assert.equal(isHighlineEstablishment(HIGHLINE_ESTABLISHMENT_ID), true);
  assert.equal(isHighlineEstablishment(1), false);
});

test('label por mesa distingue Deck vs Rotativo com area_id', () => {
  assert.equal(resolveHighlineSubareaLabelForTable('01'), 'Deck - Mesas');
  assert.equal(resolveHighlineSubareaLabelForTable('01', 7001), 'Rotativo - Bistrôs de Espera');
  assert.equal(resolveHighlineSubareaLabelForTable('15'), 'Bar Central - Bistrôs de Espera');
  assert.equal(resolveHighlineSubareaLabelForTable('L01', 7001), 'Rotativo - Lista de Espera');
});

test('grupo 50 combina mesas em toda area_id 2 (Deck/Bar/Balada)', () => {
  const subarea = resolveHighlineSubarea('deck-mesas');
  const { tablesByArea, reservedByArea } = buildDeckCache();

  const combo = pickCombinedTablesForArea(tablesByArea, reservedByArea, 2, 50);
  assert.ok(combo);
  assert.ok(combo.total_capacity >= 50);

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
  const subarea = resolveHighlineSubarea('deck-mesas');
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

test('bistrô de espera rotativo respeita máximo de 4 pessoas', () => {
  const subarea = resolveHighlineSubarea('rotativo-espera');
  assert.equal(subarea.maxParty, 4);
  assert.equal(subarea.opsNote.includes('4 pessoas'), true);
});
