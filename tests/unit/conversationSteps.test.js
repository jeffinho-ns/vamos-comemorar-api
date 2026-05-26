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

test('buildCollectBundlePrompt pede primeiro o bloco operacional (data/horário/pessoas) de forma conversada', () => {
  const prompt = buildCollectBundlePrompt(
    { establishment_id: 7 },
    { establishmentName: 'HighLine' }
  );
  assert.match(prompt, /data/i);
  assert.match(prompt, /horário/i);
  assert.match(prompt, /pessoas/i);
  // Não deve perguntar identidade enquanto não tiver o operacional
  assert.doesNotMatch(prompt, /e-mail/i);
  assert.doesNotMatch(prompt, /nascimento/i);
  // Não deve usar bullets nem formato de lista
  assert.doesNotMatch(prompt, /•/);
  assert.doesNotMatch(prompt, /numa única mensagem/i);
});

test('buildCollectBundlePrompt avança para identidade quando operacional já está preenchido', () => {
  const prompt = buildCollectBundlePrompt(
    {
      establishment_id: 7,
      reservation_date: '2026-05-23',
      reservation_time: '20:00',
      quantidade_convidados: 4,
      area_id: 2,
    },
    { lockedEstablishmentId: 7, establishmentName: 'HighLine' }
  );
  assert.match(prompt, /nome completo/i);
  assert.match(prompt, /e-mail/i);
  assert.match(prompt, /nascimento/i);
  assert.doesNotMatch(prompt, /•/);
});

test('buildCollectBundlePrompt pergunta de forma curta quando falta apenas 1 campo', () => {
  const prompt = buildCollectBundlePrompt(
    {
      establishment_id: 7,
      reservation_date: '2026-05-23',
      reservation_time: '20:00',
      area_id: 2,
      client_name: 'Maria',
      client_email: 'maria@test.com',
      data_nascimento: '1990-01-15',
    },
    { lockedEstablishmentId: 7 }
  );
  assert.match(prompt, /quantas pessoas/i);
});
