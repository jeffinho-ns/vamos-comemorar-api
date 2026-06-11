const test = require('node:test');
const assert = require('node:assert/strict');
const {
  synthesizeReplyFromToolTrace,
  synthesizeAvailabilityFromToolResult,
  sanitizeAssistantReply,
  looksLikeFakeReservationConfirmation,
  containsForbiddenAreaName,
  shouldPrioritizeFaqForCurrentTurn,
} = require('../../services/agent/agentService');
const { isDateTooFarInFuture } = require('../../nlp/dateResolver');

test('isDateTooFarInFuture pega 22/05/2027 quando hoje é 25/05/2026', () => {
  assert.equal(isDateTooFarInFuture('2027-05-22', '2026-05-25', 11), true);
  assert.equal(isDateTooFarInFuture('2026-05-30', '2026-05-25', 11), false);
  assert.equal(isDateTooFarInFuture('2027-01-15', '2026-05-25', 11), false);
});

test('synthesizeReplyFromToolTrace usa a última FAQ válida', () => {
  const reply = synthesizeReplyFromToolTrace([
  {
      name: 'consultar_faq_estabelecimento',
      result: { ok: true, answer: 'Temos valet na porta.' },
    },
  ]);

  assert.equal(reply, 'Temos valet na porta.');
});

test('pergunta de estacionamento tem prioridade de FAQ mesmo com contexto de reserva', () => {
  assert.equal(
    shouldPrioritizeFaqForCurrentTurn('Oi boa noite, me dê uma ajuda. No Highline tem estacionamento?'),
    true
  );
  assert.equal(
    shouldPrioritizeFaqForCurrentTurn('quero reservar e queria saber se tem valet'),
    true
  );
  assert.equal(shouldPrioritizeFaqForCurrentTurn('quero fazer uma reserva no Highline'), false);
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
  // "Bar Central" não existe no Highline — label oficial é "Área Bar".
  // Manter o nome divergente confundia cliente e equipe; agora é bloqueado.
  assert.equal(containsForbiddenAreaName('Bar Central tem mesas'), true);
  assert.equal(containsForbiddenAreaName('te indico o Deck Frente'), false);
  assert.equal(containsForbiddenAreaName('Rooftop Esquerdo livre'), false);
  assert.equal(containsForbiddenAreaName('te indico a Área Bar pra essa quantidade'), false);
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

test('sanitizeAssistantReply SEMPRE prefere texto determinístico quando há reserva criada', () => {
  // Mesmo que o LLM gere texto aparentemente "ok", descartamos pra evitar
  // alucinação de data/ano/área/quantidade. Usamos só o que a tool retornou.
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
  // O texto deve vir do template determinístico (que sempre começa com "Fechado!").
  assert.match(result.text, /^Fechado!/);
  assert.match(result.text, /2026-05-30/);
  assert.match(result.text, /21:00/);
  // reason indica que foi override determinístico (sem risco extra detectado).
  assert.equal(result.reason, 'deterministic_confirmation_override');
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

test('sanitizeAssistantReply substitui tom formal mesmo com reserva criada', () => {
  const formalReply =
    'Caro Jefferson, É com grande alegria que confirmamos sua reserva no HighLine. Você estará conosco no dia 22 de maio de 2027, às 21:00, na área do Terraço, para um grupo de 12 pessoas. Atenciosamente, Equipe Vamos Comemorar.';
  const result = sanitizeAssistantReply(formalReply, {
    toolTrace: [
      {
        name: 'criar_pre_reserva',
        result: {
          ok: true,
          pre_reserva: {
            reservation_date: '2026-05-30',
            reservation_time: '21:00',
            area_label: 'Área Deck - Frente',
          },
        },
      },
    ],
    workingState: {},
  });
  assert.equal(result.blocked, true);
  assert.equal(
    result.reason,
    'deterministic_confirmation_override_risky',
    `motivo inesperado: ${result.reason}`
  );
  assert.doesNotMatch(result.text, /Caro|Atenciosamente|grande alegria|2027|Terraço/i);
  // Texto deve usar a data REAL retornada pela tool (2026-05-30), não a alucinada (2027).
  assert.match(result.text, /2026-05-30/);
});

test('sanitizeAssistantReply bloqueia tom formal mesmo sem outros gatilhos', () => {
  const result = sanitizeAssistantReply(
    'Cordialmente, A equipe do Highline agradece sua preferência.',
    { toolTrace: [], workingState: {} }
  );
  assert.equal(result.blocked, true);
});

test('sanitizeAssistantReply PERMITE combinar múltiplas MESAS em uma reserva', () => {
  const benignTexts = [
    'Vou combinar 3 mesas próximas no Deck pra acomodar o grupo numa única reserva.',
    'A casa pode juntar duas mesas em UMA reserva só.',
    'Combinei 4 mesas pra você ficar todo mundo junto.',
    'Pra essa quantidade, junto 3 mesas na Área Bar em uma reserva.',
  ];
  for (const text of benignTexts) {
    const result = sanitizeAssistantReply(text, { toolTrace: [], workingState: {} });
    assert.equal(
      result.blocked,
      false,
      `não deveria bloquear "${text}" (resultado: ${result.reason || 'ok'})`
    );
  }
});
