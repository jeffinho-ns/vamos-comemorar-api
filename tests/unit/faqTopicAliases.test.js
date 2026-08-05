const test = require('node:test');
const assert = require('node:assert/strict');
const { expandFaqTopicSeedAliases } = require('../../services/agent/faqTopicCanonical');
const { detectRelevantFaqTopics } = require('../../services/agent/faqPrefetchService');

test('expandFaqTopicSeedAliases inclui horario_funcionamento e dias_horarios_funcionamento', () => {
  const expanded = expandFaqTopicSeedAliases(['dias_horarios_funcionamento']);
  assert.ok(expanded.includes('dias_horarios_funcionamento'));
  assert.ok(expanded.includes('horario_funcionamento'));
});

test('expandFaqTopicSeedAliases inclui variantes de aniversario e areas', () => {
  const expanded = expandFaqTopicSeedAliases(['beneficios_aniversario', 'areas_mesas_camarotes_diferenca']);
  assert.ok(expanded.includes('aniversarios'));
  assert.ok(expanded.includes('areas'));
});

test('detectRelevantFaqTopics não injeta tópicos Highline no funil de casa genérica', () => {
  const topics = detectRelevantFaqTopics('quero reservar para sábado', [], {
    funnelActive: true,
    establishmentId: 1,
    establishmentName: 'Pracinha do Seu Justino',
  });

  assert.equal(topics.includes('reserva_areas_operacional_highline'), false);
  assert.equal(topics.includes('reserva_grupos_grandes_highline'), false);
});

test('detectRelevantFaqTopics injeta tópicos Highline no funil da Highline', () => {
  const topics = detectRelevantFaqTopics('quero reservar para sábado', [], {
    funnelActive: true,
    establishmentId: Number(process.env.HIGHLINE_ESTABLISHMENT_ID || 7),
    establishmentName: 'Highline',
  });

  assert.ok(topics.includes('reserva_areas_operacional_highline'));
  assert.ok(topics.includes('coleta_dados_progressiva_reserva'));
});
