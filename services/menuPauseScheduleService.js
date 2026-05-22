const TIMEZONE = 'America/Sao_Paulo';

const WEEKDAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

function normalizeWeekdays(raw) {
  if (!Array.isArray(raw)) return [];
  const out = new Set();
  for (const value of raw) {
    const n = Number(value);
    if (Number.isInteger(n) && n >= 0 && n <= 6) out.add(n);
  }
  return Array.from(out).sort((a, b) => a - b);
}

function normalizeTimeString(value) {
  const text = String(value || '').trim();
  const match = text.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function timeToMinutes(timeStr) {
  const [h, m] = String(timeStr).split(':').map(Number);
  return h * 60 + m;
}

/** Partes da data/hora em America/Sao_Paulo */
function getZonedParts(date = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = formatter.formatToParts(date);
  const weekdayShort = parts.find((p) => p.type === 'weekday')?.value || 'Sun';
  const hour = Number(parts.find((p) => p.type === 'hour')?.value || 0);
  const minute = Number(parts.find((p) => p.type === 'minute')?.value || 0);
  const weekdayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    weekday: weekdayMap[weekdayShort] ?? 0,
    minutes: hour * 60 + minute,
  };
}

function isScheduleActiveNow(schedule, now = new Date()) {
  if (!schedule || schedule.is_enabled === false) return false;
  const weekdays = normalizeWeekdays(schedule.weekdays);
  if (!weekdays.length) return false;

  const { weekday, minutes } = getZonedParts(now);
  if (!weekdays.includes(weekday)) return false;

  const start = timeToMinutes(schedule.start_time);
  const end = timeToMinutes(schedule.end_time);
  if (start === end) return true;
  if (start < end) return minutes >= start && minutes < end;
  return minutes >= start || minutes < end;
}

function scheduleMatchesItem(schedule, item) {
  const barId = Number(item.barId ?? item.barid);
  const categoryId = Number(item.categoryId ?? item.categoryid);
  if (Number(schedule.bar_id) !== barId) return false;
  if (Number(schedule.category_id) !== categoryId) return false;

  const subFilter = String(schedule.sub_category_name || '').trim();
  if (!subFilter) return true;

  const itemSub = String(item.subCategoryName ?? item.subCategory ?? item.subcategory ?? '').trim();
  return itemSub.toLowerCase() === subFilter.toLowerCase();
}

function isItemPausedBySchedules(item, schedules, now = new Date()) {
  if (!Array.isArray(schedules) || schedules.length === 0) return false;
  return schedules.some(
    (schedule) => scheduleMatchesItem(schedule, item) && isScheduleActiveNow(schedule, now),
  );
}

function formatScheduleSummary(schedule) {
  const days = normalizeWeekdays(schedule.weekdays)
    .map((d) => WEEKDAY_LABELS[d] || String(d))
    .join(', ');
  const start = String(schedule.start_time || '').slice(0, 5);
  const end = String(schedule.end_time || '').slice(0, 5);
  const sub = schedule.sub_category_name ? ` (${schedule.sub_category_name})` : '';
  return `${days} · ${start}–${end}${sub}`;
}

async function ensurePauseScheduleTable(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS menu_pause_schedules (
      id SERIAL PRIMARY KEY,
      bar_id INTEGER NOT NULL,
      category_id INTEGER NOT NULL,
      sub_category_name VARCHAR(255) NULL,
      weekdays SMALLINT[] NOT NULL DEFAULT '{}',
      start_time TIME NOT NULL,
      end_time TIME NOT NULL,
      is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
      label VARCHAR(120) NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function listPauseSchedules(pool, { barId, categoryId } = {}) {
  await ensurePauseScheduleTable(pool);
  const clauses = ['is_enabled = TRUE'];
  const params = [];
  if (barId) {
    params.push(Number(barId));
    clauses.push(`bar_id = $${params.length}`);
  }
  if (categoryId) {
    params.push(Number(categoryId));
    clauses.push(`category_id = $${params.length}`);
  }
  const result = await pool.query(
    `SELECT id, bar_id, category_id, sub_category_name, weekdays, start_time::text, end_time::text,
            is_enabled, label, created_at, updated_at
       FROM menu_pause_schedules
      WHERE ${clauses.join(' AND ')}
      ORDER BY bar_id, category_id, id`,
    params,
  );
  return result.rows.map((row) => ({
    ...row,
    weekdays: normalizeWeekdays(row.weekdays),
    summary: formatScheduleSummary(row),
  }));
}

async function createPauseSchedules(pool, payload = {}) {
  await ensurePauseScheduleTable(pool);
  const barId = Number(payload.bar_id ?? payload.barId);
  const categoryId = Number(payload.category_id ?? payload.categoryId);
  const subCategoryName = payload.sub_category_name ?? payload.subCategoryName ?? null;
  const windows = Array.isArray(payload.windows) ? payload.windows : [];

  if (!Number.isFinite(barId) || !Number.isFinite(categoryId) || windows.length === 0) {
    throw new Error('bar_id, category_id e windows são obrigatórios.');
  }

  const created = [];
  for (const window of windows) {
    const weekdays = normalizeWeekdays(window.weekdays);
    const startTime = normalizeTimeString(window.start_time ?? window.startTime);
    const endTime = normalizeTimeString(window.end_time ?? window.endTime);
    if (!weekdays.length || !startTime || !endTime) {
      throw new Error('Cada período precisa de dias da semana e horário início/fim válidos.');
    }

    const result = await pool.query(
      `INSERT INTO menu_pause_schedules
         (bar_id, category_id, sub_category_name, weekdays, start_time, end_time, label, is_enabled)
       VALUES ($1, $2, $3, $4::smallint[], $5::time, $6::time, $7, TRUE)
       RETURNING id, bar_id, category_id, sub_category_name, weekdays, start_time::text, end_time::text,
                 is_enabled, label`,
      [
        barId,
        categoryId,
        subCategoryName ? String(subCategoryName).trim() : null,
        weekdays,
        startTime,
        endTime,
        window.label ? String(window.label).trim() : null,
      ],
    );
    const row = result.rows[0];
    created.push({ ...row, weekdays: normalizeWeekdays(row.weekdays), summary: formatScheduleSummary(row) });
  }
  return created;
}

async function deletePauseSchedulesForScope(pool, { barId, categoryId, subCategoryName = null }) {
  await ensurePauseScheduleTable(pool);
  const params = [Number(barId), Number(categoryId)];
  let sql = `DELETE FROM menu_pause_schedules WHERE bar_id = $1 AND category_id = $2`;
  if (subCategoryName) {
    params.push(String(subCategoryName).trim());
    sql += ` AND LOWER(COALESCE(sub_category_name, '')) = LOWER($3)`;
  }
  const result = await pool.query(sql, params);
  return result.rowCount;
}

function applySchedulesToMenuItems(items, schedules, now = new Date()) {
  return (items || []).map((item) => {
    const baseVisible =
      item.visible === undefined || item.visible === null
        ? true
        : item.visible === 1 || item.visible === true;
    const schedulePaused = baseVisible && isItemPausedBySchedules(item, schedules, now);
    const effectiveVisible = baseVisible && !schedulePaused;
    const matchingSchedules = (schedules || []).filter((s) => scheduleMatchesItem(s, item));
    return {
      ...item,
      schedulePaused,
      effectiveVisible,
      pauseSchedules: matchingSchedules.map((s) => ({
        id: s.id,
        summary: s.summary || formatScheduleSummary(s),
        weekdays: normalizeWeekdays(s.weekdays),
        start_time: String(s.start_time || '').slice(0, 5),
        end_time: String(s.end_time || '').slice(0, 5),
      })),
    };
  });
}

module.exports = {
  TIMEZONE,
  WEEKDAY_LABELS,
  normalizeWeekdays,
  normalizeTimeString,
  isScheduleActiveNow,
  isItemPausedBySchedules,
  formatScheduleSummary,
  listPauseSchedules,
  createPauseSchedules,
  deletePauseSchedulesForScope,
  applySchedulesToMenuItems,
};
