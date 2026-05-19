const businessRulesEngine = require('../businessRulesEngine');
const { buildDefaultWeekly } = require('../operationalHours/defaultWeeklySchedule');
const { formatReservationDateLabels } = require('../../nlp/dateResolver');

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

async function loadBlocksForDate(pool, establishmentId, isoDate) {
  if (!pool || !establishmentId || !isoDate) return [];
  try {
    const result = await pool.query(
      `SELECT reason, start_datetime, end_datetime, area_id, max_people_capacity, recurrence_type, recurrence_weekday
         FROM restaurant_reservation_blocks
        WHERE establishment_id = $1
          AND start_datetime::date <= $2::date
          AND end_datetime::date >= $2::date
        ORDER BY start_datetime ASC
        LIMIT 20`,
      [establishmentId, isoDate]
    );
    return result.rows || [];
  } catch (_error) {
    return [];
  }
}

async function loadEstablishmentPolicy(pool, establishmentId) {
  try {
    const result = await pool.query(
      `SELECT allow_capacity_override, allow_outside_hours
         FROM restaurant_reservation_policy
        WHERE establishment_id = $1`,
      [establishmentId]
    );
    const row = result.rows[0];
    return {
      allow_capacity_override: !!row?.allow_capacity_override,
      allow_outside_hours: !!row?.allow_outside_hours,
    };
  } catch (_error) {
    return { allow_capacity_override: false, allow_outside_hours: false };
  }
}

async function loadWeeklyHoursForEstablishment(pool, establishmentId, establishmentName = '') {
  try {
    const weeklyResult = await pool.query(
      `SELECT weekday, is_open, start_time::text, end_time::text,
              second_start_time::text, second_end_time::text
         FROM restaurant_reservation_operating_hours
        WHERE establishment_id = $1
        ORDER BY weekday ASC`,
      [establishmentId]
    );
    const byWeekday = new Map(weeklyResult.rows.map((r) => [Number(r.weekday), r]));
    const defaults = buildDefaultWeekly(establishmentName);
    return defaults.map((d) => {
      const saved = byWeekday.get(d.weekday);
      if (!saved) return d;
      const windows = saved.is_open ? formatTimeWindows(saved) : [];
      return {
        weekday: d.weekday,
        label: d.label || businessRulesEngine.weekdayLabelPt(d.weekday),
        is_open: !!saved.is_open,
        windows,
      };
    });
  } catch (_error) {
    return [];
  }
}

async function checkCapacityViaInternalApi({
  establishmentId,
  reservationDate,
  partySize,
  reservationTime,
}) {
  const port = process.env.PORT || 3000;
  const base = String(process.env.INTERNAL_API_BASE_URL || `http://127.0.0.1:${port}`).replace(
    /\/+$/,
    ''
  );
  const url = new URL(`${base}/api/restaurant-reservations/capacity/check`);
  url.searchParams.set('establishment_id', String(establishmentId));
  url.searchParams.set('date', reservationDate);
  if (Number.isFinite(partySize) && partySize > 0) {
    url.searchParams.set('new_reservation_people', String(partySize));
  }
  if (reservationTime) {
    url.searchParams.set('time', String(reservationTime).slice(0, 5));
  }

  try {
    const res = await fetch(url.toString());
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.success) {
      return { ok: false, error: data?.error || `capacity.check HTTP ${res.status}` };
    }
    return { ok: true, capacity: data.capacity || {} };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

/**
 * Mesmas fontes do painel /admin/restaurant-reservations (horários, exceções, política, bloqueios).
 */
async function buildAgentReservationOperatingBlock(
  pool,
  establishmentId,
  establishmentName = '',
  focusDateIso = null
) {
  const id = Number(establishmentId);
  if (!Number.isFinite(id) || id <= 0 || !pool) return '';

  const policy = await loadEstablishmentPolicy(pool, id);
  const weekly = await loadWeeklyHoursForEstablishment(pool, id, establishmentName);

  const weeklyLines = weekly.length
    ? weekly
        .map((w) => {
          if (!w.is_open) return `${w.label}: fechado`;
          const windows = Array.isArray(w.windows) ? w.windows : [];
          return `${w.label}: ${windows.length ? windows.join(' | ') : 'aberto (sem janela cadastrada)'}`;
        })
        .join('\n')
    : '(horário semanal não cadastrado — usar verificar_disponibilidade)';

  const lines = [
    'REGRAS DO PAINEL DE RESERVAS (mesma base do admin /admin/restaurant-reservations — priorize sobre suposições):',
    `Estabelecimento: ${establishmentName || id} (id ${id}).`,
    `Política: override_capacidade=${policy.allow_capacity_override ? 'sim' : 'não'}; override_horario=${policy.allow_outside_hours ? 'sim' : 'não'}.`,
    'Horário semanal cadastrado:',
    weeklyLines,
  ];

  const upcomingOverrides = await businessRulesEngine.loadUpcomingDateOverrides(pool, 60);
  const establishmentOverrides = upcomingOverrides.filter((row) => Number(row.establishment_id) === id);
  if (establishmentOverrides.length) {
    lines.push('Exceções de data próximas (calendário do admin):');
    for (const row of establishmentOverrides.slice(0, 14)) {
      if (!row.is_open) {
        lines.push(`- ${row.override_date}: FECHADO${row.note ? ` (${row.note})` : ''}`);
      } else {
        const windows = formatTimeWindows(row);
        lines.push(
          `- ${row.override_date}: ${windows.join(' | ') || 'aberto'}${row.note ? ` (${row.note})` : ''}`
        );
      }
    }
  }

  const focusDate = String(focusDateIso || '').slice(0, 10);
  if (focusDate) {
    const labels = formatReservationDateLabels(focusDate);
    const override = await businessRulesEngine.getDateOverride(pool, id, focusDate);
    const windows = await businessRulesEngine.getOperatingWindowsForDate(pool, id, focusDate);
    lines.push(`--- Agenda para ${labels.confirmationPhrase || focusDate} (${focusDate}) ---`);
    if (override && override.is_open === false) {
      lines.push(`Status: FECHADO para reservas.${override.note ? ` Motivo: ${override.note}` : ''}`);
    } else if (windows.length) {
      lines.push(`Janelas liberadas: ${windows.join(' | ')}.`);
    } else {
      lines.push('Status: sem janela de reserva neste dia (casa fechada ou sem horário).');
    }
    if (override && override.is_open !== false) {
      const special = formatTimeWindows(override);
      if (special.length) {
        lines.push(`Exceção do dia: ${special.join(' | ')}.`);
      }
    }

    const blocks = await loadBlocksForDate(pool, id, focusDate);
    if (blocks.length) {
      lines.push('Bloqueios de agenda neste dia:');
      for (const block of blocks) {
        const start = String(block.start_datetime || '').slice(0, 16).replace('T', ' ');
        const end = String(block.end_datetime || '').slice(0, 16).replace('T', ' ');
        const cap =
          block.max_people_capacity != null
            ? ` (limite parcial ${block.max_people_capacity} pessoas)`
            : ' (bloqueio total)';
        lines.push(`- ${start} até ${end}: ${block.reason || 'bloqueado'}${cap}`);
      }
    }
  }

  lines.push(
    'Antes de prometer horário ou criar pré-reserva, chame verificar_disponibilidade com a data confirmada (e horário/quantidade se já souber).'
  );

  return lines.join('\n');
}

module.exports = {
  buildAgentReservationOperatingBlock,
  checkCapacityViaInternalApi,
  loadBlocksForDate,
};
