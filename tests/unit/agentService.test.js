const test = require('node:test');
const assert = require('node:assert/strict');
const {
  synthesizeReplyFromToolTrace,
  synthesizeAvailabilityFromToolResult,
  sanitizeAssistantReply,
  looksLikeFakeReservationConfirmation,
  containsForbiddenAreaName,
} = require('../../services/agent/agentService');

test('synthesizeReplyFromToolTrace usa a última FAQ válida', () => {
  const reply = synthesizeReplyFromToolTrace([
  {
      name: 'consultar_faq_estabelecimento',
      result: { ok: true, answer: 'Temos valet na porta.' },
    },
  ]);

  assert.equal(reply, 'Temos valet na porta.');
});

test('synthesizeReplyFromToolTrace monta horários disponíveis', () => {
  const reply = synthesizeReplyFromToolTrace([
    {
      name: 'verificar_disponibilidade',
      result: {
        ok: true,
        is_open: true,
        windows: [{ label: '19:00' }, { label: '20:30' }],
      },
    },
  ]);

  assert.match(reply, /19:00/);
  assert.match(reply, /20:30/);
});

test('synthesizeAvailabilityFromToolResult confirma vaga com horário consultado', () => {
  const reply = synthesizeAvailabilityFromToolResult({
    ok: true,
    reservation_date: '2026-05-23',
    is_open: true,
    horario_consultado: '20:00',
    windows: [],
    capacidade: { pode_reservar: true },
  });

  assert.match(reply, /23\/05\/2026/);
  assert.match(reply, /20:00/);
  assert.match(reply, /vaga sim/i);
});

test('synthesizeAvailabilityFromToolResult segue reserva quando aberto sem janelas rotuladas', () => {
  const reply = synthesizeAvailabilityFromToolResult({
    ok: true,
    reservation_date: '2026-05-24',
    is_open: true,
    windows: [{ foo: 'bar' }],
    quantidade_pessoas: 4,
    capacidade: { pode_reservar: true },
  });

  assert.match(reply, /24\/05\/2026/);
  assert.match(reply, /4 pessoas/);
  assert.match(reply, /horário/i);
});

test('synthesizeReplyFromToolTrace informa erro de criar_pre_reserva', () => {
  const reply = synthesizeReplyFromToolTrace([
    {
      name: 'criar_pre_reserva',
      result: { ok: false, error: 'Área inválida ou sem mesa disponível.' },
    },
  ]);

  assert.match(reply, /não consegui registrar/i);
  assert.match(reply, /Área inválida/i);
});

test('looksLikeFakeReservationConfirmation detecta variações de confirmação falsa', () => {
  const cases = [
    'Caro Jefferson, é com grande satisfação que confirmamos sua reserva no HighLine.',
    'Estaremos esperando por você no dia 22 de maio.',
    'Atenciosamente, A equipe do Vamos Comemorar.',
    'Sua reserva está confirmada.',
    'Cara Maria, sua mesa está reservada.',
  ];
  for (const text of cases) {
    assert.equal(looksLikeFakeReservationConfirmation(text), true, `deveria detectar: "${text}"`);
  }
});

test('looksLikeFakeReservationConfirmation NÃO marca falsos positivos amigáveis', () => {
  const benign = [
    'Pra eu já consultar a agenda, me passa por favor a data, o horário e quantas pessoas vão.',
    'Boa noite! Tudo bem? Pra quando seria sua reserva?',
    'Quantas pessoas vão com você?',
  ];
  for (const text of benign) {
    assert.equal(looksLikeFakeReservationConfirmation(text), false, `não devia detectar: "${text}"`);
  }
});

test('containsForbiddenAreaName bloqueia rótulos inválidos no HighLine', () => {
  assert.equal(containsForbiddenAreaName('na área do Terraço'), true);
  assert.equal(containsForbiddenAreaName('Área Coberta tem vaga'), true);
  assert.equal(containsForbiddenAreaName('confirmo no Balcão'), true);
  assert.equal(containsForbiddenAreaName('te indico o Deck Frente'), false);
  assert.equal(containsForbiddenAreaName('Rooftop Esquerdo livre'), false);
  assert.equal(containsForbiddenAreaName('Bar Central tem mesas'), false);
});

test('sanitizeAssistantReply substitui confirmação falsa por pergunta segura', () => {
  const fake =
    'Caro Jefferson, é com grande satisfação que confirmamos sua reserva no HighLine. Estaremos esperando por você no dia 22 de maio de 2027.';
  const result = sanitizeAssistantReply(fake, {
    toolTrace: [],
    workingState: {
      establishment_id: 7,
      reservation_date: '2026-05-30',
      reservation_time: '21:00',
      quantidade_convidados: 30,
    },
  });
  assert.equal(result.blocked, true);
  assert.equal(result.reason, 'fake_reservation_confirmation');
  assert.doesNotMatch(result.text, /Caro|Atenciosamente|grande satisfação/i);
});

test('sanitizeAssistantReply NÃO bloqueia quando criar_pre_reserva rodou com sucesso', () => {
  const result = sanitizeAssistantReply(
    'Sua reserva está confirmada para 30/05 às 21:00 — qualquer coisa é só chamar.',
    {
      toolTrace: [
        {
          name: 'criar_pre_reserva',
          result: {
            ok: true,
            pre_reserva: { reservation_date: '2026-05-30', reservation_time: '21:00' },
          },
        },
      ],
      workingState: {},
    }
  );
  assert.equal(result.blocked, false);
});

test('sanitizeAssistantReply bloqueia nome de área proibido', () => {
  const result = sanitizeAssistantReply(
    'Te coloquei na área do Terraço, pode ser?',
    { toolTrace: [], workingState: {} }
  );
  assert.equal(result.blocked, true);
  assert.equal(result.reason, 'forbidden_area_name');
  assert.doesNotMatch(result.text, /terraço/i);
});

test('sanitizeAssistantReply bloqueia múltiplas reservas para mesmo grupo', () => {
  const result = sanitizeAssistantReply(
    'Posso fazer três reservas na Área Rooftop - Esquerdo para acomodar seu grupo.',
    { toolTrace: [], workingState: {} }
  );
  assert.equal(result.blocked, true);
  assert.equal(result.reason, 'multi_reservation_attempt');
  assert.match(result.text, /UMA reserva/i);
});
