'use strict';

/** Staff Agent — bloquear/liberar agenda + aviso SOL (casas com módulo reservas). */

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
  listAreasForEstablishment,
  establishmentHasReservasModule,
  describeScope,
  findBlocksOnDate,
  conflictingBlocks,
} = require('./agendaBlockHelpers');
const { upsertBlockAiNote, deactivateBlockAiNotes } = require('./agendaBlockAiNote');

const DEFAULT_REASON = 'Bloqueio manual (Staff Agent)';
const NO_RESERVAS_MSG =
  'Esta casa não tem o Sistema de Reservas ativo. Ative o módulo reservas na organização/estabelecimento para bloquear a agenda.';

async function rlsCtxFor(pool, establishmentId) {
  const organizationId = await resolveOrganizationIdForEstablishment(pool, establishmentId);
  return organizationId ? { organizationId } : { isAdmin: true };
}

function emitBlockChange(params) {
  try {
    require('../../utils/agendaRealtime').emitReservationBlockChanged(params);
  } catch (e) {
    console.warn('[staffAgent] agenda realtime indisponível:', e.message);
  }
}

async function assertReservasModule(pool, establishmentId) {
  if (await establishmentHasReservasModule(pool, establishmentId)) return null;
  return { ok: false, message: NO_RESERVAS_MSG };
}

function wantsAiNote(args) {
  if (args?.notify_sol === undefined || args?.notify_sol === null) return true;
  const raw = String(args.notify_sol).trim().toLowerCase();
  return !['0', 'false', 'nao', 'não', 'no', 'off'].includes(raw);
}

async function listarAreasReserva(pool, { establishmentId }) {
  const denied = await assertReservasModule(pool, establishmentId);
  if (denied) return denied;

  const areas = await listAreasForEstablishment(pool, establishmentId);
  if (!areas.length) {
    return {
      ok: false,
      message: 'Não encontrei áreas ativas de reserva nesta casa.',
    };
  }

  const lines = areas.map((a) => `#${a.id} ${a.name}`);
  return {
    ok: true,
    count: areas.length,
    areas,
    message: `Áreas de reserva nesta casa (${areas.length}):\n${lines.join('\n')}`,
  };
}

async function listarBloqueiosAgenda(pool, { establishmentId, args }) {
  const denied = await assertReservasModule(pool, establishmentId);
  if (denied) return denied;

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
  const denied = await assertReservasModule(pool, establishmentId);
  if (denied) return denied;

  const dateIso = parseFlexibleDate(args.date);
  if (!dateIso) {
    return { ok: false, message: 'Preciso da data do bloqueio. Ex.: "bloqueia o dia 15/09".' };
  }

  const endDateIso = args.end_date ? parseFlexibleDate(args.end_date) : null;
  if (args.end_date && !endDateIso) {
    return { ok: false, message: `Não entendi a data final "${args.end_date}". Use DD/MM ou YYYY-MM-DD.` };
  }
  if (endDateIso && endDateIso < dateIso) {
    return { ok: false, message: 'A data final não pode ser anterior à data inicial.' };
  }

  const reason = String(args.reason || '').trim() || DEFAULT_REASON;
  const registerAiNote = wantsAiNote(args);

  let area = null;
  if (args.area_name) {
    const resolved = await resolveArea(pool, establishmentId, args.area_name);
    if (!resolved.area) {
      const names = (resolved.ambiguous || resolved.options).map((o) => o.name).join(', ');
      return {
        ok: false,
        message: resolved.ambiguous
          ? `"${args.area_name}" ficou ambíguo. Qual delas: ${names}?`
          : `Não achei a área "${args.area_name}" nesta casa. Disponíveis: ${names || 'nenhuma'}. Se quiser, peça para eu listar as áreas.`,
      };
    }
    area = resolved.area;
  }

  const startTime = args.start_time ? parseTimeHHMM(args.start_time) : null;
  const endTime = args.end_time ? parseTimeHHMM(args.end_time) : null;
  if ((args.start_time && !startTime) || (args.end_time && !endTime)) {
    return { ok: false, message: 'Não entendi o horário. Use algo como 18:00 e 22:00.' };
  }

  const { start, end, endDateIso: resolvedEndDate } = blockBounds(
    dateIso,
    startTime,
    endTime,
    endDateIso
  );
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
  let dateFilter = 'AND reservation_date = $2';
  if (resolvedEndDate && resolvedEndDate !== dateIso) {
    reservationParams.push(resolvedEndDate);
    dateFilter = 'AND reservation_date >= $2 AND reservation_date <= $3';
  }
  if (area) {
    reservationParams.push(area.id);
    areaFilter = ` AND area_id = $${reservationParams.length}`;
  }
  const { rows: reservationRows } = await pool.query(
    `SELECT COUNT(*)::int AS total
       FROM restaurant_reservations
      WHERE establishment_id = $1
        ${dateFilter}
        AND COALESCE(UPPER(status::text), '') NOT IN ('CANCELADA', 'CANCELLED', 'CANCELED')
        ${areaFilter}`,
    reservationParams
  );
  const affectedReservations = reservationRows[0]?.total || 0;

  const dateLabel =
    resolvedEndDate && resolvedEndDate !== dateIso
      ? `${formatBr(dateIso)} a ${formatBr(resolvedEndDate)}`
      : formatBr(dateIso);

  const preview = {
    date: dateIso,
    end_date: resolvedEndDate,
    reason,
    area_id: area?.id ?? null,
    area_name: area?.name ?? null,
    start_datetime: start,
    end_datetime: end,
    affected_reservations: affectedReservations,
    notify_sol: registerAiNote,
  };

  if (mode === 'preview') {
    const warn = affectedReservations
      ? ` Atenção: já existem ${affectedReservations} reserva(s) nesse escopo — elas não são canceladas automaticamente.`
      : '';
    const solNote = registerAiNote
      ? ' Também vou registrar o aviso em Informações adicionais para a IA SOL não oferecer essas áreas.'
      : '';
    return {
      ok: true,
      needs_confirmation: true,
      preview,
      message: `Vou bloquear ${dateLabel} em ${describeScope(area?.name, start, end)} para novas reservas (motivo: ${reason}).${solNote}${warn} Confirmar?`,
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

  let aiNote = null;
  if (registerAiNote) {
    try {
      aiNote = await upsertBlockAiNote(pool, {
        establishmentId,
        dateIso,
        endDateIso: resolvedEndDate,
        areaId: area?.id ?? null,
        areaName: area?.name ?? null,
        startDatetime: start,
        endDatetime: end,
        reason,
      });
    } catch (e) {
      console.warn('[staffAgent] FAQ bloqueio agenda:', e.message);
      aiNote = { ok: false, error: e.message };
    }
  }

  const solMsg =
    registerAiNote && aiNote?.ok
      ? ' Aviso também registrado nas Informações adicionais para a IA SOL.'
      : registerAiNote
        ? ' (O bloqueio na agenda foi criado; o aviso na Base de Conhecimento falhou — confira manualmente.)'
        : '';

  return {
    ok: true,
    applied: true,
    preview: { ...preview, block_id: rows[0]?.id, ai_note: aiNote },
    message: `${dateLabel} bloqueado em ${describeScope(area?.name, start, end)} (#${rows[0]?.id}).${solMsg}`,
  };
}

async function liberarDiaAgenda(pool, { establishmentId, args, mode }) {
  const denied = await assertReservasModule(pool, establishmentId);
  if (denied) return denied;

  const dateIso = parseFlexibleDate(args.date);
  if (!dateIso) {
    return { ok: false, message: 'Preciso da data. Ex.: "libera o dia 15/09".' };
  }

  const allOnDate = await findBlocksOnDate(pool, establishmentId, dateIso);
  if (!allOnDate.length) {
    return { ok: false, message: `${formatBr(dateIso)} não está bloqueado.` };
  }

  let existing = allOnDate;
  let resolvedArea = null;
  if (args.area_name) {
    const resolved = await resolveArea(pool, establishmentId, args.area_name);
    if (!resolved.area) {
      const names = (resolved.ambiguous || resolved.options).map((o) => o.name).join(', ');
      return {
        ok: false,
        message: `Não achei a área "${args.area_name}" nesta casa. Disponíveis: ${names || 'nenhuma'}.`,
      };
    }
    resolvedArea = resolved.area;
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
      message: `Vou liberar ${formatBr(dateIso)} removendo ${existing.length} bloqueio(s): ${detail}. Também desativo o aviso correspondente nas Informações adicionais. Confirmar?`,
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

  try {
    await deactivateBlockAiNotes(pool, {
      establishmentId,
      dateIso,
      areaId: resolvedArea?.id ?? null,
      areaName: resolvedArea?.name ?? null,
    });
  } catch (e) {
    console.warn('[staffAgent] desativar FAQ bloqueio:', e.message);
  }

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
  listarAreasReserva,
  listarBloqueiosAgenda,
  bloquearDiaAgenda,
  liberarDiaAgenda,
};
