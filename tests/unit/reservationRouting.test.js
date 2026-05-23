const test = require('node:test');
const assert = require('node:assert/strict');
const {
  shouldUseLegacyReservationFunnelSync,
  mapAgentWorkingStateToLegacyFields,
  isLegacyReservationFunnelEnabled,
} = require('../../services/conversationEngine/reservationRouting');

test('funil legado habilitado por padrão', () => {
  const previous = process.env.WHATSAPP_LEGACY_RESERVATION_FUNNEL;
  delete process.env.WHATSAPP_LEGACY_RESERVATION_FUNNEL;
  delete require.cache[require.resolve('../../services/conversationEngine/reservationRouting')];
  const { isLegacyReservationFunnelEnabled: fresh } = require('../../services/conversationEngine/reservationRouting');
  assert.equal(fresh(), true);
  process.env.WHATSAPP_LEGACY_RESERVATION_FUNNEL = previous;
});

test('roteia reserva para legado quando há intenção', () => {
  assert.equal(
    shouldUseLegacyReservationFunnelSync({
      messageText: 'Quero fazer uma reserva no HighLine',
      conversationState: null,
      workingState: {},
      messageHistory: [],
    }),
    true
  );
});

test('roteia para legado com passo ativo no stateManager', () => {
  assert.equal(
    shouldUseLegacyReservationFunnelSync({
      messageText: '18',
      conversationState: { currentStep: 'time', collectedFields: { reservation_date: '2026-05-23' } },
      workingState: {},
      messageHistory: [],
    }),
    true
  );
});

test('roteia para legado quando memória do agente indica funil', () => {
  assert.equal(
    shouldUseLegacyReservationFunnelSync({
      messageText: '18',
      conversationState: null,
      workingState: {
        establishment_id: 7,
        reservation_date: '2026-05-23',
        quantidade_convidados: 4,
      },
      messageHistory: [{ role: 'user', content: 'quero reservar' }],
    }),
    true
  );
});

test('mapAgentWorkingStateToLegacyFields copia campos da reserva', () => {
  const patch = mapAgentWorkingStateToLegacyFields({
    establishment_id: 7,
    reservation_date: '2026-05-23',
    reservation_time: '18:00',
    quantidade_convidados: 4,
    availability_checked_for: 'ignored',
  });
  assert.equal(patch.establishment_id, 7);
  assert.equal(patch.reservation_time, '18:00');
  assert.equal(patch.availability_checked_for, undefined);
});
