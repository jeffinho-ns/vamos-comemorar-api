const test = require('node:test');
const assert = require('node:assert/strict');
const {
  shouldSkipConversationFollowUp,
  pickCategory,
  buildFollowUpText,
} = require('../../services/agent/conversationFollowUpEngine');

test('follow-up continua em reserva pela metade', () => {
  assert.equal(
    shouldSkipConversationFollowUp({
      workingState: { establishment_id: 1, reservation_date: '2026-10-31' },
      messages: [
        { direction: 'outbound', body: 'Qual horário?', intent: 'AGENT_REPLY' },
        { direction: 'inbound', body: '19h pra 8', intent: null },
      ],
    }),
    false
  );
});

test('follow-up para quando a reserva já foi criada', () => {
  assert.equal(
    shouldSkipConversationFollowUp({
      workingState: { reservation_created: true, reservation_id: 99 },
      messages: [
        { direction: 'outbound', body: 'Fechado! Sua reserva ficou pra 31/10.', intent: 'PROCESS_RESERVATION' },
        { direction: 'inbound', body: 'Obrigado', intent: null },
      ],
    }),
    true
  );
});

test('follow-up para depois do PROCESS_RESERVATION mesmo sem working state', () => {
  assert.equal(
    shouldSkipConversationFollowUp({
      workingState: {},
      messages: [
        { direction: 'outbound', body: 'Fechado!', intent: 'PROCESS_RESERVATION' },
        { direction: 'inbound', body: 'Obrigado', intent: null },
        { direction: 'outbound', body: 'Eu que agradeço!', intent: 'AGENT_REPLY' },
      ],
    }),
    true
  );
});

test('follow-up para quando a última falha da IA já fechou a reserva', () => {
  assert.equal(
    shouldSkipConversationFollowUp({
      workingState: {},
      messages: [
        {
          direction: 'outbound',
          body: 'Fechado! Sua reserva ficou pra 31/10/2026 às 19:00 na área descoberta.',
          intent: 'AGENT_REPLY',
        },
      ],
    }),
    true
  );
});

test('instrução de reserva só vale enquanto o funil está aberto', () => {
  const category = pickCategory('quero reservar mesa', {
    reservas: { enabled: true, instruction: 'Ainda tá aí? Fecho sua mesa agora.' },
  });
  assert.match(buildFollowUpText(category), /Fecho sua mesa agora/);
  assert.equal(
    shouldSkipConversationFollowUp({
      workingState: { reservation_created: true },
      messages: [{ direction: 'inbound', body: 'quero reservar mesa' }],
    }),
    true
  );
});
