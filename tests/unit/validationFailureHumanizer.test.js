const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  humanizeFailure,
  isLikelyHallucinatedField,
} = require('../../services/conversationEngine/validationFailureHumanizer');

test('humanizeFailure: NUNCA retorna mensagem técnica de validador', () => {
  const techMessages = [
    { code: 'INVALID_NUMBER', fieldName: 'área', message: 'Preciso de um valor numérico válido para área.' },
    { code: 'NAME_INCOMPLETE', fieldName: 'client_name', message: 'Preciso do nome completo do titular.' },
    { code: 'BIRTHDATE_INVALID', fieldName: 'data_nascimento', message: 'Preciso da data de nascimento no formato DD-MM-AAAA.' },
    { code: 'DATE_IN_PAST', fieldName: 'reservation_date', message: 'A data precisa ser hoje ou uma data futura.' },
    { code: 'NO_WINDOWS', fieldName: 'reservation_time', message: 'Não encontrei horários disponíveis para essa data.' },
  ];
  for (const failure of techMessages) {
    const out = humanizeFailure(failure, { userMessage: 'qualquer coisa' });
    if (!out.skip) {
      assert.notEqual(out.message, failure.message, `mensagem técnica vazou: code=${failure.code}`);
      assert.ok(!out.message.includes('valor numérico válido'), 'vazou: valor numérico');
      assert.ok(!out.message.includes('DD-MM-AAAA'), 'vazou: formato técnico');
    }
  }
});

test('humanizeFailure: UNDERAGE de mensagem curta é IGNORADO (provável alucinação)', () => {
  const failure = { code: 'UNDERAGE', fieldName: 'data_nascimento', message: '...' };
  const out = humanizeFailure(failure, { userMessage: '30/05\n20h' });
  assert.equal(out.skip, true);
});

test('humanizeFailure: UNDERAGE em mensagem longa NÃO é ignorado (legítimo)', () => {
  const failure = { code: 'UNDERAGE', fieldName: 'data_nascimento', message: '...' };
  const out = humanizeFailure(failure, {
    userMessage: 'minha data de nascimento é 15/03/2012 e eu vou com meus amigos',
  });
  assert.equal(out.skip, false);
  assert.ok(out.message.toLowerCase().includes('maiores de 18'));
});

test('humanizeFailure: INVALID_NUMBER em área quando cliente digitou palavra → ignora', () => {
  const failure = { code: 'INVALID_NUMBER', fieldName: 'área', message: 'Preciso de um valor numérico válido para área.' };
  const out = humanizeFailure(failure, { userMessage: 'Rooftop' });
  assert.equal(out.skip, true);
});

test('humanizeFailure: NAME_INCOMPLETE retorna pergunta natural', () => {
  const out = humanizeFailure({ code: 'NAME_INCOMPLETE', fieldName: 'client_name' }, { userMessage: 'Maria' });
  assert.equal(out.skip, false);
  assert.ok(out.message.toLowerCase().includes('nome completo'));
});

test('humanizeFailure: failure desconhecida usa fallback sem termos técnicos', () => {
  const out = humanizeFailure({ code: 'SOME_NEW_CODE_2099', fieldName: 'foo' }, { userMessage: 'oi' });
  assert.equal(out.skip, false);
  assert.ok(!out.message.includes('SOME_NEW_CODE_2099'));
  assert.ok(!out.message.toLowerCase().includes('código'));
});

test('isLikelyHallucinatedField: detecta padrões comuns de alucinação', () => {
  assert.equal(
    isLikelyHallucinatedField({ code: 'UNDERAGE' }, { userMessage: '30/05 20h' }),
    true
  );
  assert.equal(
    isLikelyHallucinatedField(
      { code: 'INVALID_NUMBER', fieldName: 'área' },
      { userMessage: 'Rooftop' }
    ),
    true
  );
  assert.equal(
    isLikelyHallucinatedField({ code: 'NAME_INCOMPLETE' }, { userMessage: 'apenas João' }),
    false
  );
});
