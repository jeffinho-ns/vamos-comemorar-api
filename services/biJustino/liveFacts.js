'use strict';

const snapshotStore = require('./snapshotStore');
const { extrasDionisioDoBanco, aplicarExtrasNoLive } = require('./reservasUnidas');

const TZ = 'America/Sao_Paulo';

const CANCELLED = ['cancelled', 'cancelada', 'canceled'];

async function resolveJustinoPlaceIds(pool) {
  const ids = new Set();
  try {
    const est = await pool.query(
      `SELECT legacy_place_id, legacy_bar_id
         FROM establishments
        WHERE slug = 'seu-justino'
           OR lower(name) = 'seu justino'`,
    );
    for (const row of est.rows) {
      const placeId = Number(row.legacy_place_id);
      const barId = Number(row.legacy_bar_id);
      if (placeId > 0) ids.add(placeId);
      if (barId > 0) ids.add(barId);
    }
  } catch (err) {
    console.warn('[bi-justino] establishments indisponível', { message: err.message });
  }
  if (ids.size === 0) ids.add(1);
  return [...ids];
}

async function hasCheckedInColumn(pool) {
  const found = await pool.query(
    `SELECT 1
       FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = 'restaurant_reservations'
        AND column_name = 'checked_in'
      LIMIT 1`,
  );
  return found.rows.length > 0;
}

async function loadLiveFacts(pool) {
  const placeIds = await resolveJustinoPlaceIds(pool);
  const withCheckin = await hasCheckedInColumn(pool);
  const checkinExpr = withCheckin
    ? `(checked_in IS TRUE OR checked_in::text IN ('1', 't', 'true'))`
    : 'FALSE';
  const today = `(NOW() AT TIME ZONE '${TZ}')::date`;
  const monthStart = `date_trunc('month', NOW() AT TIME ZONE '${TZ}')::date`;
  const notCancelled = `lower(replace(COALESCE(status, ''), '_', '-')) <> ALL($2::text[])`;

  const todayRows = await pool.query(
    `SELECT status,
            COUNT(*)::int AS reservas,
            COALESCE(SUM(number_of_people), 0)::int AS pessoas,
            COUNT(*) FILTER (WHERE ${checkinExpr})::int AS checkins
       FROM restaurant_reservations
      WHERE establishment_id = ANY($1::int[])
        AND reservation_date = ${today}
        AND ${notCancelled}
      GROUP BY status
      ORDER BY reservas DESC`,
    [placeIds, CANCELLED],
  );

  const agenda = await pool.query(
    `SELECT COUNT(*)::int AS reservas,
            COALESCE(SUM(number_of_people), 0)::int AS pessoas
       FROM restaurant_reservations
      WHERE establishment_id = ANY($1::int[])
        AND reservation_date >= ${today}
        AND reservation_date < (${today} + INTERVAL '30 days')::date
        AND ${notCancelled}`,
    [placeIds, CANCELLED],
  );

  const ultimo = await pool.query(
    `SELECT reservation_date::text AS data,
            COUNT(*)::int AS reservas,
            COALESCE(SUM(number_of_people), 0)::int AS pessoas
       FROM restaurant_reservations
      WHERE establishment_id = ANY($1::int[])
        AND ${notCancelled}
        AND reservation_date = (
          SELECT MAX(reservation_date)
            FROM restaurant_reservations
           WHERE establishment_id = ANY($1::int[])
             AND ${notCancelled}
        )
      GROUP BY reservation_date`,
    [placeIds, CANCELLED],
  );

  const month = await pool.query(
    `SELECT COUNT(*)::int AS reservas,
            COALESCE(SUM(number_of_people), 0)::int AS pessoas
       FROM restaurant_reservations
      WHERE establishment_id = ANY($1::int[])
        AND reservation_date >= ${monthStart}
        AND reservation_date < (${monthStart} + INTERVAL '1 month')::date
        AND ${notCancelled}`,
    [placeIds, CANCELLED],
  );

  const recent = await pool.query(
    `SELECT id,
            status,
            COALESCE(number_of_people, 0)::int AS pessoas,
            left(reservation_time::text, 5) AS hora,
            client_name AS nome,
            client_phone AS telefone,
            client_email AS email,
            origin AS origem,
            ${checkinExpr} AS checked_in
       FROM restaurant_reservations
      WHERE establishment_id = ANY($1::int[])
        AND reservation_date = ${today}
        AND ${notCancelled}
      ORDER BY id DESC
      LIMIT 12`,
    [placeIds, CANCELLED],
  );

  let recentRows = recent.rows;
  let recentesEm = 'hoje';
  if (recentRows.length === 0 && ultimo.rows[0]?.data) {
    const lastDay = await pool.query(
      `SELECT id,
              status,
              COALESCE(number_of_people, 0)::int AS pessoas,
              left(reservation_time::text, 5) AS hora,
              client_name AS nome,
              client_phone AS telefone,
              client_email AS email,
              origin AS origem,
              ${checkinExpr} AS checked_in
         FROM restaurant_reservations
        WHERE establishment_id = ANY($1::int[])
          AND reservation_date = $3::date
          AND ${notCancelled}
        ORDER BY id DESC
        LIMIT 12`,
      [placeIds, CANCELLED, ultimo.rows[0].data],
    );
    recentRows = lastDay.rows;
    recentesEm = ultimo.rows[0].data;
  }

  let convidados = null;
  try {
    const guests = await pool.query(
      `SELECT COUNT(*)::int AS total
         FROM guests g
         JOIN guest_lists gl ON gl.id = g.guest_list_id
         JOIN restaurant_reservations rr
           ON rr.id = gl.reservation_id
          AND gl.reservation_type = 'restaurant'
        WHERE rr.establishment_id = ANY($1::int[])
          AND (g.checked_in IS TRUE OR g.checked_in::text IN ('1', 't', 'true'))
          AND (g.checkin_time AT TIME ZONE '${TZ}')::date = ${today}`,
      [placeIds],
    );
    convidados = Number(guests.rows[0]?.total) || 0;
  } catch (err) {
    console.warn('[bi-justino] check-in de convidados indisponível', {
      establishment: 'Seu Justino',
      message: err.message,
    });
  }

  const porStatus = todayRows.rows.map((row) => ({
    status: row.status || 'sem status',
    reservas: Number(row.reservas) || 0,
    pessoas: Number(row.pessoas) || 0,
    checkins: Number(row.checkins) || 0,
  }));
  const hoje = porStatus.reduce(
    (acc, row) => {
      acc.reservas += row.reservas;
      acc.pessoas += row.pessoas;
      acc.checkins += row.checkins;
      return acc;
    },
    { reservas: 0, pessoas: 0, checkins: 0 },
  );

  const live = {
    establishment: 'Seu Justino',
    placeIds,
    hoje: { ...hoje, convidados },
    porStatus,
    agenda: {
      reservas: Number(agenda.rows[0]?.reservas) || 0,
      pessoas: Number(agenda.rows[0]?.pessoas) || 0,
    },
    ultimoDia: ultimo.rows[0]
      ? {
          data: ultimo.rows[0].data,
          reservas: Number(ultimo.rows[0].reservas) || 0,
          pessoas: Number(ultimo.rows[0].pessoas) || 0,
        }
      : null,
    mes: {
      reservas: Number(month.rows[0]?.reservas) || 0,
      pessoas: Number(month.rows[0]?.pessoas) || 0,
    },
    recentesEm,
    recentes: recentRows.map((row) => ({
      id: Number(row.id),
      status: row.status || 'sem status',
      pessoas: Number(row.pessoas) || 0,
      hora: row.hora || null,
      nome: row.nome || 'Reserva',
      telefone: row.telefone || null,
      email: row.email || null,
      origem: row.origem || null,
      checkedIn: Boolean(row.checked_in),
    })),
    quadroSemana: await loadQuadroReservas(pool, placeIds, CANCELLED, today, checkinExpr, notCancelled).catch(() => null),
  };
  try {
    const snap = await snapshotStore.latestPayload(pool, 'planilha:getReservationEntries');
    const extras = await extrasDionisioDoBanco(pool, placeIds, snap && snap.payload);
    const hojeIso = new Date().toLocaleDateString('en-CA', { timeZone: TZ });
    return aplicarExtrasNoLive(live, extras, hojeIso);
  } catch (err) {
    console.warn('[bi-justino] extras Dionísio no ao-vivo indisponíveis', {
      establishment: 'Seu Justino',
      message: err && err.message ? err.message : String(err),
    });
    return live;
  }
}

async function loadQuadroReservas(pool, placeIds, cancelled, today, checkinExpr, notCancelled) {
  const weekStart = `(${today} - ((EXTRACT(DOW FROM ${today})::int + 6) % 7) * INTERVAL '1 day')::date`;
  const rows = await pool.query(
    `SELECT reservation_date::text AS data,
            EXTRACT(DOW FROM reservation_date)::int AS dow,
            COUNT(*)::int AS reservas,
            COALESCE(SUM(number_of_people), 0)::int AS pessoas,
            COUNT(*) FILTER (WHERE ${checkinExpr})::int AS checkins
       FROM restaurant_reservations
      WHERE establishment_id = ANY($1::int[])
        AND reservation_date >= ${weekStart}
        AND reservation_date < (${weekStart} + INTERVAL '7 days')::date
        AND ${notCancelled}
      GROUP BY reservation_date
      ORDER BY reservation_date`,
    [placeIds, cancelled],
  );
  const tipos = await pool.query(
    `SELECT rr.reservation_date::text AS data,
            COALESCE(gl.event_type::text, '') AS tipo,
            COALESCE(SUM(rr.number_of_people), 0)::int AS pessoas
       FROM restaurant_reservations rr
       LEFT JOIN guest_lists gl
         ON gl.reservation_id = rr.id
        AND gl.reservation_type = 'restaurant'
      WHERE rr.establishment_id = ANY($1::int[])
        AND rr.reservation_date >= ${weekStart}
        AND rr.reservation_date < (${weekStart} + INTERVAL '7 days')::date
        AND ${notCancelled}
      GROUP BY rr.reservation_date, gl.event_type`,
    [placeIds, cancelled],
  ).catch(() => ({ rows: [] }));

  const porData = {};
  for (const row of rows.rows) {
    porData[row.data] = {
      data: row.data,
      dow: Number(row.dow),
      reservas: Number(row.reservas) || 0,
      pessoas: Number(row.pessoas) || 0,
      checkins: Number(row.checkins) || 0,
      aniversario: 0,
      despedida: 0,
      listaSexta: 0,
    };
  }
  for (const row of tipos.rows) {
    const atual = porData[row.data];
    if (!atual) continue;
    const tipo = String(row.tipo || '').toLowerCase();
    if (tipo.includes('anivers')) atual.aniversario += Number(row.pessoas) || 0;
    else if (tipo.includes('desped')) atual.despedida += Number(row.pessoas) || 0;
    else if (tipo.includes('sexta')) atual.listaSexta += Number(row.pessoas) || 0;
  }
  const dias = Object.keys(porData).sort().map((data) => porData[data]);
  const indicadores = {
    reservas: [0, 0, 0, 0, 0, 0, 0],
    pessoas: [0, 0, 0, 0, 0, 0, 0],
    checkins: [0, 0, 0, 0, 0, 0, 0],
  };
  for (const dia of dias) {
    const i = (Number(dia.dow) + 6) % 7;
    indicadores.reservas[i] += dia.reservas;
    indicadores.pessoas[i] += dia.pessoas;
    indicadores.checkins[i] += dia.checkins;
  }
  return { indicadores, dias };
}

module.exports = {
  CANCELLED,
  resolveJustinoPlaceIds,
  loadLiveFacts,
};
