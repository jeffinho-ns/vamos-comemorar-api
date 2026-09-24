'use strict';

const { findRole, isLeaderRole } = require('./playbookRoles');
const { POINTS, awardOnce } = require('./playbookPoints');

const TZ = 'America/Sao_Paulo';
const DAY_LABELS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

function todaySaoPaulo() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
}

function clockInSaoPaulo(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: TZ,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(date);
}

/** Segunda-feira da semana que contém `start` (YYYY-MM-DD), no calendário de São Paulo. */
function weekRange(startParam) {
  const base = /^\d{4}-\d{2}-\d{2}$/.test(startParam || '') ? startParam : todaySaoPaulo();
  const [year, month, day] = base.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 15));
  const dow = date.getUTCDay();
  const delta = dow === 0 ? -6 : 1 - dow;
  date.setUTCDate(date.getUTCDate() + delta);
  const days = [];
  for (let i = 0; i < 7; i += 1) {
    const cursor = new Date(date);
    cursor.setUTCDate(date.getUTCDate() + i);
    const iso = cursor.toISOString().slice(0, 10);
    days.push({
      date: iso,
      label: `${DAY_LABELS[cursor.getUTCDay()]} ${iso.slice(8, 10)}/${iso.slice(5, 7)}`,
    });
  }
  return { start: days[0].date, end: days[6].date, days };
}

function resolveOpsScope(ctx, query) {
  const leader = ctx.scope.seesAll || (ctx.profile && isLeaderRole(ctx.profile.role_key));
  if (!leader) {
    return { error: { status: 403, message: 'O quadro da semana é do líder e do RH.' } };
  }
  if (ctx.scope.seesAll) {
    const establishmentId = Number(query.establishment_id);
    if (!Number.isFinite(establishmentId) || establishmentId <= 0) {
      return { error: { status: 422, message: 'Informe a unidade para ver a semana.' } };
    }
    return { establishmentId, sectorKey: null, sectorName: null };
  }
  if (!ctx.profile?.establishment_id) {
    return { error: { status: 422, message: 'Sua função ainda não foi cadastrada pelo RH.' } };
  }
  const wholeHouse = ctx.profile.role_key === 'gerente';
  return {
    establishmentId: Number(ctx.profile.establishment_id),
    sectorKey: wholeHouse ? null : ctx.profile.sector_key || null,
    sectorName: wholeHouse ? null : ctx.profile.sector_name || null,
  };
}

function slotFromRun(run) {
  if (!run) return null;
  return {
    at: clockInSaoPaulo(run.completed_at || run.started_at),
    by_name: run.by_name || null,
    nao_ok: Number(run.nao_ok) || 0,
    incidents: Number(run.incidents) || 0,
  };
}

function buildWeekBoard({ days, sectors, runs }) {
  const byKey = new Map();
  for (const run of runs) {
    const sectorKey = run.sector_key || 'sem_setor';
    byKey.set(`${sectorKey}|${String(run.run_date).slice(0, 10)}|${run.shift_type}`, run);
  }

  const known = new Map(sectors.map((sector) => [sector.key, sector]));
  for (const run of runs) {
    const key = run.sector_key || 'sem_setor';
    if (!known.has(key)) {
      known.set(key, { key, name: run.sector_name || 'Sem setor', sort_order: 999 });
    }
  }

  const ordered = [...known.values()].sort(
    (a, b) => (a.sort_order || 0) - (b.sort_order || 0) || String(a.name).localeCompare(String(b.name))
  );

  return ordered.map((sector) => ({
    key: sector.key,
    name: sector.name,
    days: days.map((day) => ({
      date: day.date,
      abertura: slotFromRun(byKey.get(`${sector.key}|${day.date}|abertura`)),
      fechamento: slotFromRun(byKey.get(`${sector.key}|${day.date}|fechamento`)),
    })),
  }));
}

async function loadWeekBoard(pool, { establishmentId, sectorKey, start }) {
  const range = weekRange(start);
  const params = [establishmentId, range.start, range.end];
  let sectorSql = '';
  if (sectorKey) {
    params.push(sectorKey);
    sectorSql = ` AND s.key = $${params.length}`;
  }

  const sectors = await pool.query(
    `SELECT s.key, s.name, s.sort_order
       FROM j360_checklist_templates t
       JOIN j360_sectors s ON s.id = t.sector_id
      WHERE t.establishment_id = $1
        AND t.is_active = TRUE
        AND t.shift_type IN ('abertura', 'fechamento')
        ${sectorSql}
      GROUP BY s.key, s.name, s.sort_order
      ORDER BY s.sort_order, s.name`,
    params
  );

  const runs = await pool.query(
    `SELECT DISTINCT ON (s.key, r.run_date, t.shift_type)
            r.id, r.run_date, r.started_at, r.completed_at, t.shift_type,
            s.key AS sector_key, s.name AS sector_name,
            COALESCE(uc.name, us.name) AS by_name,
            (SELECT COUNT(*)::int FROM j360_checklist_run_items i
              WHERE i.run_id = r.id AND i.status = 'nao_ok') AS nao_ok,
            (SELECT COUNT(*)::int FROM j360_incidents inc
              JOIN j360_checklist_run_items i ON i.id = inc.checklist_run_item_id
             WHERE i.run_id = r.id
               AND inc.status IN ('aberta', 'em_andamento', 'aguardando')) AS incidents
       FROM j360_checklist_runs r
       JOIN j360_checklist_templates t ON t.id = r.template_id
       JOIN j360_sectors s ON s.id = COALESCE(r.sector_id, t.sector_id)
       LEFT JOIN users uc ON uc.id = r.completed_by
       LEFT JOIN users us ON us.id = r.started_by
      WHERE r.establishment_id = $1
        AND r.run_date >= $2::date
        AND r.run_date <= $3::date
        AND r.status = 'concluido'
        AND t.shift_type IN ('abertura', 'fechamento')
        ${sectorSql}
      ORDER BY s.key, r.run_date, t.shift_type, r.completed_at NULLS LAST, r.id`,
    params
  );

  return {
    start: range.start,
    end: range.end,
    days: range.days,
    sectors: buildWeekBoard({
      days: range.days,
      sectors: sectors.rows,
      runs: runs.rows,
    }),
  };
}

function resolvePeopleScope(ctx, query) {
  if (ctx.scope.seesAll) {
    const establishmentId = Number(query.establishment_id);
    return {
      establishmentId: Number.isFinite(establishmentId) && establishmentId > 0 ? establishmentId : null,
      sectorKey: null,
      userId: null,
    };
  }
  if (ctx.profile && isLeaderRole(ctx.profile.role_key)) {
    const wholeHouse = ctx.profile.role_key === 'gerente';
    return {
      establishmentId: Number(ctx.profile.establishment_id),
      sectorKey: wholeHouse ? null : ctx.profile.sector_key || null,
      userId: null,
    };
  }
  if (ctx.profile?.user_id) {
    return {
      establishmentId: Number(ctx.profile.establishment_id) || null,
      sectorKey: null,
      userId: Number(ctx.profile.user_id),
    };
  }
  return { error: { status: 403, message: 'A progressão semanal pede uma ficha de função.' } };
}

async function loadWeekPeople(pool, { organizationId, establishmentId, sectorKey, userId, start }) {
  const range = weekRange(start);
  const params = [organizationId];
  const filters = ['p.organization_id = $1'];
  if (establishmentId) {
    params.push(establishmentId);
    filters.push(`p.establishment_id = $${params.length}`);
  }
  if (sectorKey) {
    params.push(sectorKey);
    filters.push(`s.key = $${params.length}`);
  }
  if (userId) {
    params.push(userId);
    filters.push(`p.user_id = $${params.length}`);
  }

  const people = await pool.query(
    `SELECT p.user_id, u.name AS user_name, p.role_key, e.name AS establishment_name,
            s.name AS sector_name
       FROM iri_employee_profiles p
       JOIN users u ON u.id = p.user_id
       JOIN establishments e ON e.id = p.establishment_id
       LEFT JOIN iri_sectors s ON s.id = p.sector_id
      WHERE ${filters.join(' AND ')}
      ORDER BY e.name, u.name
      LIMIT 200`,
    params
  );

  const ids = people.rows.map((row) => row.user_id);
  let runs = [];
  if (ids.length) {
    const runParams = [ids, range.start, range.end];
    const found = await pool.query(
      `SELECT r.run_date, t.shift_type, sec.name AS sector_name,
              COALESCE(r.completed_by, r.started_by) AS user_id
         FROM j360_checklist_runs r
         JOIN j360_checklist_templates t ON t.id = r.template_id
         LEFT JOIN j360_sectors sec ON sec.id = COALESCE(r.sector_id, t.sector_id)
        WHERE COALESCE(r.completed_by, r.started_by) = ANY($1::int[])
          AND r.run_date >= $2::date
          AND r.run_date <= $3::date
          AND r.status = 'concluido'
          AND t.shift_type IN ('abertura', 'fechamento')`,
      runParams
    );
    runs = found.rows;
  }

  const byPerson = new Map();
  for (const run of runs) {
    const key = `${run.user_id}|${String(run.run_date).slice(0, 10)}|${run.shift_type}|${run.sector_name || ''}`;
    if (byPerson.has(key)) continue;
    byPerson.set(key, run);
  }

  const peopleOut = people.rows.map((person) => {
    const days = range.days.map((day) => {
      const marks = [];
      for (const run of byPerson.values()) {
        if (Number(run.user_id) !== Number(person.user_id)) continue;
        if (String(run.run_date).slice(0, 10) !== day.date) continue;
        const verb = run.shift_type === 'fechamento' ? 'Fechou' : 'Abriu';
        marks.push(`${verb} ${run.sector_name || 'setor'}`);
      }
      return { date: day.date, marks };
    });
    const done = days.reduce((sum, day) => sum + day.marks.length, 0);
    return {
      user_id: person.user_id,
      name: person.user_name,
      role_label: findRole(person.role_key)?.label || person.role_key,
      establishment_name: person.establishment_name,
      sector_name: person.sector_name,
      done,
      days,
    };
  });

  return {
    start: range.start,
    end: range.end,
    days: range.days,
    people: peopleOut,
  };
}

async function awardOperationalMonth(pool, { organizationId, establishmentId, start, end, createdBy }) {
  const { rows } = await pool.query(
    `SELECT r.id, r.run_date, r.completed_by, r.started_by, t.shift_type, s.name AS sector_name
       FROM j360_checklist_runs r
       JOIN j360_checklist_templates t ON t.id = r.template_id
       LEFT JOIN j360_sectors s ON s.id = COALESCE(r.sector_id, t.sector_id)
      WHERE r.establishment_id = $1
        AND r.run_date >= $2::date
        AND r.run_date < $3::date
        AND r.status = 'concluido'
        AND t.shift_type IN ('abertura', 'fechamento')`,
    [establishmentId, start, end]
  );

  let aberturas = 0;
  let fechamentos = 0;
  let pontosNovos = 0;

  for (const row of rows) {
    const userId = row.completed_by || row.started_by;
    const source = row.shift_type === 'fechamento' ? 'fechamento' : 'abertura';
    if (source === 'fechamento') fechamentos += 1;
    else aberturas += 1;
    if (!userId) continue;
    const runDate = String(row.run_date).slice(0, 10);
    const inserted = await awardOnce(pool, {
      organizationId,
      establishmentId,
      userId,
      source,
      points: POINTS[source],
      evidenceType: 'j360_checklist_run',
      evidenceId: row.id,
      note: `${row.sector_name || 'Setor'} · ${runDate}`,
      createdBy,
      createdAt: `${runDate}T15:00:00-03:00`,
    });
    if (inserted) pontosNovos += Number(inserted.points) || 0;
  }

  return { aberturas, fechamentos, pontos_novos: pontosNovos };
}

module.exports = {
  weekRange,
  buildWeekBoard,
  resolveOpsScope,
  loadWeekBoard,
  resolvePeopleScope,
  loadWeekPeople,
  awardOperationalMonth,
};
