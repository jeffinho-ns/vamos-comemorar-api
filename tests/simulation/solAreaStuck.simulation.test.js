'use strict';

/**
 * Simulação: a Sol não pode travar na escolha de área em nenhuma casa.
 * Cobre o loop "Pode" do Justino, Salão do Rooftop e vazamento de labels do Highline.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  parseReservationFieldsFromUserText,
  buildNextFieldQuestion,
} = require('../../services/agent/reservationFunnel');
const { mergeWorkingState, extractWorkingStatePatchFromToolResult } = require('../../services/agent/agentMemoryService');
const {
  isCreatableAreaLabel,
  reservationFunnelIsComplete,
} = require('../../services/agent/deterministicReservationClose');
const { humanizeCreateError } = require('../../services/agent/reservationCreateError');

const IDENTITY = {
  client_name: 'Maria Teste',
  client_email: 'maria@teste.com',
  data_nascimento: '1990-01-15',
};

const SLOT = {
  reservation_date: '2026-12-09',
  reservation_time: '20:00',
  quantidade_convidados: 12,
};

function baseState(houseId, extra = {}) {
  return {
    establishment_id: houseId,
    ...SLOT,
    ...IDENTITY,
    ...extra,
  };
}

function applyUser(state, text, history = []) {
  const patch = parseReservationFieldsFromUserText(text, state, history);
  return mergeWorkingState(state, patch);
}

function areaOf(state) {
  return state.area_label || state.area_preferida || state.justino_zone || '';
}

function wouldAskAreaAgain(state) {
  const q = buildNextFieldQuestion(state) || '';
  return /coberta|descoberta|balc[aã]o|pra[cç]a|deck|bar central|interna|externa|sal[aã]o|qual [aá]rea/i.test(
    q
  );
}

function scenario(id, title, run) {
  try {
    run();
    return { id, title, ok: true, failures: [] };
  } catch (error) {
    return { id, title, ok: false, failures: [error.message] };
  }
}

function runAreaStuckScenarios() {
  return [
    scenario('justino-descoberta', 'Justino: "área descoberta" grava e não pergunta de novo', () => {
      const state = applyUser(baseState(1), 'Área descoberta por favoor');
      assert.equal(state.justino_zone, 'descoberta');
      assert.equal(state.area_id, 2);
      assert.equal(isCreatableAreaLabel(areaOf(state), 1), true);
      assert.equal(wouldAskAreaAgain(state), false);
      assert.equal(reservationFunnelIsComplete(state), true);
    }),

    scenario('justino-pode-switch', 'Justino: coberta lotada → "Pode" fecha na descoberta', () => {
      let state = baseState(1, {
        justino_zone: 'coberta',
        area_id: 1,
        area_label: 'área coberta',
        area_preferida: 'área coberta',
        quantidade_convidados: 40,
      });
      const fail = {
        ok: false,
        needs_area_switch: true,
        suggested_zone: 'descoberta',
        error:
          'A área coberta não comporta 40 pessoas nesse horário. Na área descoberta ainda tem vaga — posso colocar vocês lá?',
      };
      state = mergeWorkingState(state, extractWorkingStatePatchFromToolResult('criar_pre_reserva', fail));
      assert.equal(state.pending_justino_zone, 'descoberta');

      const history = [{ role: 'assistant', content: fail.error }];
      const human = humanizeCreateError(fail, state);
      assert.match(human.replyText, /posso colocar vocês lá/i);

      state = applyUser(state, 'Pode', history);
      assert.equal(state.justino_zone, 'descoberta');
      assert.equal(state.area_id, 2);
      assert.equal(state.pending_justino_zone, undefined);
      assert.equal(isCreatableAreaLabel(areaOf(state), 1), true);
      assert.equal(wouldAskAreaAgain(state), false);
      assert.notEqual(buildNextFieldQuestion(state), 'Você prefere a área coberta ou a área descoberta?');
    }),

    scenario('justino-descoberta-literal', 'Justino: cliente digita "Descoberta" após a oferta', () => {
      const history = [
        {
          role: 'assistant',
          content:
            'A área coberta não comporta 40 pessoas nesse horário. Na área descoberta ainda tem vaga — posso colocar vocês lá?',
        },
      ];
      const state = applyUser(
        baseState(1, {
          justino_zone: 'coberta',
          area_id: 1,
          area_label: 'área coberta',
          quantidade_convidados: 40,
        }),
        'Descoberta',
        history
      );
      assert.equal(state.justino_zone, 'descoberta');
      assert.equal(state.area_id, 2);
      assert.equal(wouldAskAreaAgain(state), false);
    }),

    scenario('justino-interna', 'Justino: "interna" vira coberta', () => {
      const state = applyUser(baseState(1), 'interna');
      assert.equal(state.justino_zone, 'coberta');
      assert.equal(state.area_id, 1);
      assert.equal(wouldAskAreaAgain(state), false);
    }),

    scenario('highline-deck', 'Highline: Deck - Mesas fecha sem travar', () => {
      const state = applyUser(baseState(7), 'Deck - Mesas');
      assert.match(String(state.area_label), /Deck - Mesas/i);
      assert.equal(isCreatableAreaLabel(areaOf(state), 7), true);
      assert.equal(wouldAskAreaAgain(state), false);
      assert.equal(reservationFunnelIsComplete(state), true);
    }),

    scenario('highline-pergunta', 'Highline sem área pergunta as opções do painel', () => {
      const state = baseState(7);
      const q = buildNextFieldQuestion(state);
      assert.match(q, /Deck - Mesas/i);
      assert.match(q, /Bar Central/i);
      assert.doesNotMatch(q, /coberta|descoberta|balc[aã]o|pra[cç]a|observa/i);
    }),

    scenario('pracinha-balcao', 'Pracinha: Balcão fecha e não vira Deck', () => {
      const state = applyUser(baseState(8), 'Balcão');
      assert.equal(state.area_label, 'Balcão');
      assert.notEqual(state.area_label, 'Deck - Mesas');
      assert.equal(isCreatableAreaLabel(areaOf(state), 8), true);
      assert.equal(wouldAskAreaAgain(state), false);
    }),

    scenario('pracinha-sem-leak', 'Pracinha: "lounge" não grava área do Highline', () => {
      const state = applyUser(baseState(8), 'lounge');
      assert.equal(state.area_label, undefined);
      assert.equal(state.area_preferida, undefined);
      assert.equal(isCreatableAreaLabel(areaOf(state), 8), false);
      const q = buildNextFieldQuestion(state);
      assert.match(q, /Balc[aã]o|Pra[cç]a/i);
      assert.doesNotMatch(q, /observa|Deck/i);
    }),

    scenario('rooftop-externa', 'Rooftop: descoberta vira Área Externa', () => {
      const state = applyUser(baseState(9), 'área descoberta');
      assert.equal(state.area_label, 'Área Externa');
      assert.equal(isCreatableAreaLabel(areaOf(state), 9), true);
      assert.equal(wouldAskAreaAgain(state), false);
    }),

    scenario('rooftop-salao', 'Rooftop: Salão não vira Área Interna', () => {
      const state = applyUser(baseState(9), 'salão');
      assert.equal(state.area_label, 'Salão');
      assert.notEqual(state.area_label, 'Área Interna');
      assert.equal(isCreatableAreaLabel(areaOf(state), 9), true);
      assert.equal(wouldAskAreaAgain(state), false);
    }),

    scenario('rooftop-pergunta', 'Rooftop sem área pergunta interna, externa e salão', () => {
      const q = buildNextFieldQuestion(baseState(9));
      assert.match(q, /interna/i);
      assert.match(q, /externa/i);
      assert.match(q, /sal[aã]o/i);
    }),

    scenario('rooftop-sem-leak', 'Rooftop: "Deck Mesas" não grava label do Highline', () => {
      const state = applyUser(baseState(9), 'Deck - Mesas');
      assert.notEqual(state.area_label, 'Deck - Mesas');
      assert.equal(isCreatableAreaLabel(areaOf(state) || 'Deck - Mesas', 9), false);
    }),
  ];
}

function formatReport(results) {
  const passed = results.filter((row) => row.ok).length;
  const lines = [`Simulação áreas Sol — ${passed}/${results.length} ok`, ''];
  for (const row of results) {
    const mark = row.ok ? 'OK' : 'FALHOU';
    const extra = row.ok ? '' : ` → ${row.failures.join('; ')}`;
    lines.push(`${mark.padEnd(6)} ${row.id.padEnd(24)} ${row.title}${extra}`);
  }
  return lines.join('\n');
}

test('simulação: Sol não trava na área em Justino, Highline, Pracinha e Rooftop', () => {
  const results = runAreaStuckScenarios();
  const failed = results.filter((row) => !row.ok);
  console.log(formatReport(results));
  assert.equal(
    failed.length,
    0,
    failed.map((row) => `${row.id}: ${row.failures.join('; ')}`).join('\n')
  );
});

module.exports = { runAreaStuckScenarios, formatReport };
