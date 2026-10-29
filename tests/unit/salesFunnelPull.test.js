const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildSalesPullQuestion,
  appendSalesPull,
  shouldSkipSalesPull,
} = require('../../services/agent/salesFunnelPull');
const { tryFaqFirstReply } = require('../../services/agent/agentService');

test('a pergunta solta puxa o próximo dado da reserva', () => {
  assert.equal(
    buildSalesPullQuestion({ establishment_id: 1 }),
    'Pra quando seria a reserva?'
  );
  assert.match(
    buildSalesPullQuestion({
      establishment_id: 1,
      reservation_date: '2026-10-31',
    }),
    /horário.*pessoas.*coberta ou descoberta/i
  );
  assert.equal(
    buildSalesPullQuestion({
      establishment_id: 1,
      reservation_date: '2026-10-31',
      reservation_time: '21:00',
      quantidade_convidados: 4,
    }),
    'Você prefere área coberta ou área descoberta?'
  );
  assert.match(
    buildSalesPullQuestion({
      establishment_id: 1,
      reservation_date: '2026-10-31',
      reservation_time: '21:00',
      quantidade_convidados: 4,
      area_label: 'área coberta',
    }),
    /^Me passa seu nome completo\?$/
  );
  assert.match(
    buildSalesPullQuestion({
      establishment_id: 1,
      reservation_date: '2026-10-31',
      reservation_time: '21:00',
      quantidade_convidados: 13,
      area_label: 'área descoberta',
      client_name: 'Jefferson Lima',
      client_email: 'jeffinho_ns@hotmail.com',
      data_nascimento: '1987-09-15',
    }),
    /data especial.*anivers/i
  );
  assert.equal(shouldSkipSalesPull(['eventos_corporativos']), true);
  assert.equal(
    appendSalesPull('Pode sim, pet é bem-vindo.', { establishment_id: 1 }),
    'Pode sim, pet é bem-vindo. Pra quando seria a reserva?'
  );
});

test('pergunta aleatória no meio da reserva não apaga a data e puxa a área', async () => {
  const pool = {
    query: async (sql, params) => {
      if (String(sql).includes('establishment_faq') && params.includes('pet')) {
        return {
          rows: [
            {
              topic: 'pet',
              answer: 'Pode sim, pet é bem-vindo na área externa.',
              updated_at: new Date().toISOString(),
            },
          ],
        };
      }
      return { rows: [] };
    },
  };

  const result = await tryFaqFirstReply({
    pool,
    messageHistory: [{ role: 'user', content: 'posso levar pet?' }],
    context: { lockedEstablishmentId: 1, lockedEstablishmentName: 'Seu Justino' },
    memory: {
      workingState: {
        establishment_id: 1,
        reservation_date: '2026-10-31',
        reservation_time: '21:00',
        quantidade_convidados: 4,
      },
    },
  });

  assert.match(result.replyText, /pet é bem-vindo/);
  assert.match(result.replyText, /área coberta ou área descoberta/);
  assert.equal(result.workingState.reservation_date, '2026-10-31');
  assert.equal(result.workingState.reservation_time, '21:00');
  assert.equal(result.workingState.quantidade_convidados, 4);
});
