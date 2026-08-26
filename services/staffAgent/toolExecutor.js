'use strict';

/**
 * Execução das tools Fase 1 (SQL direto, escopo por establishment_id).
 * Write tools: mode=preview | apply.
 */

const establishmentRules = require('../establishmentRules');

function todayIsoSp() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function parseDateOrToday(date) {
  const raw = String(date || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  return todayIsoSp();
}

async function resolveBarId(pool, establishmentId) {
  try {
    const rules = await establishmentRules.getEstablishmentRules(pool, establishmentId);
    const barId = establishmentRules.getCardapioBarId(rules, establishmentId);
    if (Number.isFinite(barId) && barId > 0) return barId;
  } catch (_) {
    /* fallback abaixo */
  }
  return Number(establishmentId);
}

async function briefingTurno(pool, { establishmentId, args }) {
  const date = parseDateOrToday(args.date);
  const reservations = await pool.query(
    `SELECT status, COUNT(*)::int AS n, COALESCE(SUM(number_of_people),0)::int AS people
       FROM restaurant_reservations
      WHERE establishment_id = $1
        AND reservation_date = $2
        AND COALESCE(UPPER(status::text), '') NOT IN ('CANCELADA', 'CANCELLED', 'CANCELED')
      GROUP BY status`,
    [establishmentId, date]
  );
  const waitlist = await pool.query(
    `SELECT status, COUNT(*)::int AS n
       FROM waitlist
      WHERE establishment_id = $1
        AND preferred_date = $2
      GROUP BY status`,
    [establishmentId, date]
  );
  const blocks = await pool.query(
    `SELECT COUNT(*)::int AS n
       FROM restaurant_reservation_blocks
      WHERE establishment_id = $1
        AND start_datetime::date <= $2::date
        AND end_datetime::date >= $2::date`,
    [establishmentId, date]
  );

  const byStatus = Object.fromEntries(reservations.rows.map((r) => [r.status, r]));
  const totalReservations = reservations.rows.reduce((s, r) => s + r.n, 0);
  const totalPeople = reservations.rows.reduce((s, r) => s + r.people, 0);
  const waitByStatus = Object.fromEntries(waitlist.rows.map((r) => [r.status, r.n]));

  return {
    ok: true,
    date,
    summary: {
      reservations_total: totalReservations,
      people_total: totalPeople,
      by_status: byStatus,
      waitlist: waitByStatus,
      active_blocks: blocks.rows[0]?.n || 0,
    },
    message: `Dia ${date}: ${totalReservations} reservas (${totalPeople} pessoas), espera ${waitByStatus.AGUARDANDO || 0}, bloqueios ${blocks.rows[0]?.n || 0}.`,
  };
}

async function buscarReservas(pool, { establishmentId, args }) {
  const date = parseDateOrToday(args.date);
  const limit = Math.min(Math.max(Number(args.limit) || 20, 1), 50);
  const params = [establishmentId, date];
  const clauses = ['rr.establishment_id = $1', 'rr.reservation_date = $2'];

  if (args.client_name) {
    params.push(`%${String(args.client_name).trim()}%`);
    clauses.push(`rr.client_name ILIKE $${params.length}`);
  }
  if (args.client_phone) {
    params.push(`%${String(args.client_phone).replace(/\D/g, '')}%`);
    clauses.push(`regexp_replace(COALESCE(rr.client_phone,''), '\\D', '', 'g') LIKE $${params.length}`);
  }
  if (args.status) {
    params.push(String(args.status).toUpperCase());
    clauses.push(`UPPER(rr.status::text) = $${params.length}`);
  }
  if (args.area_name) {
    params.push(`%${String(args.area_name).trim()}%`);
    clauses.push(
      `(COALESCE(NULLIF(TRIM(rr.area_display_name), ''), ra.name) ILIKE $${params.length})`
    );
  }
  if (args.without_checkin) {
    clauses.push(
      `UPPER(COALESCE(rr.status::text, '')) IN ('CONFIRMADA','CONFIRMED','NOVA')
       AND UPPER(COALESCE(rr.status::text, '')) NOT IN ('CHECKED_IN','CHECKED-IN','SEATED','COMPLETED')`
    );
  }

  params.push(limit);
  const { rows } = await pool.query(
    `SELECT rr.id, rr.client_name, rr.client_phone, rr.number_of_people, rr.status,
            rr.reservation_time, rr.table_number,
            COALESCE(NULLIF(TRIM(rr.area_display_name), ''), ra.name) AS area_name
       FROM restaurant_reservations rr
       LEFT JOIN restaurant_areas ra ON ra.id = rr.area_id
      WHERE ${clauses.join(' AND ')}
      ORDER BY rr.reservation_time NULLS LAST, rr.id
      LIMIT $${params.length}`,
    params
  );

  return {
    ok: true,
    date,
    count: rows.length,
    reservations: rows,
    message: rows.length
      ? `Encontrei ${rows.length} reserva(s) em ${date}.`
      : `Nenhuma reserva encontrada em ${date} com esses filtros.`,
  };
}

async function checarCapacidade(pool, { establishmentId, args }) {
  const date = parseDateOrToday(args.date);
  const params = [establishmentId, date];
  let areaFilter = '';
  if (args.area_id) {
    params.push(Number(args.area_id));
    areaFilter = ` AND area_id = $${params.length}`;
  }
  const { rows } = await pool.query(
    `SELECT COALESCE(SUM(number_of_people),0)::int AS people, COUNT(*)::int AS n
       FROM restaurant_reservations
      WHERE establishment_id = $1
        AND reservation_date = $2
        AND COALESCE(UPPER(status::text), '') NOT IN ('CANCELADA','CANCELLED','CANCELED','NO_SHOW')
        ${areaFilter}`,
    params
  );
  const people = rows[0]?.people || 0;
  const party = Number(args.party_size) || null;
  return {
    ok: true,
    date,
    reserved_people: people,
    reservation_count: rows[0]?.n || 0,
    party_size: party,
    message: party
      ? `Há ${people} pessoas reservadas em ${date}. Pedido de ${party} — confirme capacidade da área no painel.`
      : `Há ${people} pessoas reservadas em ${date} (${rows[0]?.n || 0} reservas).`,
  };
}

async function listarEspera(pool, { establishmentId, args }) {
  const date = parseDateOrToday(args.date);
  const params = [establishmentId, date];
  let statusFilter = '';
  if (args.status) {
    params.push(String(args.status).toUpperCase());
    statusFilter = ` AND UPPER(status::text) = $${params.length}`;
  }
  const { rows } = await pool.query(
    `SELECT id, client_name, client_phone, number_of_people, status, preferred_time, created_at
       FROM waitlist
      WHERE establishment_id = $1 AND preferred_date = $2 ${statusFilter}
      ORDER BY created_at ASC
      LIMIT 40`,
    params
  );
  return {
    ok: true,
    date,
    count: rows.length,
    entries: rows,
    message: rows.length
      ? `${rows.length} na lista de espera em ${date}.`
      : `Lista de espera vazia em ${date}.`,
  };
}

async function chamarEspera(pool, { establishmentId, args, mode }) {
  const id = Number(args.waitlist_id);
  const { rows } = await pool.query(
    `SELECT id, client_name, number_of_people, status, establishment_id
       FROM waitlist WHERE id = $1 LIMIT 1`,
    [id]
  );
  const entry = rows[0];
  if (!entry || Number(entry.establishment_id) !== Number(establishmentId)) {
    return { ok: false, message: 'Registro de espera não encontrado nesta casa.' };
  }
  const preview = {
    waitlist_id: entry.id,
    client_name: entry.client_name,
    number_of_people: entry.number_of_people,
    current_status: entry.status,
    next_status: 'CHAMADO',
    note: args.note || null,
  };
  if (mode === 'preview') {
    return {
      ok: true,
      needs_confirmation: true,
      preview,
      message: `Vou chamar ${entry.client_name} (${entry.number_of_people} pax) na espera #${entry.id}. Confirmar?`,
    };
  }
  await pool.query(
    `UPDATE waitlist SET status = 'CHAMADO', updated_at = NOW() WHERE id = $1 AND establishment_id = $2`,
    [id, establishmentId]
  );
  return { ok: true, applied: true, preview, message: `${entry.client_name} marcado(a) como chamado.` };
}

async function listarItensCardapio(pool, { establishmentId, args }) {
  const barId = await resolveBarId(pool, establishmentId);
  const q = `%${String(args.query || '').trim()}%`;
  const includePaused = Boolean(args.include_paused);
  const { rows } = await pool.query(
    `SELECT id, name, price, visible, categoryid
       FROM menu_items
      WHERE barid = $1
        AND name ILIKE $2
        AND deleted_at IS NULL
        ${includePaused ? '' : 'AND COALESCE(visible, TRUE) = TRUE'}
      ORDER BY name
      LIMIT 20`,
    [barId, q]
  );
  return {
    ok: true,
    bar_id: barId,
    count: rows.length,
    items: rows,
    message: rows.length
      ? `Encontrei ${rows.length} item(ns).`
      : 'Nenhum item encontrado com esse nome.',
  };
}

async function setItemVisibility(pool, { establishmentId, args, mode, visible }) {
  const itemId = Number(args.item_id);
  const barId = await resolveBarId(pool, establishmentId);
  const { rows } = await pool.query(
    `SELECT id, name, visible, barid FROM menu_items WHERE id = $1 AND deleted_at IS NULL LIMIT 1`,
    [itemId]
  );
  const item = rows[0];
  if (!item || Number(item.barid) !== Number(barId)) {
    return { ok: false, message: 'Item não encontrado no cardápio desta casa.' };
  }
  const preview = {
    item_id: item.id,
    name: item.name,
    current_visible: item.visible,
    next_visible: visible,
    mode: args.mode || 'permanent',
  };
  if (mode === 'preview') {
    return {
      ok: true,
      needs_confirmation: true,
      preview,
      message: visible
        ? `Vou reativar "${item.name}" no cardápio. Confirmar?`
        : `Vou pausar "${item.name}" no cardápio. Confirmar?`,
    };
  }
  await pool.query(`UPDATE menu_items SET visible = $1 WHERE id = $2 AND barid = $3`, [
    visible,
    itemId,
    barId,
  ]);
  return {
    ok: true,
    applied: true,
    preview,
    message: visible ? `"${item.name}" reativado.` : `"${item.name}" pausado.`,
  };
}

async function resumirConversaWhatsapp(pool, { establishmentId, args }) {
  const waId = String(args.wa_id || '').trim();
  const limit = Math.min(Math.max(Number(args.max_messages) || 20, 5), 40);
  const conv = await pool.query(
    `SELECT id, wa_id, customer_name, establishment_id, human_takeover_until
       FROM whatsapp_conversations
      WHERE wa_id = $1
      LIMIT 1`,
    [waId]
  );
  const c = conv.rows[0];
  if (!c) return { ok: false, message: 'Conversa não encontrada.' };
  if (c.establishment_id && Number(c.establishment_id) !== Number(establishmentId)) {
    return { ok: false, message: 'Conversa de outra casa.' };
  }
  const msgs = await pool.query(
    `SELECT direction, body, created_at
       FROM whatsapp_messages
      WHERE conversation_id = $1
      ORDER BY created_at DESC
      LIMIT $2`,
    [c.id, limit]
  );
  const chronological = [...msgs.rows].reverse();
  const lines = chronological.map(
    (m) => `${m.direction === 'inbound' || m.direction === 'in' ? 'Cliente' : 'Casa'}: ${String(m.body || '').slice(0, 200)}`
  );
  return {
    ok: true,
    wa_id: waId,
    customer_name: c.customer_name,
    transcript_preview: lines.slice(-12),
    message: lines.length
      ? `Resumo bruto (${lines.length} msgs). Cliente: ${c.customer_name || waId}. Últimas falas:\n${lines.slice(-6).join('\n')}`
      : 'Conversa sem mensagens.',
  };
}

async function sugerirRespostaWhatsapp(pool, ctx) {
  const base = await resumirConversaWhatsapp(pool, ctx);
  if (!base.ok) return base;
  const hint = String(ctx.args.intent_hint || '').trim();
  return {
    ok: true,
    wa_id: ctx.args.wa_id,
    draft:
      hint ||
      'Olá! Obrigado pelo contato. Já estou verificando aqui com a equipe e já te retorno com a confirmação.',
    transcript_preview: base.transcript_preview,
    message:
      'Rascunho pronto (não enviado). Cole no compose do WhatsApp, edite e envie manualmente.',
  };
}

/**
 * @param {'preview'|'apply'|'read'} mode
 */
async function executeTool(pool, { toolName, args, establishmentId, mode }) {
  const a = args && typeof args === 'object' ? args : {};
  switch (toolName) {
    case 'briefing_turno':
      return briefingTurno(pool, { establishmentId, args: a });
    case 'buscar_reservas':
      return buscarReservas(pool, { establishmentId, args: a });
    case 'checar_capacidade':
      return checarCapacidade(pool, { establishmentId, args: a });
    case 'listar_espera':
      return listarEspera(pool, { establishmentId, args: a });
    case 'chamar_espera':
      return chamarEspera(pool, { establishmentId, args: a, mode: mode === 'apply' ? 'apply' : 'preview' });
    case 'listar_itens_cardapio':
      return listarItensCardapio(pool, { establishmentId, args: a });
    case 'pausar_item_cardapio':
      return setItemVisibility(pool, {
        establishmentId,
        args: a,
        mode: mode === 'apply' ? 'apply' : 'preview',
        visible: false,
      });
    case 'reativar_item_cardapio':
      return setItemVisibility(pool, {
        establishmentId,
        args: a,
        mode: mode === 'apply' ? 'apply' : 'preview',
        visible: true,
      });
    case 'resumir_conversa_whatsapp':
      return resumirConversaWhatsapp(pool, { establishmentId, args: a });
    case 'sugerir_resposta_whatsapp':
      return sugerirRespostaWhatsapp(pool, { establishmentId, args: a });
    default: {
      const err = new Error(`Tool não implementada: ${toolName}`);
      err.code = 'unknown_tool';
      throw err;
    }
  }
}

module.exports = {
  executeTool,
  todayIsoSp,
  parseDateOrToday,
};
