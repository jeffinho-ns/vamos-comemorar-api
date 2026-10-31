const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildTimeoutFallbackReply,
  shouldUseTimeoutFallback,
} = require('../../services/agent/solTimeoutFallback');

const WINDOW_RANGE = /\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2}/;
const BULLET_LINE = /^\s*[-*]\s/m;
const TIME_ONLY_REPLY = 'Sigo com a sua reserva — qual horário fica melhor pra você?';

function assertSolTimeoutShape(reply) {
  assert.equal(typeof reply, 'string');
  assert.ok(reply.trim().length > 0);
  assert.equal(reply.includes('\n'), false);
  assert.equal((reply.match(/\?/g) || []).length, 1);
  assert.doesNotMatch(reply, BULLET_LINE);
  assert.doesNotMatch(reply, WINDOW_RANGE);
  assert.doesNotMatch(reply, /horários disponíveis/i);
  assert.doesNotMatch(reply, /\batendente\b/i);
  assert.doesNotMatch(reply, /\bterra\b/i);
  assert.doesNotMatch(reply, /recebi sua mensagem/i);
  assert.doesNotMatch(reply, /[*_`#]/);
  assert.match(reply, /você/i);
}

test('timeout com reservation_time 21:00 cita 21 e pede pessoas sem listar janelas', () => {
  const reply = buildTimeoutFallbackReply(
    { reservation_time: '21:00' },
    {
      toolTrace: [
        {
          name: 'verificar_disponibilidade',
          result: {
            horario_consultado: '21:00',
            janelas: ['14:00-23:30', '18:00-20:00'],
            note: 'horários disponíveis: 14:00-23:30',
          },
        },
      ],
    }
  );

  assert.match(reply, /21h|21:00/);
  assert.match(reply, /pessoa/i);
  assert.doesNotMatch(reply, /14:00|18:00|23:30/);
  assertSolTimeoutShape(reply);
});

test('timeout sem horário pergunta só o horário', () => {
  assert.equal(buildTimeoutFallbackReply({}), TIME_ONLY_REPLY);
  assert.equal(buildTimeoutFallbackReply(null), TIME_ONLY_REPLY);
  assert.equal(buildTimeoutFallbackReply(undefined, null), TIME_ONLY_REPLY);
  assert.equal(buildTimeoutFallbackReply({ reservation_time: '   ' }), TIME_ONLY_REPLY);
  assertSolTimeoutShape(TIME_ONLY_REPLY);
});

test('timeout usa o horário do último verificar_disponibilidade quando o estado não tem hora', () => {
  const reply = buildTimeoutFallbackReply(
    { quantidade_convidados: 4 },
    {
      toolTrace: [
        { name: 'verificar_disponibilidade', result: { horario_consultado: '20:00' } },
        { name: 'criar_pre_reserva', result: { horario_consultado: '22:00' } },
        { name: 'verificar_disponibilidade', result: { horario_consultado: '21:00' } },
      ],
    }
  );

  assert.match(reply, /21h|21:00/);
  assert.doesNotMatch(reply, /20h|20:00|22/);
  assert.match(reply, /área|area/i);
  assert.doesNotMatch(reply, /quantas pessoas|qual horário fica melhor/i);
  assertSolTimeoutShape(reply);
});

test('reservation_time do estado prevalece sobre o toolTrace', () => {
  const reply = buildTimeoutFallbackReply(
    { reservation_time: '21:00', quantidade_convidados: 0 },
    {
      toolTrace: [
        { name: 'verificar_disponibilidade', result: { horario_consultado: '18:00' } },
      ],
    }
  );

  assert.match(reply, /21h|21:00/);
  assert.match(reply, /pessoa/i);
  assert.doesNotMatch(reply, /18h|18:00/);
  assertSolTimeoutShape(reply);
});

test('timeout com horário, pessoas e área pede só o nome', () => {
  const reply = buildTimeoutFallbackReply({
    reservation_time: '21:30',
    quantidade_convidados: 6,
    area_id: 3,
  });

  assert.match(reply, /21:30/);
  assert.match(reply, /nome/i);
  assert.doesNotMatch(reply, /pessoa|área|area|qual horário fica melhor/i);
  assert.doesNotMatch(reply, WINDOW_RANGE);
  assertSolTimeoutShape(reply);
});

test('timeout com horário e dados principais não pede horário de novo nem lista janelas', () => {
  const reply = buildTimeoutFallbackReply({
    reservation_time: '21:00',
    quantidade_convidados: '4',
    area_name: 'Deck',
    client_name: 'Ana',
  });

  assert.match(reply, /21h|21:00/);
  assert.doesNotMatch(reply, /qual horário fica melhor|quantas pessoas|área você prefere|como você se chama/i);
  assertSolTimeoutShape(reply);
});

test('shouldUseTimeoutFallback reconhece timeout e ignora quota, auth e 400', () => {
  const timeout = new Error('OpenAI timeout após 25000ms');
  timeout.code = 'OPENAI_TIMEOUT';
  assert.equal(shouldUseTimeoutFallback(timeout), true);
  assert.equal(shouldUseTimeoutFallback({ code: 'OPENAI_TIMEOUT' }), true);
  assert.equal(
    shouldUseTimeoutFallback(
      new Error(
        'Falha na OpenAI: OpenAI timeout após 25000ms (status=n/a code=OPENAI_TIMEOUT attempt=3/3 model=gpt-6.1-sol)'
      )
    ),
    true
  );
  assert.equal(shouldUseTimeoutFallback(new Error('Request timed out')), true);

  const quota = new Error('You exceeded your current quota');
  quota.code = 'INSUFFICIENT_QUOTA';
  quota.status = 429;
  assert.equal(shouldUseTimeoutFallback(quota), false);

  const auth = new Error('Incorrect API key provided');
  auth.status = 401;
  assert.equal(shouldUseTimeoutFallback(auth), false);

  const structural = new Error('Invalid schema for function arguments');
  structural.status = 400;
  structural.code = 'invalid_request_error';
  assert.equal(shouldUseTimeoutFallback(structural), false);

  assert.equal(shouldUseTimeoutFallback(null), false);
  assert.equal(shouldUseTimeoutFallback(undefined), false);
  assert.equal(shouldUseTimeoutFallback(''), false);
});
