const test = require('node:test');
const assert = require('node:assert/strict');
const {
  synthesizeReplyFromToolTrace,
  synthesizeAvailabilityFromToolResult,
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
  assert.match(reply, /reservar/i);
});
