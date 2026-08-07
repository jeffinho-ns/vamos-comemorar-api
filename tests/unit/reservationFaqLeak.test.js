const test = require('node:test');
const assert = require('node:assert/strict');
const {
  shouldSkipFaqFirst,
} = require('../../services/agent/reservationFunnel');
const {
  shouldPreferDirectFaqReply,
} = require('../../services/agent/trainingReplyFormatter');
const {
  sanitizeAssistantReply,
} = require('../../services/agent/agentService');

test('shouldSkipFaqFirst pula FAQ quando mensagem traz data+hora+pessoas', () => {
  assert.equal(
    shouldSkipFaqFirst({}, [{ role: 'user', content: 'Quero reservar' }], 'seria dia 14, 19hrs, 30 pessoas'),
    true
  );
});

test('shouldPreferDirectFaqReply recusa turno de dados de reserva', () => {
  assert.equal(
    shouldPreferDirectFaqReply({
      userText: 'seria dia 14, 19hrs, 30 pessoas',
      faqEntries: [
        {
          topic: 'agenda_oficial_data_foco',
          answer:
            'Estabelecimento: HighLine (id 7).\nPolítica: override_capacidade=sim; override_horario=sim.\nHorário semanal cadastrado:',
        },
      ],
      topicHints: ['agenda_oficial_data_foco'],
    }),
    false
  );
});

test('sanitizeAssistantReply bloqueia vazamento do bloco operacional', () => {
  const leaked = `Estabelecimento: HighLine (id 7).
Política: override_capacidade=sim; override_horario=sim.
Horário semanal cadastrado:
Fechado: fechado
Janelas liberadas: 18:00-21:00.
Antes de prometer horário ou criar pré-reserva, chame verificar_disponibilidade.`;

  const result = sanitizeAssistantReply(leaked, {
    toolTrace: [],
    workingState: { establishment_id: 7, reservation_date: '2026-08-14' },
  });
  assert.equal(result.blocked, true);
  assert.equal(result.reason, 'operating_block_leak');
  assert.doesNotMatch(result.text, /override_capacidade/i);
});
