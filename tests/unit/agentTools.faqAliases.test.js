const test = require('node:test');
const assert = require('node:assert/strict');
const { buildFaqTopicCandidates, matchRichFaqSlug } = require('../../services/agent/agentTools');

test('buildFaqTopicCandidates prioriza dias_horarios_funcionamento para horário', () => {
  const candidates = buildFaqTopicCandidates('qual o horário?');
  assert.equal(candidates[0], 'dias_horarios_funcionamento');
  assert.ok(candidates.includes('horario_funcionamento'));
});

test('buildFaqTopicCandidates roteia valores de entrada', () => {
  const candidates = buildFaqTopicCandidates('preço da entrada vip');
  assert.equal(candidates[0], 'valores_entrada');
});

test('buildFaqTopicCandidates roteia aniversário com fallback legado', () => {
  const candidates = buildFaqTopicCandidates('aniversario');
  assert.equal(candidates[0], 'beneficios_aniversario');
  assert.ok(candidates.includes('aniversarios'));
  assert.ok(candidates.includes('aniversario'));
});

test('buildFaqTopicCandidates roteia bolo e instagram', () => {
  assert.equal(buildFaqTopicCandidates('posso levar bolo?')[0], 'regras_bolo');
  assert.equal(buildFaqTopicCandidates('instagram do local')[0], 'redes_sociais_fotos');
});

test('buildFaqTopicCandidates roteia mesas e camarotes com fallback areas', () => {
  const candidates = buildFaqTopicCandidates('camarote rooftop');
  assert.equal(candidates[0], 'areas_mesas_camarotes_diferenca');
  assert.ok(candidates.includes('areas'));
});

test('matchRichFaqSlug reconhece slug exato enriquecido', () => {
  assert.equal(matchRichFaqSlug('beneficios_aniversario'), 'beneficios_aniversario');
});

test('buildFaqTopicCandidates mantém aliases clássicos sem rota rica', () => {
  assert.deepEqual(buildFaqTopicCandidates('pets'), ['pets', 'pet']);
});
