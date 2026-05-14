function toLabel(start, end) {
  return `${start}–${end}`;
}

function buildDefaultWeekly(establishmentName = '') {
  const lower = String(establishmentName || '').toLowerCase();
  const days = Array.from({ length: 7 }, (_, weekday) => ({
    weekday,
    is_open: false,
    start_time: null,
    end_time: null,
    second_start_time: null,
    second_end_time: null,
    label: 'Fechado',
  }));

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

  const isRooftop = lower.includes('reserva rooftop') || lower.includes('rooftop');
  const isJustinoLike = lower.includes('seu justino') || lower.includes('pracinha');

  if (isRooftop) {
    setDay(2, '18:00', '22:30');
    setDay(3, '18:00', '22:30');
    setDay(4, '18:00', '22:30');
    setDay(5, '12:00', '16:00', '17:00', '22:30');
    setDay(6, '12:00', '16:00', '17:00', '22:30');
    setDay(0, '12:00', '16:00', '17:00', '20:30');
    return days;
  }

  if (isJustinoLike) {
    setDay(2, '18:00', '01:00');
    setDay(3, '18:00', '01:00');
    setDay(4, '18:00', '01:00');
    setDay(5, '18:00', '03:30');
    setDay(6, '18:00', '03:30');
    setDay(0, '12:00', '21:00');
    return days;
  }

  setDay(5, '18:00', '23:30');
  setDay(6, '14:00', '23:00');
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

module.exports = {
  buildDefaultWeekly,
  formatDayWindows,
  getDefaultWindowsForEstablishmentName,
};
