const test = require('node:test');
const assert = require('node:assert/strict');
const {
  isScheduleActiveNow,
  isItemPausedBySchedules,
  normalizeWeekdays,
} = require('../../services/menuPauseScheduleService');

test('isScheduleActiveNow respeita dia e faixa horária', () => {
  const schedule = {
    is_enabled: true,
    weekdays: [2],
    start_time: '12:00:00',
    end_time: '15:00:00',
  };
  const tuesdayLunch = new Date('2026-05-19T14:00:00-03:00');
  const tuesdayEvening = new Date('2026-05-19T20:00:00-03:00');
  assert.equal(isScheduleActiveNow(schedule, tuesdayLunch), true);
  assert.equal(isScheduleActiveNow(schedule, tuesdayEvening), false);
});

test('isItemPausedBySchedules casa item com categoria', () => {
  const schedules = [
    {
      id: 1,
      bar_id: 5,
      category_id: 10,
      sub_category_name: null,
      is_enabled: true,
      weekdays: normalizeWeekdays([1, 2, 3, 4, 5]),
      start_time: '18:00:00',
      end_time: '23:00:00',
    },
  ];
  const item = {
    barId: 5,
    categoryId: 10,
    subCategoryName: 'Drinks',
  };
  const mondayNight = new Date('2026-05-18T21:00:00-03:00');
  assert.equal(isItemPausedBySchedules(item, schedules, mondayNight), true);
});
