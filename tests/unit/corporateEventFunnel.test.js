const test = require('node:test');
const assert = require('node:assert/strict');
const {
  looksLikeCorporateEvent,
  parseCorporateEventPatch,
  shouldAskCorporateMode,
  shouldCreateNormalReservationForEvent,
  buildCorporateEventQuestion,
} = require('../../services/agent/corporateEventFunnel');

test('reconhece evento da empresa e pacote fechado', () => {
  assert.equal(looksLikeCorporateEvent('Evento empresa. Você tem pacotes fechados?'), true);
  assert.equal(looksLikeCorporateEvent('Happy hour empresa'), true);
  assert.equal(looksLikeCorporateEvent('Evento'), true);
  assert.equal(looksLikeCorporateEvent('quero mesa para aniversário'), false);
});

test('pacote fechado não cria reserva comum', () => {
  const patch = parseCorporateEventPatch('Você tem pacotes fechados?', {}, []);
  assert.equal(patch.event_mode, 'pacote_fechado');
  assert.equal(shouldCreateNormalReservationForEvent(patch), false);
  assert.equal(shouldAskCorporateMode({ event_type: 'corporativo' }), true);
  assert.equal(
    shouldAskCorporateMode({ event_type: 'corporativo', event_mode: 'pacote_fechado' }),
    false
  );
});

test('reserva simples de mesa segue o funil normal', () => {
  const patch = parseCorporateEventPatch('comandas individuais', { event_type: 'corporativo' }, []);
  assert.equal(patch.event_mode, 'mesa');
  assert.equal(shouldCreateNormalReservationForEvent({ ...patch, event_type: 'corporativo' }), true);
});

test('pergunta de modo não usa formulário', () => {
  const question = buildCorporateEventQuestion({ event_type: 'corporativo' });
  assert.match(question, /pacote fechado/i);
  assert.doesNotMatch(question, /^\s*[-*]/m);
  assert.doesNotMatch(question, /Nome:\nEmpresa:/);
});
