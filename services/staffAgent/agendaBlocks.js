'use strict';

/**
 * Staff Agent Fase 2 — bloquear / liberar dia na agenda de reservas.
 *
 * Reusa a tabela restaurant_reservation_blocks (mesma de /api/restaurant-reservation-blocks),
 * então o bloqueio criado aqui aparece no painel e bloqueia a página /reservar.
 *
 * Fase 2: um dia inteiro por vez, casa inteira (area_id NULL). Sem recorrência.
 */

const { queryWithRlsContext } = require('../../tenancy/scopedQuery');
const {
  resolveOrganizationIdForEstablishment,
} = require('../../tenancy/resolveOrganizationId');
const { todayIsoSp } = require('./dateUtils');

const DEFAULT_REASON = 'Bloqueio manual (Staff Agent)';

/** Realtime é opcional: nunca deve derrubar a aplicação do bloqueio. */
function emitBlockChange(params) {
  try {
    require('../../utils/agendaRealtime').emitReservationBlockChanged(params);
  } catch (e) {
    console.warn('[staffAgent] agenda realtime indisponível:', e.message);
  }
}

function addDaysIso(iso, days) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

const WEEKDAYS = [
  ['domingo'],
  ['segunda', 'segunda-feira'],
  ['terca', 'terça', 'terca-feira', 'terça-feira'],
  ['quarta', 'quarta-feira'],
  ['quinta', 'quinta-feira'],
  ['sexta', 'sexta-feira'],
  ['sabado', 'sábado'],
];

function normalize(text) {
  return String(text || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/** Aceita YYYY-MM-DD, DD/MM, DD/MM/YYYY, hoje, amanhã, dia da semana. */
function parseFlexibleDate(input) {
  const raw = String(input || '').trim();
  if (!raw) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

  const today = todayIsoSp();
  const n = normalize(raw);

  if (n === 'hoje') return today;
  if (n === 'amanha') return addDaysIso(today, 1);
  if (n === 'depois de amanha' || n === 'depois-de-amanha') return addDaysIso(today, 2);

  const br = raw.match(/^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?$/);
  if (br) {
    const day = Number(br[1]);
    const month = Number(br[2]);
    let year = br[3] ? Number(br[3]) : Number(today.slice(0, 4));
    if (year < 100) year += 2000;
    if (day < 1 || day > 31 || month < 1 || month > 12) return null;
    const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    // "15/09" sem ano e já passou → assume próximo ano.
    if (!br[3] && iso < today) {
      return `${year + 1}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
    return iso;
  }

  const weekdayIndex = WEEKDAYS.findIndex((names) => names.includes(n));
  if (weekdayIndex >= 0) {
    const [y, m, d] = today.split('-').map(Number);
    const current = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    const delta = (weekdayIndex - current + 7) % 7 || 7;
    return addDaysIso(today, delta);
  }

  return null;
}

function formatBr(iso) {
  const [y, m, d] = String(iso).split('-');
  return `${d}/${m}/${y}`;
}

function dayBounds(iso) {
  return { start: `${iso} 00:00:00`, end: `${iso} 23:59:59` };
}

async function rlsCtxFor(pool, establishmentId) {
  const organizationId = await resolveOrganizationIdForEstablishment(pool, establishmentId);
  return organizationId ? { organizationId } : { isAdmin: true };
}

async function findBlocksOnDate(pool, establishmentId, dateIso) {
  const { rows } = await pool.query(
    `SELECT id, reason, area_id, start_datetime, end_datetime
       FROM restaurant_reservation_blocks
      WHERE establishment_id = $1
        AND start_datetime::date <= $2
        AND end_datetime::date >= $2
      ORDER BY start_datetime ASC`,
    [establishmentId, dateIso]
  );
  return rows;
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
          `SELECT id, reason, area_id, start_datetime, end_datetime
             FROM restaurant_reservation_blocks
            WHERE establishment_id = $1
              AND end_datetime::date >= $2
            ORDER BY start_datetime ASC
            LIMIT 20`,
          [establishmentId, todayIsoSp()]
        )
      ).rows;

  const blocks = rows.map((r) => ({
    id: r.id,
    date: String(r.start_datetime).slice(0, 10),
    reason: r.reason,
    area_id: r.area_id,
  }));

  const lines = blocks.map((b) => `#${b.id} ${formatBr(b.date)} — ${b.reason}`);

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
  const existing = await findBlocksOnDate(pool, establishmentId, dateIso);

  if (existing.length) {
    return {
      ok: false,
      message: `${formatBr(dateIso)} já está bloqueado (#${existing[0].id} — ${existing[0].reason}).`,
    };
  }

  const { rows: reservationRows } = await pool.query(
    `SELECT COUNT(*)::int AS total
       FROM restaurant_reservations
      WHERE establishment_id = $1
        AND reservation_date = $2
        AND COALESCE(UPPER(status::text), '') NOT IN ('CANCELADA', 'CANCELLED', 'CANCELED')`,
    [establishmentId, dateIso]
  );
  const affectedReservations = reservationRows[0]?.total || 0;

  const preview = {
    date: dateIso,
    reason,
    area_id: null,
    affected_reservations: affectedReservations,
  };

  if (mode === 'preview') {
    const warn = affectedReservations
      ? ` Atenção: já existem ${affectedReservations} reserva(s) nesse dia — elas não são canceladas automaticamente.`
      : '';
    return {
      ok: true,
      needs_confirmation: true,
      preview,
      message: `Vou bloquear ${formatBr(dateIso)} para novas reservas (motivo: ${reason}).${warn} Confirmar?`,
    };
  }

  const { start, end } = dayBounds(dateIso);
  const ctx = await rlsCtxFor(pool, establishmentId);
  const organizationId = ctx.organizationId || null;

  const { rows } = await queryWithRlsContext(
    pool,
    ctx,
    `INSERT INTO restaurant_reservation_blocks
       (establishment_id, area_id, start_datetime, end_datetime, reason,
        recurrence_type, recurrence_weekday, max_people_capacity, created_by, organization_id)
     VALUES ($1, NULL, $2, $3, $4, 'none', NULL, NULL, $5, $6)
     RETURNING id`,
    [establishmentId, start, end, reason, userId || null, organizationId]
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
    message: `${formatBr(dateIso)} bloqueado (#${rows[0]?.id}).`,
  };
}

async function liberarDiaAgenda(pool, { establishmentId, args, mode }) {
  const dateIso = parseFlexibleDate(args.date);
  if (!dateIso) {
    return { ok: false, message: 'Preciso da data. Ex.: "libera o dia 15/09".' };
  }

  const existing = await findBlocksOnDate(pool, establishmentId, dateIso);
  if (!existing.length) {
    return { ok: false, message: `${formatBr(dateIso)} não está bloqueado.` };
  }

  const preview = {
    date: dateIso,
    block_ids: existing.map((b) => b.id),
    reasons: existing.map((b) => b.reason),
  };

  if (mode === 'preview') {
    const detail = existing.map((b) => `#${b.id} ${b.reason}`).join(', ');
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
    message: `${formatBr(dateIso)} liberado para reservas.`,
  };
}

module.exports = {
  parseFlexibleDate,
  formatBr,
  listarBloqueiosAgenda,
  bloquearDiaAgenda,
  liberarDiaAgenda,
};
