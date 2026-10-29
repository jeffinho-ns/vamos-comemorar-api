const test = require('node:test');
const assert = require('node:assert/strict');
const {
  looksLikeDayProgramQuestion,
  weekdayIndexFromIso,
  weekdayFaqTopicForIso,
  formatEventProgramReply,
  formatEventProgramPromptBlock,
  loadPublicEventsForDate,
} = require('../../services/agent/establishmentEventProgram');
const { resolveDateFromText } = require('../../nlp/dateResolver');
const { tryFaqFirstReply } = require('../../services/agent/agentService');

const SAMPLE_ROW = {
  id: 90,
  nome_do_evento: 'Open de Petiscos',
  hora_do_evento: '21:00:00',
  descricao: '',
  observacao: 'Open de Petiscos com preço a partir de R$ 89,90 e entrada VIP',
  valor_da_entrada: 89.9,
  brinde: '',
  nome_atracao: 'Marina Sena',
  horario_inicio: '22:00:00',
  horario_termino: '23:30:00',
  artistic_attraction: '',
  show_schedule: '',
  ticket_prices: '',
  promotions: '',
  financial_total_value: '15000',
  artist_cpf_cnpj: '000.000.000-00',
};

test('amanhã e próximo sábado são pergunta de programação', () => {
  assert.equal(looksLikeDayProgramQuestion('quero saber o que vai ter amanhã'), true);
  assert.equal(looksLikeDayProgramQuestion('o que vai ter no próximo sábado?'), true);
  assert.equal(looksLikeDayProgramQuestion('quero saber sobre amanhã'), true);
  assert.equal(
    looksLikeDayProgramQuestion('quero reservar no próximo sábado para 4 pessoas'),
    false
  );
});

test('29/10/2026 cai na quinta do cadastro de eventos', () => {
  assert.equal(weekdayIndexFromIso('2026-10-29'), 4);
  assert.equal(weekdayFaqTopicForIso('2026-10-29'), 'informacoes_quinta');
  assert.equal(weekdayFaqTopicForIso('2026-10-31'), 'informacoes_sabado');
});

test('a resposta cita o evento, a atração e a observação, sem dados de contrato', () => {
  const tomorrow = resolveDateFromText('amanhã');
  const reply = formatEventProgramReply({
    iso: tomorrow.iso,
    source: 'amanha',
    label: 'quinta-feira, dia 29/10/2026',
    events: [
      {
        id: 90,
        name: 'Open de Petiscos',
        timeLabel: '21h',
        description: '',
        observation: SAMPLE_ROW.observacao,
        entryPrice: 'R$ 89,90',
        gift: '',
        attractions: [{ name: 'Marina Sena', start: '22h', end: '23h30' }],
        artisticAttraction: '',
        ticketPrices: '',
        promotions: '',
        showSchedule: '',
      },
    ],
  });

  assert.match(reply, /Amanhã é quinta-feira/);
  assert.match(reply, /Open de Petiscos/);
  assert.match(reply, /Marina Sena/);
  assert.match(reply, /entrada VIP/);
  assert.match(reply, /89,90/);
  assert.equal(reply.includes('15000'), false);
  assert.equal(reply.includes('000.000.000-00'), false);
  assert.equal(reply.includes('\n-'), false);
});

test('observação com CPF não vai para o cliente', () => {
  const reply = formatEventProgramReply({
    source: 'hoje',
    label: 'quarta-feira, dia 28/10/2026',
    events: [
      {
        id: 1,
        name: 'Noite qualquer',
        timeLabel: '',
        observation: 'Contrato do artista, CPF 123.456.789-00',
        entryPrice: '',
        attractions: [],
      },
    ],
  });
  assert.match(reply, /Noite qualquer/);
  assert.equal(reply.includes('CPF'), false);
  assert.equal(reply.includes('123.456.789-00'), false);
});

test('a consulta filtra a casa e a data e ignora campos internos', async () => {
  const calls = [];
  const pool = {
    query: async (sql, params) => {
      calls.push({ sql, params });
      assert.equal(sql.includes('financial_total'), false);
      assert.equal(sql.includes('admin_notes'), false);
      assert.equal(sql.includes('contractor_'), false);
      assert.match(sql, /e\.id_place = \$1/);
      return { rows: [SAMPLE_ROW] };
    },
  };

  const events = await loadPublicEventsForDate(pool, {
    establishmentId: 1,
    establishmentName: 'Seu Justino',
    isoDate: '2026-10-29',
  });

  assert.equal(calls[0].params[0], 1);
  assert.equal(calls[0].params[1], '2026-10-29');
  assert.equal(calls[0].params[2], 4);
  assert.equal(events.length, 1);
  assert.equal(events[0].name, 'Open de Petiscos');
  assert.equal(events[0].attractions[0].name, 'Marina Sena');
  assert.equal(events[0].financial_total_value, undefined);
});

function poolForProgram(rowsForHouse) {
  const calls = [];
  return {
    calls,
    query: async (sql, params) => {
      calls.push({ sql, params });
      if (!/FROM eventos/i.test(sql)) return { rows: [] };
      const houseId = Number(params[0]);
      return { rows: rowsForHouse[houseId] || [] };
    },
  };
}

test('a conversa de amanhã responde com o evento da casa e não com o de outra', async () => {
  const pool = poolForProgram({ 1: [SAMPLE_ROW] });
  const result = await tryFaqFirstReply({
    pool,
    messageHistory: [{ role: 'user', content: 'quero saber o que vai ter amanhã' }],
    context: { lockedEstablishmentId: 1, lockedEstablishmentName: 'Seu Justino' },
    memory: { workingState: {} },
  });

  assert.match(result.replyText, /Open de Petiscos/);
  assert.match(result.replyText, /Marina Sena/);
  assert.match(result.replyText, /entrada VIP/);
  assert.match(result.replyText, /Quer que eu reserve para/);
  assert.equal(result.replyText.includes('15000'), false);
  assert.equal(pool.calls.some((call) => /FROM eventos/i.test(call.sql) && call.params[0] === 1), true);

  const otherHouse = poolForProgram({ 1: [SAMPLE_ROW] });
  const missed = await tryFaqFirstReply({
    pool: otherHouse,
    messageHistory: [{ role: 'user', content: 'o que vai ter no próximo sábado?' }],
    context: { lockedEstablishmentId: 7, lockedEstablishmentName: 'Highline' },
    memory: { workingState: {} },
  });
  assert.equal(String(missed?.replyText || '').includes('Open de Petiscos'), false);
});

test('reserva de sábado não consulta o evento do dia', async () => {
  const pool = poolForProgram({ 1: [SAMPLE_ROW] });
  const result = await tryFaqFirstReply({
    pool,
    messageHistory: [{ role: 'user', content: 'quero reservar no próximo sábado para 4 pessoas' }],
    context: { lockedEstablishmentId: 1, lockedEstablishmentName: 'Seu Justino' },
    memory: { workingState: {} },
  });
  assert.equal(result, null);
  assert.equal(pool.calls.some((call) => /FROM eventos/i.test(call.sql)), false);
});

test('sem evento o bloco manda confirmar com a equipe', () => {
  const block = formatEventProgramPromptBlock({
    iso: '2026-10-29',
    label: 'quinta-feira, dia 29/10/2026',
    events: [],
  });
  assert.match(block, /PROGRAMAÇÃO REAL DO DIA/);
  assert.match(block, /Não há evento cadastrado/);
  assert.match(block, /Não invente/);
});
