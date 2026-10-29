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
  prefixReplyWithContactName,
  mergeContactHintsIntoWorkingState,
  shouldAskOccasion,
  parseOccasionFromUserText,
  buildOccasionNotes,
  looksLikeClosingThanks,
  reservationAlreadyCreated,
  lastAssistantClosedReservation,
} = require('../../services/agent/reservationFunnel');
const { looksLikeEventProgramQuestion } = require('../../services/agent/faqTopicCanonical');
const { buildReservationDateHint } = require('../../services/agent/reservationDateHint');
const { mergeWorkingState } = require('../../services/agent/agentMemoryService');

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
  // Ano segue o calendário (se 19/06 já passou no ano corrente, cai no próximo).
  assert.match(patch.reservation_date, /^20\d{2}-06-19$/);
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

test('parseReservationFieldsFromUserText troca área quando cliente muda preferência', () => {
  const patch = parseReservationFieldsFromUserText(
    'Eu quero Mesas Redondas e vai ser para 5 pessoas.',
    {
      establishment_id: 7,
      area_label: 'Deck - Mesas',
      area_preferida: 'Deck - Mesas',
      quantidade_convidados: 10,
    }
  );
  assert.equal(patch.area_label, 'Deck - Mesas Redondas');
  assert.equal(patch.area_preferida, 'Deck - Mesas Redondas');
  assert.equal(patch.quantidade_convidados, 5);
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

test('nome, e-mail e nascimento 27041986 fecham a identidade', () => {
  const patch = parseReservationFieldsFromUserText(
    'Suellem Lima, nunesuellen@gmail.com, 27041986',
    { establishment_id: 1, reservation_date: '2026-10-30', reservation_time: '19:00', quantidade_convidados: 10, area_label: 'área descoberta' }
  );
  assert.equal(patch.client_name, 'Suellem Lima');
  assert.equal(patch.client_email, 'nunesuellen@gmail.com');
  assert.equal(patch.data_nascimento, '1986-04-27');
  assert.equal(patch.reservation_date, undefined);
});

test('a primeira resposta não duplica o oi', () => {
  const reply = prefixReplyWithContactName('Oi! Amanhã, sexta, a casa abre às 17h.', {
    messageHistory: [{ role: 'user', content: 'o que vai ter amanhã?' }],
    contactName: 'Jefferson Lima',
  });
  assert.equal(reply, 'Oi, Jefferson! Amanhã, sexta, a casa abre às 17h.');
});

test('balcão e praça entram na reserva do Pracinha', () => {
  const patch = parseReservationFieldsFromUserText('quero o balcão', {
    establishment_id: 8,
    reservation_date: '2026-10-30',
  });
  assert.equal(patch.area_label, 'Balcão');
  const praca = parseReservationFieldsFromUserText('na Pracinha, a praça', {
    establishment_id: 8,
  });
  assert.equal(praca.area_label, 'Praça');
});

test('a primeira resposta usa o nome do WhatsApp', () => {
  const reply = prefixReplyWithContactName('Amanhã é sexta, 30/10.', {
    messageHistory: [{ role: 'user', content: 'vai ter o que amanhã?' }],
    contactName: 'Suellem Lima',
  });
  assert.match(reply, /^Oi, Suellem!/);
  const later = prefixReplyWithContactName('Qual horário fica melhor?', {
    messageHistory: [
      { role: 'user', content: 'oi' },
      { role: 'user', content: 'amanhã' },
    ],
    contactName: 'Suellem Lima',
  });
  assert.equal(later.startsWith('Oi, Suellem'), false);
});

test('vai ter o que amanhã é pergunta de programação do dia', () => {
  assert.equal(looksLikeEventProgramQuestion('Oi, vai ter o que amanhã no Seu Justino?'), true);
});

test('nascimento não substitui a data da reserva e o nome entra no estado', () => {
  const userText = 'Suellem Lima, nunesuellen@gmail.com, 27/04/1986';
  const current = {
    establishment_id: 1,
    reservation_date: '2026-10-30',
    reservation_date_confirmed: true,
    reservation_time: '19:00',
    quantidade_convidados: 10,
    area_label: 'área descoberta',
  };
  const hint = buildReservationDateHint({
    userText,
    referenceDateIso: '2026-10-29',
    workingState: current,
  });
  const fields = parseReservationFieldsFromUserText(userText, current);
  const merged = mergeWorkingState(current, hint.patch || {}, fields);
  assert.equal(merged.reservation_date, '2026-10-30');
  assert.equal(merged.client_name, 'Suellem Lima');
  assert.equal(merged.client_email, 'nunesuellen@gmail.com');
  assert.equal(merged.data_nascimento, '1986-04-27');
  assert.equal(merged.area_label, 'área descoberta');
});

test('área descoberta fica salva junto com a data já confirmada', () => {
  const fields = parseReservationFieldsFromUserText('Área descoberta', {
    establishment_id: 1,
    reservation_date: '2026-10-30',
  });
  const merged = mergeWorkingState(
    { establishment_id: 1, reservation_date: '2026-10-30' },
    {},
    fields
  );
  assert.equal(merged.justino_zone, 'descoberta');
  assert.equal(merged.area_label, 'área descoberta');
  assert.equal(merged.area_id, 2);
  assert.equal(merged.reservation_date, '2026-10-30');
});

test('frase sobre a casa não vira nome do cliente', () => {
  const patch = parseReservationFieldsFromUserText('Eu não conheço a casa', {
    establishment_id: 1,
    reservation_date: '2026-10-30',
  });
  assert.equal(patch.client_name, undefined);
});

test('apelido do WhatsApp não entra no cumprimento nem no nome da reserva', () => {
  const reply = prefixReplyWithContactName('Amanhã é sexta.', {
    messageHistory: [{ role: 'user', content: 'oi' }],
    contactName: 'Dp-scoop',
  });
  assert.equal(reply, 'Amanhã é sexta.');
  const hinted = mergeContactHintsIntoWorkingState(
    { establishment_id: 1 },
    { contact_name: 'Dp-scoop', client_email: 'nunesuellen@gmail.com' }
  );
  assert.equal(hinted.client_name, undefined);
  assert.equal(hinted.client_email, 'nunesuellen@gmail.com');
});

test('grupo acima de 4 pessoas pede se é aniversário', () => {
  assert.equal(shouldAskOccasion({ quantidade_convidados: 4 }), false);
  assert.equal(shouldAskOccasion({ quantidade_convidados: 5 }), true);
  assert.equal(
    shouldAskOccasion({ quantidade_convidados: 13, event_type: 'aniversario' }),
    false
  );
  const birthday = parseOccasionFromUserText('é aniversário da Jefferson', {
    quantidade_convidados: 13,
  });
  assert.equal(birthday.event_type, 'aniversario');
  const confirmed = parseOccasionFromUserText(
    'Sim',
    {
      establishment_id: 1,
      reservation_date: '2026-10-30',
      reservation_time: '19:00',
      quantidade_convidados: 13,
      client_name: 'Jefferson Lima',
      client_email: 'jeffinho_ns@hotmail.com',
      data_nascimento: '1987-09-15',
    },
    [{ role: 'assistant', content: 'É alguma data especial, tipo aniversário?' }]
  );
  assert.equal(confirmed.event_type, 'aniversario');
  assert.match(buildOccasionNotes({ event_type: 'aniversario', quantidade_convidados: 13 }), /drink especial/i);
  assert.match(buildOccasionNotes({ event_type: 'aniversario', quantidade_convidados: 5 }), /mais de 5/i);
});

test('looksLikeClosingThanks reconhece agradecimento curto', () => {
  assert.equal(looksLikeClosingThanks('Entendi, obrigadaaa'), true);
  assert.equal(looksLikeClosingThanks('Obrigada!'), true);
  assert.equal(looksLikeClosingThanks('Sim, quero!'), false);
  assert.equal(looksLikeClosingThanks('Então pode ser área descoberta'), false);
});

test('reservationAlreadyCreated e lastAssistantClosedReservation', () => {
  assert.equal(reservationAlreadyCreated({ reservation_created: true }), true);
  assert.equal(reservationAlreadyCreated({ reservation_id: 88 }), true);
  assert.equal(reservationAlreadyCreated({}), false);
  assert.equal(
    lastAssistantClosedReservation([
      { role: 'assistant', content: 'Fechado! Sua reserva ficou pra 30/10/2026 às 20:00.' },
      { role: 'user', content: 'Entendi, obrigadaaa' },
    ]),
    true
  );
});

test('confirmar a sexta com 30/10/2026 não vira data de nascimento', () => {
  const patch = parseReservationFieldsFromUserText('Sim, sexta dia 30/10/2026', {
    establishment_id: 1,
    pending_reservation_date_iso: '2026-10-30',
  });
  assert.equal(patch.data_nascimento, undefined);
  assert.equal(patch.reservation_date, '2026-10-30');
});

test('nascimento inválido não conta e a data real de 15/09/1987 substitui', () => {
  const current = {
    establishment_id: 1,
    reservation_date: '2026-10-30',
    reservation_time: '21:00',
    quantidade_convidados: 6,
    client_name: 'Jefferson Lima',
    client_email: 'jeffinho.novostilo@gmail.com',
    data_nascimento: '2026-10-30',
  };
  assert.ok(getReservationMissingFields(current).includes('data_nascimento'));
  const patch = parseReservationFieldsFromUserText(
    'eu tenho 39 anos, minha data de nascimento é 15/09/1987',
    current
  );
  assert.equal(patch.data_nascimento, '1987-09-15');
  assert.equal(patch.quantidade_convidados, undefined);
});

test('reserva na sexta às 21h para 6 pessoas já confirma a data', () => {
  const hint = buildReservationDateHint({
    userText: 'Quero reservar no Seu Justino na sexta às 21h para 6 pessoas. Qual área combina melhor?',
    referenceDateIso: '2026-10-29',
    workingState: { establishment_id: 1 },
  });
  assert.equal(hint.confirmed, true);
  assert.equal(hint.patch.reservation_date, '2026-10-30');
  assert.equal(hint.patch.reservation_date_confirmed, true);
});
