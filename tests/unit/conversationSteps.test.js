const test = require('node:test');
const assert = require('node:assert/strict');
const {
  resolveCurrentStep,
  buildCollectBundlePrompt,
  COLLECT_BUNDLE_STEP,
  OBSERVATIONS_STEP,
} = require('../../services/stateManager/conversationSteps');

test('resolveCurrentStep usa bloco único quando faltam vários campos', () => {
  const step = resolveCurrentStep(
    { establishment_id: 7, reservation_date: '2026-05-23' },
    { lockedEstablishmentId: 7 }
  );
  assert.equal(step, COLLECT_BUNDLE_STEP);
});

test('resolveCurrentStep pede observações após dados completos', () => {
  const step = resolveCurrentStep(
    {
      establishment_id: 7,
      reservation_date: '2026-05-23',
      reservation_time: '20:00',
      quantidade_convidados: 4,
      area_id: 2,
      client_name: 'Maria Silva',
      client_email: 'maria@test.com',
      data_nascimento: '1990-01-15',
    },
    { lockedEstablishmentId: 7, reservationContext: {} }
  );
  assert.equal(step, OBSERVATIONS_STEP);
});

test('buildCollectBundlePrompt lista campos faltantes em um bloco', () => {
  const prompt = buildCollectBundlePrompt(
    { establishment_id: 7 },
    { establishmentName: 'HighLine' }
  );
  assert.match(prompt, /numa única mensagem/i);
  assert.match(prompt, /Horário/i);
  assert.match(prompt, /e-mail/i);
});
