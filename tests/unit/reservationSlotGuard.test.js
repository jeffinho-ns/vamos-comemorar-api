const test = require('node:test');
const assert = require('node:assert/strict');
const {
  isTimeInsideWindows,
  weekdayFromIso,
  evaluateWorkingStateSlot,
  evaluateReservationSlot,
  buildSlotGuardReply,
} = require('../../services/agent/reservationSlotGuard');
const { buildDefaultWeekly, formatDayWindows } = require('../../services/operationalHours/defaultWeeklySchedule');

const PRACINHA_ID = 8;
const HIGHLINE_ID = 7;
const TUESDAY = 2;
const FRIDAY = 5;
const SATURDAY = 6;

function assertHumanReply(text) {
  assert.equal(typeof text, 'string');
  assert.ok(text.trim().length > 0);
  assert.doesNotMatch(text, /^\s*[-*]\s/m, 'sem lista com marcadores');
  assert.doesNotMatch(text, /^\s*\d+[.)]\s/m, 'sem lista numerada');
  assert.doesNotMatch(text, /[*_#`]/, 'sem markdown');
  const questions = (text.match(/\?/g) || []).length;
  assert.equal(questions, 1, 'uma pergunta só');
}

test('isTimeInsideWindows aceita horário dentro da janela e vira o dia', () => {
  assert.equal(isTimeInsideWindows('19:00', ['17:00-03:30']), true);
  assert.equal(isTimeInsideWindows('02:00', ['17:00-03:30']), true);
  assert.equal(isTimeInsideWindows('17:00', ['17:00-03:30']), true);
  assert.equal(isTimeInsideWindows('03:30', ['17:00-03:30']), true);
  assert.equal(isTimeInsideWindows('14:00', ['17:00-03:30']), false);
  assert.equal(isTimeInsideWindows('16:59', ['17:00-01:00']), false);
  assert.equal(isTimeInsideWindows('00:30', ['17:00-01:00']), true);
  assert.equal(isTimeInsideWindows('14:00', ['14:00-03:30']), true);
});

test('terça no Pracinha é dia fechado e oferece quarta ou sexta', () => {
  const evaluation = evaluateReservationSlot({
    establishmentId: PRACINHA_ID,
    weekday: TUESDAY,
    timeHHmm: '19:00',
  });

  assert.equal(evaluation.ok, false);
  assert.equal(evaluation.reason, 'closed_day');
  assertHumanReply(evaluation.replyText);
  assert.match(evaluation.replyText, /ter[cç]a/i);
  assert.match(evaluation.replyText, /pracinha/i);
  assert.match(evaluation.replyText, /fechad/i);
  assert.match(evaluation.replyText, /quarta/i);
  assert.match(evaluation.replyText, /sexta/i);
  assert.deepEqual(evaluation.suggestedDays, ['quarta', 'sexta']);
});

test('sexta no Pracinha às 14:00 fica fora da janela e cita as 17h', () => {
  const evaluation = evaluateReservationSlot({
    establishmentId: PRACINHA_ID,
    weekday: FRIDAY,
    timeHHmm: '14:00',
  });

  assert.equal(evaluation.ok, false);
  assert.equal(evaluation.reason, 'outside_hours');
  assertHumanReply(evaluation.replyText);
  assert.match(evaluation.replyText, /sexta/i);
  assert.match(evaluation.replyText, /pracinha/i);
  assert.match(evaluation.replyText, /17h/);
});

test('sexta no Pracinha às 19:00 está dentro da janela', () => {
  const evaluation = evaluateReservationSlot({
    establishmentId: PRACINHA_ID,
    weekday: FRIDAY,
    timeHHmm: '19:00',
  });

  assert.equal(evaluation.ok, true);
  assert.equal(evaluation.replyText, undefined);
});

test('sábado no Pracinha às 14:00 está dentro da janela', () => {
  const evaluation = evaluateReservationSlot({
    establishmentId: PRACINHA_ID,
    weekday: SATURDAY,
    timeHHmm: '14:00',
  });

  assert.equal(evaluation.ok, true);
});

test('Highline sexta às 21:00 continua ok', () => {
  const evaluation = evaluateReservationSlot({
    establishmentId: HIGHLINE_ID,
    weekday: FRIDAY,
    timeHHmm: '21:00',
  });

  assert.equal(evaluation.ok, true);
});

test('evaluateReservationSlot respeita weeklyHours explícito no formato do load', () => {
  const weekly = buildDefaultWeekly('Pracinha do Seu Justino').map((day) => ({
    weekday: day.weekday,
    label: day.label,
    is_open: !!day.is_open,
    windows: formatDayWindows(day),
  }));

  const closed = evaluateReservationSlot({
    establishmentId: PRACINHA_ID,
    weekday: TUESDAY,
    timeHHmm: '20:00',
    weeklyHours: weekly,
  });
  assert.equal(closed.ok, false);
  assert.equal(closed.reason, 'closed_day');

  const inside = evaluateReservationSlot({
    establishmentId: PRACINHA_ID,
    weekday: FRIDAY,
    timeHHmm: '19:00',
    weeklyHours: weekly,
  });
  assert.equal(inside.ok, true);
});

test('evaluateWorkingStateSlot recusa terça do Pracinha só com a data', () => {
  const evaluation = evaluateWorkingStateSlot({
    establishment_id: PRACINHA_ID,
    reservation_date: '2026-11-03',
  });
  assert.equal(weekdayFromIso('2026-11-03'), TUESDAY);
  assert.equal(evaluation.ok, false);
  assert.equal(evaluation.reason, 'closed_day');
});

test('evaluateWorkingStateSlot recusa 14h na sexta do Pracinha', () => {
  const evaluation = evaluateWorkingStateSlot({
    establishment_id: PRACINHA_ID,
    reservation_date: '2026-11-06',
    reservation_time: '14:00',
  });
  assert.equal(evaluation.ok, false);
  assert.equal(evaluation.reason, 'outside_hours');
});

test('buildSlotGuardReply devolve o texto da avaliação recusada', () => {
  const evaluation = evaluateReservationSlot({
    establishmentId: PRACINHA_ID,
    weekday: TUESDAY,
    timeHHmm: '18:00',
  });
  assert.equal(buildSlotGuardReply(evaluation), evaluation.replyText);
  assert.equal(buildSlotGuardReply({ ok: true }), '');
});
