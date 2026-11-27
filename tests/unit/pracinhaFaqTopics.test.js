const test = require('node:test');
const assert = require('node:assert/strict');
const { detectFaqTopicsFromUserText } = require('../../services/agent/faqTopicCanonical');

test('27/11 da Pracinha acha o tópico do dia e datas vencidas saíram', () => {
  const topics = detectFaqTopicsFromUserText('como fica a entrada no dia 27/11?', { establishmentId: 8 });
  assert.ok(topics.includes('programacao_27_11'));
  const old = detectFaqTopicsFromUserText('como fica no dia 19/11?', { establishmentId: 8 });
  assert.equal(old.includes('programacao_19_11'), false);
});

test('Apê, rolha, parceria e reserva de mesa acham o tópico da Pracinha', () => {
  assert.ok(detectFaqTopicsFromUserText('quero reservar o apê', { establishmentId: 8 }).includes('reserva_ape'));
  assert.ok(detectFaqTopicsFromUserText('qual a taxa de rolha?', { establishmentId: 8 }).includes('taxa_rolha'));
  assert.ok(detectFaqTopicsFromUserText('quero propor parceria', { establishmentId: 8 }).includes('parcerias'));
  assert.ok(
    detectFaqTopicsFromUserText('como funciona a reserva?', { establishmentId: 8 }).includes('como_funciona_reserva')
  );
});
