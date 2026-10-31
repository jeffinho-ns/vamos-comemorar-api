const {
  buildDefaultWeekly,
  formatDayWindows,
  ESTABLISHMENT_DEFAULT_NAMES,
} = require('../operationalHours/defaultWeeklySchedule');

const WEEKDAY_NAMES = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const FRIDAY = 5;

const SHORT_HOUSE_NAMES = {
  1: 'Seu Justino',
  7: 'Highline',
  8: 'Pracinha',
};

function parseHHmm(value) {
  const raw = String(value || '').trim();
  const match = raw.match(/^(\d{1,2})(?::(\d{2}))?(?::\d{2})?h?$/i);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2] || 0);
  if (!Number.isInteger(hours) || hours < 0 || hours > 23) return null;
  if (!Number.isInteger(minutes) || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function parseWindow(window) {
  const match = String(window || '').match(/(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})/);
  if (!match) return null;
  const start = parseHHmm(match[1]);
  const end = parseHHmm(match[2]);
  if (start == null || end == null) return null;
  return { start, end };
}

function isTimeInsideWindows(timeHHmm, windows) {
  const minutes = parseHHmm(timeHHmm);
  if (minutes == null) return false;
  const list = Array.isArray(windows) ? windows : [];
  return list.some((window) => {
    const parsed = parseWindow(window);
    if (!parsed) return false;
    if (parsed.end < parsed.start) {
      return minutes >= parsed.start || minutes <= parsed.end;
    }
    return minutes >= parsed.start && minutes <= parsed.end;
  });
}

function weekdayName(weekday) {
  return WEEKDAY_NAMES[Number(weekday)] || '';
}

function capitalize(word) {
  if (!word) return '';
  return word.charAt(0).toUpperCase() + word.slice(1);
}

function resolveHouseName(establishmentId) {
  const id = Number(establishmentId);
  if (SHORT_HOUSE_NAMES[id]) return SHORT_HOUSE_NAMES[id];
  const full = ESTABLISHMENT_DEFAULT_NAMES[id] || '';
  const lower = full.toLowerCase();
  if (lower.includes('pracinha')) return 'Pracinha';
  if (lower.includes('highline') || lower.includes('high line')) return 'Highline';
  if (lower.includes('seu justino')) return 'Seu Justino';
  return full || 'a casa';
}

function normalizeDay(day) {
  if (!day || typeof day !== 'object') {
    return { weekday: null, is_open: false, windows: [] };
  }
  const windows = Array.isArray(day.windows) ? day.windows : formatDayWindows(day);
  return {
    weekday: Number(day.weekday),
    is_open: !!day.is_open,
    windows,
  };
}

function resolveWeeklyHours(establishmentId, weeklyHours) {
  if (Array.isArray(weeklyHours) && weeklyHours.length > 0) {
    return weeklyHours.map((day) => normalizeDay(day));
  }
  const name = ESTABLISHMENT_DEFAULT_NAMES[Number(establishmentId)] || '';
  return buildDefaultWeekly(name).map((day) => normalizeDay(day));
}

function findOpenWeekdays(weekly) {
  return weekly
    .filter((day) => day.is_open && day.windows.length > 0)
    .map((day) => day.weekday);
}

function suggestDays(weekday, weekly) {
  const open = findOpenWeekdays(weekly);
  const requested = Number(weekday);
  let nextOpen = null;
  for (let offset = 1; offset <= 7; offset += 1) {
    const candidate = (requested + offset) % 7;
    if (open.includes(candidate)) {
      nextOpen = candidate;
      break;
    }
  }

  const suggestions = [];
  if (nextOpen != null) suggestions.push(nextOpen);
  if (open.includes(FRIDAY) && FRIDAY !== nextOpen && FRIDAY !== requested) {
    return [...suggestions, FRIDAY].map((day) => weekdayName(day));
  }

  for (let offset = 1; offset <= 7 && suggestions.length < 2; offset += 1) {
    const candidate = (requested + offset) % 7;
    if (open.includes(candidate) && !suggestions.includes(candidate)) {
      suggestions.push(candidate);
    }
  }
  return suggestions.map((day) => weekdayName(day));
}

function openingHourLabel(windows) {
  const parsed = parseWindow(Array.isArray(windows) ? windows[0] : '');
  if (!parsed) return '';
  const hours = Math.floor(parsed.start / 60);
  const minutes = parsed.start % 60;
  return minutes === 0 ? `${hours}h` : `${hours}h${String(minutes).padStart(2, '0')}`;
}

function buildClosedReply({ weekday, houseName, suggestedDays }) {
  const day = capitalize(weekdayName(weekday));
  const [first, second] = Array.isArray(suggestedDays) ? suggestedDays : [];
  const offer =
    first && second
      ? `Quer que eu veja ${first} ou ${second}?`
      : first
        ? `Quer que eu veja ${first}?`
        : 'Prefere outro dia?';
  return `${day} o ${houseName} fica fechado. ${offer}`;
}

function buildOutsideHoursReply({ weekday, houseName, windows }) {
  const day = capitalize(weekdayName(weekday));
  const openAt = openingHourLabel(windows);
  if (!openAt) {
    return `${day} esse horário fica fora do expediente do ${houseName}. Prefere outro horário?`;
  }
  return `${day} o ${houseName} abre às ${openAt}. Prefere outro horário dentro dessa janela?`;
}

function weekdayFromIso(iso) {
  const date = String(iso || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  return new Date(`${date}T12:00:00-03:00`).getUTCDay();
}

function evaluateWorkingStateSlot(workingState = {}, weeklyHours) {
  const dateIso = String(
    workingState.reservation_date || workingState.pending_reservation_date_iso || ''
  ).slice(0, 10);
  const timeHHmm = String(workingState.reservation_time || '').slice(0, 5);
  const establishmentId = Number(workingState.establishment_id);
  if (!dateIso || !Number.isFinite(establishmentId) || establishmentId <= 0) {
    return { ok: true, skipped: true };
  }
  const weekday = weekdayFromIso(dateIso);
  if (weekday == null) return { ok: true, skipped: true };
  const weekly = resolveWeeklyHours(establishmentId, weeklyHours);
  const day = weekly.find((row) => Number(row.weekday) === weekday);
  if (day && day.is_open && !timeHHmm) {
    return { ok: true, skipped: true };
  }
  return evaluateReservationSlot({
    establishmentId,
    weekday,
    timeHHmm: timeHHmm || '19:00',
    weeklyHours,
  });
}

function evaluateReservationSlot({ establishmentId, weekday, timeHHmm, weeklyHours } = {}) {
  const weekly = resolveWeeklyHours(establishmentId, weeklyHours);
  const day = weekly.find((row) => Number(row.weekday) === Number(weekday));
  const houseName = resolveHouseName(establishmentId);

  if (!day || !day.is_open) {
    const suggestedDays = suggestDays(weekday, weekly);
    return {
      ok: false,
      reason: 'closed_day',
      replyText: buildClosedReply({ weekday, houseName, suggestedDays }),
      suggestedDays,
    };
  }

  if (!day.windows.length) {
    return { ok: true };
  }

  if (isTimeInsideWindows(timeHHmm, day.windows)) {
    return { ok: true };
  }

  return {
    ok: false,
    reason: 'outside_hours',
    replyText: buildOutsideHoursReply({ weekday, houseName, windows: day.windows }),
  };
}

function buildSlotGuardReply(evaluation) {
  if (!evaluation || evaluation.ok) return '';
  return String(evaluation.replyText || '');
}

module.exports = {
  isTimeInsideWindows,
  weekdayFromIso,
  evaluateWorkingStateSlot,
  evaluateReservationSlot,
  buildSlotGuardReply,
};
