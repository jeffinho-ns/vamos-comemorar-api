const test = require('node:test');
const assert = require('node:assert/strict');
const { detectFaqTopicsFromUserText } = require('../../services/agent/faqTopicCanonical');

test('19/11 da Pracinha não cai na sexta comum', () => {
  const topics = detectFaqTopicsFromUserText('como fica a entrada no dia 19/11?');
  assert.ok(topics.includes('programacao_19_11'));
});

test('Apê, rolha e story acham o tópico da Pracinha', () => {
  assert.ok(detectFaqTopicsFromUserText('quero reservar o apê').includes('reserva_ape'));
  assert.ok(detectFaqTopicsFromUserText('qual a taxa de rolha?').includes('taxa_rolha'));
  assert.ok(detectFaqTopicsFromUserText('te marquei no story').includes('mencao_story'));
});
