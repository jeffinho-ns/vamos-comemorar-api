function toLabel(start, end) {
  return `${start}–${end}`;
}

function createClosedWeek() {
  return Array.from({ length: 7 }, (_, weekday) => ({
    weekday,
    is_open: false,
    start_time: null,
    end_time: null,
    second_start_time: null,
    second_end_time: null,
    label: 'Fechado',
  }));
}

function applySeuJustinoSchedule(setDay) {
  setDay(0, '12:00', '21:00');
  setDay(2, '18:00', '01:00');
  setDay(3, '18:00', '01:00');
  setDay(4, '18:00', '01:00');
  setDay(5, '18:00', '03:30');
  setDay(6, '12:00', '03:30');
}

function applyPracinhaSchedule(setDay) {
  setDay(0, '12:00', '21:00');
  setDay(2, '18:00', '01:00');
  setDay(3, '18:00', '01:00');
  setDay(4, '18:00', '01:00');
  setDay(5, '18:00', '03:30');
  setDay(6, '18:00', '03:30');
}

function applyHighlineSchedule(setDay) {
  setDay(5, '18:00', '23:30');
  setDay(6, '14:00', '23:30');
}

function applyRooftopSchedule(setDay) {
  setDay(0, '12:00', '16:00', '17:00', '20:30');
  setDay(2, '18:00', '22:30');
  setDay(3, '18:00', '22:30');
  setDay(4, '18:00', '22:30');
  setDay(5, '12:00', '16:00', '17:00', '22:30');
  setDay(6, '12:00', '16:00', '17:00', '22:30');
}

function buildDefaultWeekly(establishmentName = '') {
  const lower = String(establishmentName || '').toLowerCase();
  const days = createClosedWeek();

  const setDay = (weekday, start, end, secondStart = null, secondEnd = null) => {
    const labels = [toLabel(start, end)];
    if (secondStart && secondEnd) labels.push(toLabel(secondStart, secondEnd));
    days[weekday] = {
      weekday,
      is_open: true,
      start_time: start,
      end_time: end,
      second_start_time: secondStart,
      second_end_time: secondEnd,
      label: labels.join(' | '),
    };
  };

  if (lower.includes('pracinha')) {
    applyPracinhaSchedule(setDay);
    return days;
  }

  if (lower.includes('seu justino')) {
    applySeuJustinoSchedule(setDay);
    return days;
  }

  if (lower.includes('reserva rooftop') || lower.includes('rooftop')) {
    applyRooftopSchedule(setDay);
    return days;
  }

  if (lower.includes('highline') || lower.includes('high line')) {
    applyHighlineSchedule(setDay);
    return days;
  }

  return days;
}

function formatDayWindows(day) {
  if (!day?.is_open) return [];

  const windows = [];
  if (day.start_time && day.end_time) {
    windows.push(`${String(day.start_time).slice(0, 5)}-${String(day.end_time).slice(0, 5)}`);
  }
  if (day.second_start_time && day.second_end_time) {
    windows.push(
      `${String(day.second_start_time).slice(0, 5)}-${String(day.second_end_time).slice(0, 5)}`
    );
  }
  return windows;
}

function getDefaultWindowsForEstablishmentName(establishmentName, isoDate) {
  const date = new Date(`${isoDate}T12:00:00`);
  if (Number.isNaN(date.getTime())) return [];

  const weekly = buildDefaultWeekly(establishmentName);
  const day = weekly[date.getDay()];
  return formatDayWindows(day);
}

const ESTABLISHMENT_DEFAULT_NAMES = {
  1: 'Seu Justino',
  4: 'Oh Fregues',
  7: 'HighLine',
  8: 'Pracinha do Seu Justino',
  9: 'Reserva Rooftop',
  10: 'Sitio Ilha',
};

function getDefaultWindowsForEstablishmentId(establishmentId, isoDate) {
  const name = ESTABLISHMENT_DEFAULT_NAMES[Number(establishmentId)];
  if (!name) return [];
  return getDefaultWindowsForEstablishmentName(name, isoDate);
}

module.exports = {
  buildDefaultWeekly,
  formatDayWindows,
  getDefaultWindowsForEstablishmentName,
  getDefaultWindowsForEstablishmentId,
  ESTABLISHMENT_DEFAULT_NAMES,
};
