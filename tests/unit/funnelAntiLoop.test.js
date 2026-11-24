'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  sameFunnelQuestion,
  parseOrdinalAreaChoice,
  parseShortAreaAnswer,
  breakRepeatedFunnelQuestion,
} = require('../../services/agent/funnelAntiLoop');
const {
  parseCorporateEventPatch,
  parseCorporatePackageFields,
  buildCorporateEventQuestion,
} = require('../../services/agent/corporateEventFunnel');
const { parseReservationFieldsFromUserText } = require('../../services/agent/reservationFunnel');

test('detecta pergunta de área repetida com wording diferente', () => {
  const a = 'Prefere a área coberta ou descoberta?';
  const b = 'Qual área combina melhor: coberta ou descoberta?';
  assert.equal(sameFunnelQuestion(a, b), true);
});

test('aceita escolha ordinal 1/2/3 depois da pergunta de área', () => {
  const history = [
    { role: 'assistant', content: 'Prefere área interna, externa ou salão?' },
  ];
  const patch = parseOrdinalAreaChoice('2', { establishment_id: 9 }, history);
  assert.equal(patch.area_label, 'Área Externa');
});

test('recupera resposta curta de área no anti-loop', () => {
  const history = [
    { role: 'assistant', content: 'Prefere a área coberta ou descoberta?' },
    { role: 'user', content: 'coberta' },
    { role: 'assistant', content: 'Prefere a área coberta ou descoberta?' },
  ];
  const result = breakRepeatedFunnelQuestion({
    nextQuestion: 'Prefere a área coberta ou descoberta?',
    messageHistory: history,
    workingState: { establishment_id: 1, client_name: 'Ana' },
    buildNextQuestion: (state) =>
      state.justino_zone ? 'Qual o melhor horário pra você?' : 'Prefere a área coberta ou descoberta?',
  });
  assert.equal(result.brokeLoop, true);
  assert.equal(result.workingState.justino_zone, 'coberta');
  assert.match(result.replyText, /horário/i);
});

test('após 2+ repetições faz handoff humano', () => {
  const history = [
    { role: 'assistant', content: 'Prefere a área coberta ou descoberta?' },
    { role: 'user', content: '??? ' },
    { role: 'assistant', content: 'Prefere a área coberta ou descoberta?' },
    { role: 'user', content: 'nao sei' },
  ];
  const result = breakRepeatedFunnelQuestion({
    nextQuestion: 'Prefere a área coberta ou descoberta?',
    messageHistory: history,
    workingState: { establishment_id: 1 },
    buildNextQuestion: () => 'Prefere a área coberta ou descoberta?',
  });
  assert.equal(result.handoff, true);
  assert.equal(result.workingState.needs_human_handoff, true);
});

test('fechado sozinho marca pacote fechado', () => {
  const history = [
    {
      role: 'assistant',
      content:
        'Vocês preferem um pacote fechado de comidas e bebidas, ou uma reserva de mesa com comandas individuais?',
    },
  ];
  const patch = parseCorporateEventPatch('fechado', { event_type: 'corporativo' }, history);
  assert.equal(patch.event_mode, 'pacote_fechado');
});

test('nome da empresa sozinho é capturado depois da pergunta', () => {
  const history = [
    { role: 'assistant', content: 'Pra equipe montar a proposta, me manda o nome da empresa?' },
  ];
  const patch = parseCorporatePackageFields(
    'RECICLABR',
    { event_type: 'corporativo', event_mode: 'pacote_fechado' },
    history
  );
  assert.equal(patch.company_name, 'RECICLABR');
});

test('parse de reserva aplica ordinal no Rooftop', () => {
  const history = [
    { role: 'assistant', content: 'Prefere área interna, externa ou salão?' },
  ];
  const patch = parseReservationFieldsFromUserText(
    '1',
    {
      establishment_id: 9,
      client_name: 'Luciana',
      reservation_date: '2026-12-10',
      reservation_time: '20:00',
      quantidade_convidados: 6,
    },
    history
  );
  assert.equal(patch.area_label, 'Área Interna');
});

test('parseShortAreaAnswer mapeia externa no Rooftop', () => {
  assert.equal(parseShortAreaAnswer('Externa', 9)?.area_label, 'Área Externa');
  assert.equal(parseShortAreaAnswer('2', 8)?.area_label, 'Praça');
});

test('pergunta corporativa não despeja formulário', () => {
  const q = buildCorporateEventQuestion({
    event_type: 'corporativo',
    event_mode: 'pacote_fechado',
  });
  assert.match(q, /empresa/i);
  assert.doesNotMatch(q, /Nome:\nEmpresa:/);
});
