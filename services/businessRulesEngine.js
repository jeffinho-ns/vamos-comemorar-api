const {
  buildDefaultWeekly,
  formatDayWindows,
  getDefaultWindowsForEstablishmentName,
} = require('./operationalHours/defaultWeeklySchedule');

const WEEKDAY_LABELS_PT = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

function weekdayLabelPt(weekday) {
  const index = Number(weekday);
  if (!Number.isFinite(index) || index < 0 || index > 6) {
    return `dia_${weekday}`;
  }
  return WEEKDAY_LABELS_PT[index];
}

function getDefaultOperatingWindowsByEstablishment(establishmentId, isoDate) {
  const id = Number(establishmentId);
  const date = new Date(`${isoDate}T12:00:00`);
  if (Number.isNaN(date.getTime())) return [];
  const weekday = date.getDay();

  if (id === 9) {
    if (weekday >= 2 && weekday <= 4) return ['18:00-22:30'];
    if (weekday === 5 || weekday === 6) return ['12:00-16:00', '17:00-22:30'];
    if (weekday === 0) return ['12:00-16:00', '17:00-20:30'];
    return [];
  }

  if (id === 1 || id === 8) {
    if (weekday >= 2 && weekday <= 4) return ['18:00-01:00'];
    if (weekday === 5 || weekday === 6) return ['18:00-03:30'];
    if (weekday === 0) return ['12:00-21:00'];
    return [];
  }

  if (id === 7) return getDefaultWindowsForEstablishmentName('HighLine', isoDate);
  if (id === 4) return getDefaultWindowsForEstablishmentName('Oh Fregues', isoDate);
  if (id === 10) return getDefaultWindowsForEstablishmentName('Sitio Ilha', isoDate);

  return [];
}

async function resolveDefaultOperatingWindows(pool, establishmentId, isoDate) {
  const byId = getDefaultOperatingWindowsByEstablishment(establishmentId, isoDate);
  if (byId.length > 0) return byId;

  try {
    const result = await pool.query('SELECT name FROM places WHERE id = $1 LIMIT 1', [establishmentId]);
    const establishmentName = result.rows[0]?.name || '';
    return getDefaultWindowsForEstablishmentName(establishmentName, isoDate);
  } catch (_error) {
    return [];
  }
}

function formatTimeWindows(row) {
  const windows = [];
  if (row?.start_time && row?.end_time) {
    windows.push(`${String(row.start_time).slice(0, 5)}-${String(row.end_time).slice(0, 5)}`);
  }
  if (row?.second_start_time && row?.second_end_time) {
    windows.push(
      `${String(row.second_start_time).slice(0, 5)}-${String(row.second_end_time).slice(0, 5)}`
    );
  }
  return windows;
}

async function getDateOverride(pool, establishmentId, isoDate) {
  try {
    const result = await pool.query(
      `SELECT override_date::text, is_open, start_time::text, end_time::text,
              second_start_time::text, second_end_time::text, note
         FROM restaurant_reservation_date_overrides
        WHERE establishment_id = $1
          AND override_date = $2
        LIMIT 1`,
      [establishmentId, isoDate]
    );
    return result.rows[0] || null;
  } catch (_error) {
    return null;
  }
}

async function getOperatingWindowsForDate(pool, establishmentId, isoDate) {
  if (!establishmentId || !isoDate) return [];

  try {
    const override = await pool.query(
      `SELECT is_open, start_time::text, end_time::text, second_start_time::text, second_end_time::text
         FROM restaurant_reservation_date_overrides
        WHERE establishment_id = $1
          AND override_date = $2
        LIMIT 1`,
      [establishmentId, isoDate]
    );

    if (override.rows.length > 0) {
      const row = override.rows[0];
      if (!row.is_open) return [];
      const windows = formatTimeWindows(row);
      if (windows.length > 0) return windows;
      return resolveDefaultOperatingWindows(pool, establishmentId, isoDate);
    }

    const date = new Date(`${isoDate}T12:00:00`);
    if (Number.isNaN(date.getTime())) return [];
    const weekday = date.getDay();

    const weekly = await pool.query(
      `SELECT is_open, start_time::text, end_time::text, second_start_time::text, second_end_time::text
         FROM restaurant_reservation_operating_hours
        WHERE establishment_id = $1
          AND weekday = $2
        LIMIT 1`,
      [establishmentId, weekday]
    );

    if (weekly.rows.length === 0 || !weekly.rows[0].is_open) {
      return resolveDefaultOperatingWindows(pool, establishmentId, isoDate);
    }

    const windows = formatTimeWindows(weekly.rows[0]);
    if (windows.length > 0) return windows;
    return resolveDefaultOperatingWindows(pool, establishmentId, isoDate);
  } catch (_error) {
    return resolveDefaultOperatingWindows(pool, establishmentId, isoDate);
  }
}

function buildOverrideNotice(overrideRow) {
  if (!overrideRow) return null;

  const isoDate = String(overrideRow.override_date || '').slice(0, 10);
  const [year, month, day] = isoDate.split('-');
  const date = year && month && day ? `${day}-${month}-${year}` : isoDate;

  if (!overrideRow.is_open) {
    return `Para ${date}, temos exceção de agenda: a casa estará fechada.`;
  }

  const windows = formatTimeWindows(overrideRow);
  const notePart = overrideRow.note ? ` Obs: ${String(overrideRow.note)}` : '';

  if (windows.length === 0) {
    return `Para ${date}, temos exceção de agenda cadastrada.${notePart}`;
  }

  return `Para ${date}, temos horário especial: ${windows.join(' | ')}.${notePart}`;
}

async function loadWeeklyOperatingHours(pool) {
  try {
    const weeklyResult = await pool.query(
      `SELECT establishment_id, weekday, is_open, start_time::text, end_time::text,
              second_start_time::text, second_end_time::text
       FROM restaurant_reservation_operating_hours
       ORDER BY establishment_id ASC, weekday ASC`
    );
    return weeklyResult.rows || [];
  } catch (_error) {
    return [];
  }
}

async function loadReservationPolicies(pool) {
  try {
    const policyResult = await pool.query(
      `SELECT establishment_id, allow_capacity_override, allow_outside_hours
       FROM restaurant_reservation_policy
       ORDER BY establishment_id ASC`
    );
    return policyResult.rows || [];
  } catch (_error) {
    return [];
  }
}

async function loadUpcomingDateOverrides(pool, limit = 300) {
  try {
    const overridesResult = await pool.query(
      `SELECT establishment_id, override_date::text, is_open, start_time::text, end_time::text,
              second_start_time::text, second_end_time::text, note
       FROM restaurant_reservation_date_overrides
       WHERE override_date >= CURRENT_DATE
       ORDER BY override_date ASC, establishment_id ASC
       LIMIT $1`,
      [limit]
    );
    return overridesResult.rows || [];
  } catch (_error) {
    return [];
  }
}

function buildEstablishmentRulesBlock(establishments, weeklyRows, policyRows) {
  const weeklyByEstablishment = new Map();
  for (const row of weeklyRows) {
    const establishmentId = Number(row.establishment_id);
    if (!Number.isFinite(establishmentId) || establishmentId <= 0) continue;
    const list = weeklyByEstablishment.get(establishmentId) || [];
    list.push(row);
    weeklyByEstablishment.set(establishmentId, list);
  }

  const policyByEstablishment = new Map();
  for (const row of policyRows) {
    const establishmentId = Number(row.establishment_id);
    if (!Number.isFinite(establishmentId) || establishmentId <= 0) continue;
    policyByEstablishment.set(establishmentId, row);
  }

  const establishmentRulesLines = (establishments || []).map((est) => {
    const id = Number(est.id);
    const weekly = weeklyByEstablishment.get(id) || [];
    const policy = policyByEstablishment.get(id);

    const weeklyLine = weekly.length
      ? weekly
          .map((w) => {
            if (!w.is_open) return `${weekdayLabelPt(w.weekday)}: fechado`;
            const windows = formatTimeWindows(w);
            return `${weekdayLabelPt(w.weekday)}: ${windows.join(' | ') || 'aberto'}`;
          })
          .join('; ')
      : 'sem horário cadastrado';

    const policyLine = policy
      ? `override_capacidade=${policy.allow_capacity_override ? 'sim' : 'não'}; override_horario=${policy.allow_outside_hours ? 'sim' : 'não'}`
      : 'sem política específica cadastrada';

    return `- id ${id} (${est.name}) | horários: ${weeklyLine} | política: ${policyLine}`;
  });

  return establishmentRulesLines.length
    ? establishmentRulesLines.join('\n')
    : '(sem regras operacionais cadastradas)';
}

function buildDateOverridesBlock(establishments, overrideRows) {
  const overrideByEstablishment = new Map();
  for (const row of overrideRows) {
    const establishmentId = Number(row.establishment_id);
    if (!Number.isFinite(establishmentId) || establishmentId <= 0) continue;
    const list = overrideByEstablishment.get(establishmentId) || [];
    list.push(row);
    overrideByEstablishment.set(establishmentId, list);
  }

  const dateOverridesLines = (establishments || []).flatMap((est) => {
    const id = Number(est.id);
    const rows = overrideByEstablishment.get(id) || [];
    return rows.map((o) => {
      if (!o.is_open) {
        return `- id ${id} (${est.name}) | data ${o.override_date}: FECHADO${o.note ? ` | obs: ${o.note}` : ''}`;
      }
      const windows = formatTimeWindows(o);
      return `- id ${id} (${est.name}) | data ${o.override_date}: ${windows.join(' | ') || 'aberto'}${o.note ? ` | obs: ${o.note}` : ''}`;
    });
  });

  return dateOverridesLines.length
    ? dateOverridesLines.join('\n')
    : '(sem exceções de data cadastradas)';
}

function validateReservationPartySize(params) {
  const establishmentId = Number(params?.establishment_id);
  const quantidade = Number(params?.quantidade_convidados);

  if (establishmentId === 8 && Number.isFinite(quantidade) && quantidade > 60) {
    return {
      ok: false,
      message:
        'Na Pracinha do Seu Justino conseguimos registrar reservas para até 60 pessoas por vez. Se desejar, posso ajustar para até 60 agora ou chamar o time para um formato especial.',
    };
  }

  return { ok: true };
}

module.exports = {
  weekdayLabelPt,
  getDefaultOperatingWindowsByEstablishment,
  getDateOverride,
  getOperatingWindowsForDate,
  buildOverrideNotice,
  loadWeeklyOperatingHours,
  loadReservationPolicies,
  loadUpcomingDateOverrides,
  buildEstablishmentRulesBlock,
  buildDateOverridesBlock,
  validateReservationPartySize,
};
