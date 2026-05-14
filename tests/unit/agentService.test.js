const test = require('node:test');
const assert = require('node:assert/strict');
const { synthesizeReplyFromToolTrace } = require('../../services/agent/agentService');

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
