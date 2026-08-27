'use strict';

/**
 * Staff Agent Fase 2 — bloquear / liberar dia na agenda de reservas.
 *
 * Reusa a tabela restaurant_reservation_blocks (mesma de /api/restaurant-reservation-blocks),
 * então o bloqueio criado aqui aparece no painel e bloqueia a página /reservar.
 *
 * Fase 2: um dia por vez. Opcionalmente restrito a uma área e/ou faixa de horário.
 * Sem recorrência.
 */

const { queryWithRlsContext } = require('../../tenancy/scopedQuery');
const {
  resolveOrganizationIdForEstablishment,
} = require('../../tenancy/resolveOrganizationId');
const { todayIsoSp } = require('./dateUtils');
const {
  parseFlexibleDate,
  parseTimeHHMM,
  blockBounds,
  formatBr,
  formatTimeRange,
  resolveArea,
  describeScope,
  findBlocksOnDate,
  conflictingBlocks,
} = require('./agendaBlockHelpers');

const DEFAULT_REASON = 'Bloqueio manual (Staff Agent)';

async function rlsCtxFor(pool, establishmentId) {
  const organizationId = await resolveOrganizationIdForEstablishment(pool, establishmentId);
  return organizationId ? { organizationId } : { isAdmin: true };
}

/** Realtime é opcional: nunca deve derrubar a aplicação do bloqueio. */
function emitBlockChange(params) {
  try {
    require('../../utils/agendaRealtime').emitReservationBlockChanged(params);
  } catch (e) {
    console.warn('[staffAgent] agenda realtime indisponível:', e.message);
  }
}


async function listarBloqueiosAgenda(pool, { establishmentId, args }) {
  const dateIso = args.date ? parseFlexibleDate(args.date) : null;

  if (args.date && !dateIso) {
    return { ok: false, message: `Não entendi a data "${args.date}". Use algo como 15/09.` };
  }

  const rows = dateIso
    ? await findBlocksOnDate(pool, establishmentId, dateIso)
    : (
        await pool.query(
          `SELECT b.id, b.reason, b.area_id, b.start_datetime, b.end_datetime, ra.name AS area_name
             FROM restaurant_reservation_blocks b
             LEFT JOIN restaurant_areas ra ON ra.id = b.area_id
            WHERE b.establishment_id = $1
              AND b.end_datetime::date >= $2
            ORDER BY b.start_datetime ASC
            LIMIT 20`,
          [establishmentId, todayIsoSp()]
        )
      ).rows;

  const blocks = rows.map((r) => ({
    id: r.id,
    date: String(r.start_datetime).slice(0, 10),
    reason: r.reason,
    area_id: r.area_id,
    area_name: r.area_name || null,
    time_range: formatTimeRange(r.start_datetime, r.end_datetime),
  }));

  const lines = blocks.map(
    (b) =>
      `#${b.id} ${formatBr(b.date)} — ${b.area_name || 'casa inteira'}, ${b.time_range} — ${b.reason}`
  );

  return {
    ok: true,
    count: blocks.length,
    blocks,
    message: blocks.length
      ? `${blocks.length} bloqueio(s):\n${lines.join('\n')}`
      : dateIso
        ? `Nenhum bloqueio em ${formatBr(dateIso)}. A agenda está aberta.`
        : 'Nenhum bloqueio futuro na agenda.',
  };
}

async function bloquearDiaAgenda(pool, { establishmentId, args, mode, userId }) {
  const dateIso = parseFlexibleDate(args.date);
  if (!dateIso) {
    return { ok: false, message: 'Preciso da data do bloqueio. Ex.: "bloqueia o dia 15/09".' };
  }

  const reason = String(args.reason || '').trim() || DEFAULT_REASON;

  let area = null;
  if (args.area_name) {
    const resolved = await resolveArea(pool, establishmentId, args.area_name);
    if (!resolved.area) {
      const names = (resolved.ambiguous || resolved.options).map((o) => o.name).join(', ');
      return {
        ok: false,
        message: resolved.ambiguous
          ? `"${args.area_name}" ficou ambíguo. Qual delas: ${names}?`
          : `Não achei a área "${args.area_name}" nesta casa. Disponíveis: ${names || 'nenhuma'}.`,
      };
    }
    area = resolved.area;
  }

  const startTime = args.start_time ? parseTimeHHMM(args.start_time) : null;
  const endTime = args.end_time ? parseTimeHHMM(args.end_time) : null;
  if ((args.start_time && !startTime) || (args.end_time && !endTime)) {
    return { ok: false, message: 'Não entendi o horário. Use algo como 18:00 e 22:00.' };
  }

  const { start, end } = blockBounds(dateIso, startTime, endTime);
  const existing = await findBlocksOnDate(pool, establishmentId, dateIso);
  const conflicts = conflictingBlocks(existing, { areaId: area?.id ?? null, start, end });

  if (conflicts.length) {
    const c = conflicts[0];
    return {
      ok: false,
      message: `Já existe bloqueio nesse período: #${c.id} ${c.area_name || 'casa inteira'}, ${formatTimeRange(c.start_datetime, c.end_datetime)} — ${c.reason}.`,
    };
  }

  const reservationParams = [establishmentId, dateIso];
  let areaFilter = '';
  if (area) {
    reservationParams.push(area.id);
    areaFilter = ` AND area_id = $${reservationParams.length}`;
  }
  const { rows: reservationRows } = await pool.query(
    `SELECT COUNT(*)::int AS total
       FROM restaurant_reservations
      WHERE establishment_id = $1
        AND reservation_date = $2
        AND COALESCE(UPPER(status::text), '') NOT IN ('CANCELADA', 'CANCELLED', 'CANCELED')
        ${areaFilter}`,
    reservationParams
  );
  const affectedReservations = reservationRows[0]?.total || 0;

  const preview = {
    date: dateIso,
    reason,
    area_id: area?.id ?? null,
    area_name: area?.name ?? null,
    start_datetime: start,
    end_datetime: end,
    affected_reservations: affectedReservations,
  };

  if (mode === 'preview') {
    const warn = affectedReservations
      ? ` Atenção: já existem ${affectedReservations} reserva(s) nesse escopo — elas não são canceladas automaticamente.`
      : '';
    return {
      ok: true,
      needs_confirmation: true,
      preview,
      message: `Vou bloquear ${formatBr(dateIso)} em ${describeScope(area?.name, start, end)} para novas reservas (motivo: ${reason}).${warn} Confirmar?`,
    };
  }

  const ctx = await rlsCtxFor(pool, establishmentId);
  const organizationId = ctx.organizationId || null;

  const { rows } = await queryWithRlsContext(
    pool,
    ctx,
    `INSERT INTO restaurant_reservation_blocks
       (establishment_id, area_id, start_datetime, end_datetime, reason,
        recurrence_type, recurrence_weekday, max_people_capacity, created_by, organization_id)
     VALUES ($1, $2, $3, $4, $5, 'none', NULL, NULL, $6, $7)
     RETURNING id`,
    [establishmentId, area?.id ?? null, start, end, reason, userId || null, organizationId]
  );

  emitBlockChange({
    establishmentId,
    action: 'created',
    blockIds: rows[0]?.id ? [rows[0].id] : [],
    date: dateIso,
    reason,
  });

  return {
    ok: true,
    applied: true,
    preview: { ...preview, block_id: rows[0]?.id },
    message: `${formatBr(dateIso)} bloqueado em ${describeScope(area?.name, start, end)} (#${rows[0]?.id}).`,
  };
}

async function liberarDiaAgenda(pool, { establishmentId, args, mode }) {
  const dateIso = parseFlexibleDate(args.date);
  if (!dateIso) {
    return { ok: false, message: 'Preciso da data. Ex.: "libera o dia 15/09".' };
  }

  const allOnDate = await findBlocksOnDate(pool, establishmentId, dateIso);
  if (!allOnDate.length) {
    return { ok: false, message: `${formatBr(dateIso)} não está bloqueado.` };
  }

  let existing = allOnDate;
  if (args.area_name) {
    const resolved = await resolveArea(pool, establishmentId, args.area_name);
    if (!resolved.area) {
      const names = (resolved.ambiguous || resolved.options).map((o) => o.name).join(', ');
      return {
        ok: false,
        message: `Não achei a área "${args.area_name}" nesta casa. Disponíveis: ${names || 'nenhuma'}.`,
      };
    }
    existing = allOnDate.filter((b) => Number(b.area_id) === Number(resolved.area.id));
    if (!existing.length) {
      return {
        ok: false,
        message: `Não há bloqueio da área ${resolved.area.name} em ${formatBr(dateIso)}.`,
      };
    }
  }

  const preview = {
    date: dateIso,
    block_ids: existing.map((b) => b.id),
    reasons: existing.map((b) => b.reason),
  };

  if (mode === 'preview') {
    const detail = existing
      .map(
        (b) =>
          `#${b.id} ${b.area_name || 'casa inteira'}, ${formatTimeRange(b.start_datetime, b.end_datetime)} — ${b.reason}`
      )
      .join('; ');
    return {
      ok: true,
      needs_confirmation: true,
      preview,
      message: `Vou liberar ${formatBr(dateIso)} removendo ${existing.length} bloqueio(s): ${detail}. Confirmar?`,
    };
  }

  const ctx = await rlsCtxFor(pool, establishmentId);
  await queryWithRlsContext(
    pool,
    ctx,
    `DELETE FROM restaurant_reservation_blocks
      WHERE establishment_id = $1
        AND id = ANY($2::int[])`,
    [establishmentId, preview.block_ids]
  );

  emitBlockChange({
    establishmentId,
    action: 'deleted',
    blockIds: preview.block_ids,
    date: dateIso,
  });

  return {
    ok: true,
    applied: true,
    preview,
    message: args.area_name
      ? `${formatBr(dateIso)} liberado na área ${existing[0].area_name}.`
      : `${formatBr(dateIso)} liberado para reservas.`,
  };
}

module.exports = {
  listarBloqueiosAgenda,
  bloquearDiaAgenda,
  liberarDiaAgenda,
};
