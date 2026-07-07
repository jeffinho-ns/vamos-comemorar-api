const test = require('node:test');
const assert = require('node:assert/strict');
const {
  isReservationFunnelInProgress,
  shouldSkipFaqFirst,
  getReservationMissingFields,
  buildNextFieldQuestion,
  parseReservationFieldsFromUserText,
  looksLikeDeferredAvailabilityCheck,
  shouldAutoRunAvailabilityCheck,
  tryAdvanceFunnelFromUserMessage,
  inferAvailabilityCheckedFromHistory,
} = require('../../services/agent/reservationFunnel');

test('isReservationFunnelInProgress quando há estabelecimento e data', () => {
  assert.equal(
    isReservationFunnelInProgress(
      { establishment_id: 7, reservation_date: '2026-05-24' },
      []
    ),
    true
  );
});

test('shouldSkipFaqFirst durante funil ativo', () => {
  assert.equal(
    shouldSkipFaqFirst(
      { establishment_id: 7, reservation_date: '2026-05-24', reservation_time: '20:00' },
      [{ role: 'user', content: 'quero reservar mesa' }]
    ),
    true
  );
});

test('shouldSkipFaqFirst não pula FAQ pura durante funil ativo', () => {
  assert.equal(
    shouldSkipFaqFirst(
      { establishment_id: 7, reservation_date: '2026-06-20', reservation_time: '22:00' },
      [{ role: 'user', content: 'quero reservar mesa' }],
      'Oi boa noite, no Highline tem estacionamento?'
    ),
    false
  );
});

test('parseReservationFieldsFromUserText extrai horário e pessoas', () => {
  const patch = parseReservationFieldsFromUserText('somos 4 pessoas às 20h', {});
  assert.equal(patch.quantidade_convidados, 4);
  assert.equal(patch.reservation_time, '20:00');
});

test('parseReservationFieldsFromUserText extrai data e 60 pessoas (caso print)', () => {
  const patch = parseReservationFieldsFromUserText('19/06 e 60 pessoas', { establishment_id: 7 });
  assert.equal(patch.quantidade_convidados, 60);
  assert.match(patch.reservation_date, /^2026-06-19$/);
});

test('parseReservationFieldsFromUserText não extrai data em pergunta sobre evento', () => {
  const patch = parseReservationFieldsFromUserText('O que vai ter no dia 08/07?', {});
  assert.equal(patch.reservation_date, undefined);
});

test('shouldAutoRunAvailabilityCheck não roda em pergunta sobre programação do dia', () => {
  assert.equal(
    shouldAutoRunAvailabilityCheck(
      { establishment_id: 7, reservation_date: '2026-07-08' },
      { lockedEstablishmentId: 7 },
      [],
      '',
      'O que vai ter no dia 08/07?',
      []
    ),
    false
  );
});

test('looksLikeDeferredAvailabilityCheck detecta promessa sem retorno', () => {
  const text =
    'Perfeito! Vou verificar a disponibilidade para o dia 19/06 para 60 pessoas no HighLine. Um momento, por favor.';
  assert.equal(looksLikeDeferredAvailabilityCheck(text), true);
});

test('shouldAutoRunAvailabilityCheck com data e pessoas no estado', () => {
  assert.equal(
    shouldAutoRunAvailabilityCheck(
      {
        establishment_id: 7,
        reservation_date: '2026-06-19',
        quantidade_convidados: 60,
      },
      { lockedEstablishmentId: 7 },
      [],
      'Vou verificar a disponibilidade. Um momento.'
    ),
    true
  );
});

test('shouldAutoRunAvailabilityCheck não roda em pergunta FAQ pura', () => {
  assert.equal(
    shouldAutoRunAvailabilityCheck(
      {
        establishment_id: 7,
        reservation_date: '2026-06-20',
        reservation_time: '22:00',
        quantidade_convidados: 20,
      },
      { lockedEstablishmentId: 7 },
      [],
      '',
      'No Highline tem estacionamento?',
      [{ role: 'user', content: 'quero reservar mesa' }]
    ),
    false
  );
});

test('parseReservationFieldsFromUserText aceita "18" após pergunta de horário', () => {
  const history = [
    {
      role: 'assistant',
      content:
        'Boa notícia — para 23/05/2026 temos horários: 14:00-23:30. Qual horário fica melhor pra você?',
    },
  ];
  const patch = parseReservationFieldsFromUserText(
    '18',
    { establishment_id: 7, reservation_date: '2026-05-23', quantidade_convidados: 4 },
    history
  );
  assert.equal(patch.reservation_time, '18:00');
});

test('shouldAutoRunAvailabilityCheck não repete após já verificado', () => {
  assert.equal(
    shouldAutoRunAvailabilityCheck(
      {
        establishment_id: 7,
        reservation_date: '2026-05-23',
        quantidade_convidados: 4,
        availability_checked_for: '7|2026-05-23|4',
      },
      { lockedEstablishmentId: 7 },
      [],
      '',
      '18',
      [{ role: 'assistant', content: 'Qual horário fica melhor pra você?' }]
    ),
    false
  );
});

test('tryAdvanceFunnelFromUserMessage avança após horário "18"', () => {
  const state = {
    establishment_id: 7,
    reservation_date: '2026-05-23',
    quantidade_convidados: 4,
    availability_checked_for: '7|2026-05-23|4',
  };
  const history = [
    {
      role: 'assistant',
      content: 'Qual horário fica melhor pra você?',
    },
  ];
  const advanced = tryAdvanceFunnelFromUserMessage(state, '18', history);
  assert.match(advanced.replyText, /18h|18:00/i);
  assert.match(advanced.replyText, /nome|e-mail|pessoas/i);
  assert.equal(advanced.workingState.reservation_time, '18:00');
});

test('inferAvailabilityCheckedFromHistory a partir da última mensagem da IA', () => {
  const next = inferAvailabilityCheckedFromHistory(
    {
      establishment_id: 7,
      reservation_date: '2026-05-23',
      quantidade_convidados: 4,
    },
    [
      {
        role: 'assistant',
        content:
          'Boa notícia — para 23/05/2026 temos horários: 14:00-23:30. Qual horário fica melhor pra você?',
      },
    ],
    { lockedEstablishmentId: 7 }
  );
  assert.equal(next.availability_checked_for, '7|2026-05-23|4');
});

test('buildNextFieldQuestion pede próximo campo faltante', () => {
  const q = buildNextFieldQuestion({
    establishment_id: 7,
    reservation_date: '2026-05-24',
    reservation_time: '20:00',
    quantidade_convidados: 2,
  });
  assert.match(q, /nome|e-mail|nascimento/i);
});

test('getReservationMissingFields lista campos obrigatórios', () => {
  const missing = getReservationMissingFields({
    establishment_id: 7,
    reservation_date: '2026-05-24',
  });
  assert.ok(missing.includes('reservation_time'));
  assert.ok(missing.includes('client_name'));
});
