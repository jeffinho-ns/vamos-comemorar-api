const test = require('node:test');
const assert = require('node:assert/strict');
const {
  shouldUseLegacyReservationFunnelSync,
  mapAgentWorkingStateToLegacyFields,
  isLegacyReservationFunnelEnabled,
} = require('../../services/conversationEngine/reservationRouting');

test('funil legado DESABILITADO por padrão (agente novo é o caminho oficial)', () => {
  const previous = process.env.WHATSAPP_LEGACY_RESERVATION_FUNNEL;
  delete process.env.WHATSAPP_LEGACY_RESERVATION_FUNNEL;
  delete require.cache[require.resolve('../../services/conversationEngine/reservationRouting')];
  const { isLegacyReservationFunnelEnabled: fresh } = require('../../services/conversationEngine/reservationRouting');
  assert.equal(fresh(), false);
  if (previous === undefined) {
    delete process.env.WHATSAPP_LEGACY_RESERVATION_FUNNEL;
  } else {
    process.env.WHATSAPP_LEGACY_RESERVATION_FUNNEL = previous;
  }
});

test('funil legado pode ser religado via env (rollback emergencial)', () => {
  const previous = process.env.WHATSAPP_LEGACY_RESERVATION_FUNNEL;
  process.env.WHATSAPP_LEGACY_RESERVATION_FUNNEL = 'true';
  delete require.cache[require.resolve('../../services/conversationEngine/reservationRouting')];
  const { isLegacyReservationFunnelEnabled: fresh } = require('../../services/conversationEngine/reservationRouting');
  assert.equal(fresh(), true);
  if (previous === undefined) {
    delete process.env.WHATSAPP_LEGACY_RESERVATION_FUNNEL;
  } else {
    process.env.WHATSAPP_LEGACY_RESERVATION_FUNNEL = previous;
  }
});

test('com legado DESLIGADO (default), nunca roteia para legado mesmo com intenção de reserva', () => {
  const previous = process.env.WHATSAPP_LEGACY_RESERVATION_FUNNEL;
  delete process.env.WHATSAPP_LEGACY_RESERVATION_FUNNEL;
  delete require.cache[require.resolve('../../services/conversationEngine/reservationRouting')];
  const { shouldUseLegacyReservationFunnelSync: freshSync } = require('../../services/conversationEngine/reservationRouting');
  assert.equal(
    freshSync({
      messageText: 'Quero fazer uma reserva no HighLine',
      conversationState: null,
      workingState: {},
      messageHistory: [],
    }),
    false
  );
  if (previous === undefined) {
    delete process.env.WHATSAPP_LEGACY_RESERVATION_FUNNEL;
  } else {
    process.env.WHATSAPP_LEGACY_RESERVATION_FUNNEL = previous;
  }
});

test('com legado LIGADO via env, roteia reserva quando há intenção', () => {
  const previous = process.env.WHATSAPP_LEGACY_RESERVATION_FUNNEL;
  process.env.WHATSAPP_LEGACY_RESERVATION_FUNNEL = 'true';
  delete require.cache[require.resolve('../../services/conversationEngine/reservationRouting')];
  const { shouldUseLegacyReservationFunnelSync: freshSync } = require('../../services/conversationEngine/reservationRouting');
  assert.equal(
    freshSync({
      messageText: 'Quero fazer uma reserva no HighLine',
      conversationState: null,
      workingState: {},
      messageHistory: [],
    }),
    true
  );
  if (previous === undefined) {
    delete process.env.WHATSAPP_LEGACY_RESERVATION_FUNNEL;
  } else {
    process.env.WHATSAPP_LEGACY_RESERVATION_FUNNEL = previous;
  }
});

test('com legado LIGADO via env, roteia para legado com passo ativo no stateManager', () => {
  const previous = process.env.WHATSAPP_LEGACY_RESERVATION_FUNNEL;
  process.env.WHATSAPP_LEGACY_RESERVATION_FUNNEL = 'true';
  delete require.cache[require.resolve('../../services/conversationEngine/reservationRouting')];
  const { shouldUseLegacyReservationFunnelSync: freshSync } = require('../../services/conversationEngine/reservationRouting');
  assert.equal(
    freshSync({
      messageText: '18',
      conversationState: { currentStep: 'time', collectedFields: { reservation_date: '2026-05-23' } },
      workingState: {},
      messageHistory: [],
    }),
    true
  );
  if (previous === undefined) {
    delete process.env.WHATSAPP_LEGACY_RESERVATION_FUNNEL;
  } else {
    process.env.WHATSAPP_LEGACY_RESERVATION_FUNNEL = previous;
  }
});

test('com legado LIGADO via env, roteia para legado quando memória do agente indica funil', () => {
  const previous = process.env.WHATSAPP_LEGACY_RESERVATION_FUNNEL;
  process.env.WHATSAPP_LEGACY_RESERVATION_FUNNEL = 'true';
  delete require.cache[require.resolve('../../services/conversationEngine/reservationRouting')];
  const { shouldUseLegacyReservationFunnelSync: freshSync } = require('../../services/conversationEngine/reservationRouting');
  assert.equal(
    freshSync({
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
  if (previous === undefined) {
    delete process.env.WHATSAPP_LEGACY_RESERVATION_FUNNEL;
  } else {
    process.env.WHATSAPP_LEGACY_RESERVATION_FUNNEL = previous;
  }
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
