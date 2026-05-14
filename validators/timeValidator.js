const businessRulesEngine = require('../services/businessRulesEngine');
const { parseIsoDate } = require('./ageValidator');

function normalizeTime(value) {
  const raw = String(value || '').trim();
  const match = raw.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function parseWindow(windowText) {
  const match = String(windowText || '').match(/^(\d{2}:\d{2})-(\d{2}:\d{2})$/);
  if (!match) return null;
  return { start: match[1], end: match[2] };
}

function toMinutes(timeText) {
  const normalized = normalizeTime(timeText);
  if (!normalized) return null;
  const [hours, minutes] = normalized.split(':').map(Number);
  return hours * 60 + minutes;
}

function isTimeWithinWindow(timeText, windowText) {
  const window = parseWindow(windowText);
  const minutes = toMinutes(timeText);
  if (!window || minutes === null) return false;

  const start = toMinutes(window.start);
  let end = toMinutes(window.end);
  if (start === null || end === null) return false;

  if (end < start) {
    return minutes >= start || minutes <= end;
  }
  return minutes >= start && minutes <= end;
}

async function validateReservationTime(value, context = {}) {
  const normalized = normalizeTime(value);
  if (!normalized) {
    return {
      ok: false,
      code: 'TIME_INVALID',
      message: 'Qual horário você prefere? Pode me enviar no formato HH:MM (ex.: 20:30).',
    };
  }

  const establishmentId = Number(context.establishmentId);
  const reservationDate = String(context.reservationDate || '').trim();
  const pool = context.pool;

  if (!Number.isFinite(establishmentId) || establishmentId <= 0 || !reservationDate || !pool) {
    return { ok: true, normalized: `${normalized}:00` };
  }

  if (!parseIsoDate(reservationDate)) {
    return {
      ok: false,
      code: 'DATE_REQUIRED_FOR_TIME',
      message: 'Antes do horário, preciso confirmar a data da reserva.',
    };
  }

  const override = await businessRulesEngine.getDateOverride(pool, establishmentId, reservationDate);
  if (override && override.is_open === false) {
    return {
      ok: false,
      code: 'DATE_CLOSED',
      message: 'Nessa data a casa está fechada para reservas. Podemos tentar outro dia?',
    };
  }

  const windows = await businessRulesEngine.getOperatingWindowsForDate(
    pool,
    establishmentId,
    reservationDate
  );

  if (!windows.length) {
    return {
      ok: false,
      code: 'NO_WINDOWS',
      message: 'Não encontrei horários disponíveis para essa data. Quer tentar outro dia ou horário?',
    };
  }

  const fits = windows.some((windowText) => isTimeWithinWindow(normalized, windowText));
  if (!fits) {
    return {
      ok: false,
      code: 'TIME_OUTSIDE_WINDOW',
      message: `Esse horário não está entre as janelas disponíveis (${windows.join(' | ')}). Qual horário prefere dentro dessas opções?`,
    };
  }

  return { ok: true, normalized: `${normalized}:00` };
}

module.exports = {
  normalizeTime,
  validateReservationTime,
};
