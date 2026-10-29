const test = require('node:test');
const assert = require('node:assert/strict');
const { detectFaqTopicsFromUserText, canonicalizeAdminFaqTopic } = require('../../services/agent/faqTopicCanonical');
const { SEU_JUSTINO_FAQS } = require('../../services/agent/seuJustinoFaqCatalog');
const { stripMetaInstructionsFromAnswer, isCustomerFacingFaqEntry } = require('../../services/agent/faqPromptFilter');

test('sábado do Seu Justino entra antes do horário genérico', () => {
  const topics = detectFaqTopicsFromUserText('como funciona aos sábados?');
  assert.equal(topics[0], 'informacoes_sabado');
  assert.ok(topics.includes('dias_horarios_funcionamento'));
  assert.ok(topics.includes('valores_entrada'));
});

test('15/11 não puxa o domingo comum', () => {
  const topics = detectFaqTopicsFromUserText('quero reservar no feriado de 15/11');
  assert.ok(topics.includes('programacao_15_11'));
  assert.equal(topics.includes('informacoes_domingo'), false);
});

test('aniversário continua só no tópico de benefícios', () => {
  const topics = detectFaqTopicsFromUserText('Quais as vantagens para aniversariante no HighLine?');
  assert.deepEqual(topics, ['beneficios_aniversario']);
});

test('réveillon, pagamento e currículo acham o tópico certo', () => {
  assert.ok(detectFaqTopicsFromUserText('vai ter réveillon no dia 31/12?').includes('reveillon'));
  assert.ok(detectFaqTopicsFromUserText('aceita pix e vale refeição?').includes('formas_pagamento'));
  assert.ok(detectFaqTopicsFromUserText('quero enviar meu currículo').includes('vagas_emprego'));
});

test('título do admin volta para o slug do Seu Justino', () => {
  assert.equal(canonicalizeAdminFaqTopic('Informações de sábado'), 'informacoes_sabado');
  assert.equal(canonicalizeAdminFaqTopic('Feriado de 15/11'), 'programacao_15_11');
});

test('textos do Seu Justino sobrevivem ao filtro do prompt', () => {
  for (const faq of SEU_JUSTINO_FAQS) {
    assert.equal(faq.topic.length <= 64, true, faq.topic);
    assert.equal(isCustomerFacingFaqEntry(faq), true, faq.topic);
    const kept = stripMetaInstructionsFromAnswer(faq.answer);
    assert.ok(kept.length > 20, faq.topic);
  }
});
