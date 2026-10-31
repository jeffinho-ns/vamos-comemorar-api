const test = require('node:test');
const assert = require('node:assert/strict');
const {
  sanitizeAssistantReply,
  looksLikeFakeReservationConfirmation,
} = require('../../services/agent/agentService');
const {
  buildNextFieldQuestion,
  parseReservationFieldsFromUserText,
  mergeContactHintsIntoWorkingState,
  getReservationMissingFields,
  buildContactBirthConfirmQuestion,
} = require('../../services/agent/reservationFunnel');

const readyOps = {
  establishment_id: 7,
  reservation_date: '2026-10-30',
  reservation_time: '21:00',
  quantidade_convidados: 6,
};

test('looksLikeFakeReservationConfirmation detecta reserva confirmada sem ferramenta', () => {
  assert.equal(looksLikeFakeReservationConfirmation('Sua reserva está confirmada.'), true);
  assert.equal(looksLikeFakeReservationConfirmation('Qual horário fica melhor pra você?'), false);
});

test('confirmação falsa sem tool vira a próxima pergunta real de nome', () => {
  const workingState = { ...readyOps };
  const result = sanitizeAssistantReply('Reserva confirmada para sexta às 21h.', {
    toolTrace: [],
    workingState,
  });
  assert.equal(result.blocked, true);
  assert.equal(result.reason, 'fake_reservation_confirmation');
  assert.equal(result.text, buildNextFieldQuestion(workingState));
  assert.match(result.text, /nome/i);
  assert.doesNotMatch(result.text, /me diz o que falta/i);
  assert.doesNotMatch(result.text, /reserva confirmada/i);
});

test('confirmação falsa sem tool vira a pergunta de e-mail quando o nome já está', () => {
  const workingState = { ...readyOps, client_name: 'Ana Silva' };
  const result = sanitizeAssistantReply('Sua reserva está confirmada.', {
    toolTrace: [],
    workingState,
  });
  assert.equal(result.text, buildNextFieldQuestion(workingState));
  assert.match(result.text, /e-mail/i);
});

test('confirmação falsa sem tool vira a pergunta de nascimento quando nome e e-mail já estão', () => {
  const workingState = {
    ...readyOps,
    client_name: 'Ana Silva',
    client_email: 'ana@example.com',
  };
  const result = sanitizeAssistantReply('Sua reserva está confirmada.', {
    toolTrace: [],
    workingState,
  });
  assert.equal(result.text, buildNextFieldQuestion(workingState));
  assert.match(result.text, /nascimento/i);
});

test('contato com nascimento adulto fica pendente até o sim', () => {
  const hinted = mergeContactHintsIntoWorkingState(readyOps, { birth_date: '1987-09-15' });
  assert.equal(hinted.data_nascimento, undefined);
  assert.equal(hinted.pending_contact_birth_iso, '1987-09-15');
  assert.ok(getReservationMissingFields(hinted).includes('data_nascimento'));

  const confirmed = parseReservationFieldsFromUserText(
    'Sim',
    {
      ...hinted,
      client_name: 'Ana Silva',
      client_email: 'ana@example.com',
    },
    [{ role: 'assistant', content: buildContactBirthConfirmQuestion('1987-09-15') }]
  );
  assert.equal(confirmed.data_nascimento, '1987-09-15');
});
