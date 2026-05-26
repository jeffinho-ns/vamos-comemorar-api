const test = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizeAreaIdInParams,
} = require('../../services/conversationEngine/processInboundTurn');
const {
  HIGHLINE_ESTABLISHMENT_ID,
} = require('../../services/agent/highlineReservationAreas');

test('normaliza area_id quando LLM retorna label de subárea Highline (Rooftop sozinho)', async () => {
  const params = { area_id: 'Área Rooftop - Direito' };
  await normalizeAreaIdInParams(params, HIGHLINE_ESTABLISHMENT_ID, null);
  assert.equal(params.area_id, 5);
  assert.equal(params.area_label, 'Área Rooftop - Direito');
});

test('normaliza area_id quando vem como string "Deck"', async () => {
  const params = { area_id: 'Área Deck - Frente' };
  await normalizeAreaIdInParams(params, HIGHLINE_ESTABLISHMENT_ID, null);
  assert.equal(params.area_id, 2);
  assert.equal(params.area_label, 'Área Deck - Frente');
});

test('remove area_id quando o texto é ambíguo/desconhecido (não vaza erro técnico)', async () => {
  const params = { area_id: 'Bar Central' };
  await normalizeAreaIdInParams(params, HIGHLINE_ESTABLISHMENT_ID, null);
  // "Bar Central" não existe; mas resolveHighlineSubarea aceita "Bar" como prefixo.
  // O resultado deve ser ID 2 (Área Bar) OU undefined, nunca a string crua.
  assert.ok(params.area_id === 2 || params.area_id === undefined);
  assert.ok(typeof params.area_id !== 'string');
});

test('remove area_id quando o texto não casa com nenhuma subárea', async () => {
  const params = { area_id: 'Terraço VIP Mezanino' };
  await normalizeAreaIdInParams(params, HIGHLINE_ESTABLISHMENT_ID, null);
  assert.equal(params.area_id, undefined);
});

test('mantém area_id quando já vem como número positivo', async () => {
  const params = { area_id: 5 };
  await normalizeAreaIdInParams(params, HIGHLINE_ESTABLISHMENT_ID, null);
  assert.equal(params.area_id, 5);
});

test('converte string numérica em número', async () => {
  const params = { area_id: '2' };
  await normalizeAreaIdInParams(params, HIGHLINE_ESTABLISHMENT_ID, null);
  assert.equal(params.area_id, 2);
});

test('não falha quando params não tem area_id', async () => {
  const params = { client_name: 'João Silva' };
  await normalizeAreaIdInParams(params, HIGHLINE_ESTABLISHMENT_ID, null);
  assert.equal(params.area_id, undefined);
  assert.equal(params.client_name, 'João Silva');
});
