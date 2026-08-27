'use strict';

/**
 * Execução das tools Fase 1 (SQL direto, escopo por establishment_id).
 * Write tools: mode=preview | apply.
 */

const establishmentRules = require('../establishmentRules');

const { todayIsoSp, parseDateOrToday } = require('./dateUtils');
const {
  listarBloqueiosAgenda,
  bloquearDiaAgenda,
  liberarDiaAgenda,
} = require('./agendaBlocks');

function coerceBool(value, defaultValue = false) {
  if (value === true || value === 1) return true;
  if (value === false || value === 0) return false;
  if (typeof value === 'string') {
    const s = value.trim().toLowerCase();
    if (s === 'true' || s === '1' || s === 'sim' || s === 'yes') return true;
    if (s === 'false' || s === '0' || s === 'nao' || s === 'não' || s === 'no') return false;
  }
  return defaultValue;
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
  let totalReservations = 0;
  let totalPeople = 0;
  let byStatus = {};
  let waitByStatus = {};
  let activeBlocks = 0;
  const warnings = [];

  try {
    const reservations = await pool.query(
      `SELECT status, COUNT(*)::int AS n, COALESCE(SUM(number_of_people),0)::int AS people
         FROM restaurant_reservations
        WHERE establishment_id = $1
          AND reservation_date = $2
          AND COALESCE(UPPER(status::text), '') NOT IN ('CANCELADA', 'CANCELLED', 'CANCELED')
        GROUP BY status`,
      [establishmentId, date]
    );
    byStatus = Object.fromEntries(reservations.rows.map((r) => [r.status, r]));
    totalReservations = reservations.rows.reduce((s, r) => s + r.n, 0);
    totalPeople = reservations.rows.reduce((s, r) => s + r.people, 0);
  } catch (e) {
    warnings.push('reservas');
    console.warn('[staffAgent] briefing reservas:', e.message);
  }

  try {
    const waitlist = await pool.query(
      `SELECT status, COUNT(*)::int AS n
         FROM waitlist
        WHERE establishment_id = $1
          AND preferred_date = $2
        GROUP BY status`,
      [establishmentId, date]
    );
    waitByStatus = Object.fromEntries(waitlist.rows.map((r) => [r.status, r.n]));
  } catch (e) {
    warnings.push('espera');
    console.warn('[staffAgent] briefing espera:', e.message);
  }

  try {
    const blocks = await pool.query(
      `SELECT COUNT(*)::int AS n
         FROM restaurant_reservation_blocks
        WHERE establishment_id = $1
          AND start_datetime::date <= $2::date
          AND end_datetime::date >= $2::date`,
      [establishmentId, date]
    );
    activeBlocks = blocks.rows[0]?.n || 0;
  } catch (e) {
    warnings.push('bloqueios');
    console.warn('[staffAgent] briefing bloqueios:', e.message);
  }

  const waitWaiting =
    waitByStatus.AGUARDANDO || waitByStatus.WAITING || waitByStatus.waiting || 0;

  return {
    ok: true,
    date,
    summary: {
      reservations_total: totalReservations,
      people_total: totalPeople,
      by_status: byStatus,
      waitlist: waitByStatus,
      active_blocks: activeBlocks,
    },
    message: `Dia ${date}: ${totalReservations} reservas (${totalPeople} pessoas), espera ${waitWaiting}, bloqueios ${activeBlocks}.${
      warnings.length ? ` (parcial: falhou ${warnings.join(', ')})` : ''
    }`,
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
  const includePaused =
    coerceBool(args.include_paused) || coerceBool(args.only_paused);
  const onlyPaused = coerceBool(args.only_paused);
  let visibilitySql = '';
  if (onlyPaused) {
    visibilitySql = 'AND COALESCE(visible, TRUE) = FALSE';
  } else if (!includePaused) {
    visibilitySql = 'AND COALESCE(visible, TRUE) = TRUE';
  }
  const { rows } = await pool.query(
    `SELECT id, name, price, visible, categoryid
       FROM menu_items
      WHERE barid = $1
        AND name ILIKE $2
        AND deleted_at IS NULL
        ${visibilitySql}
      ORDER BY name
      LIMIT 20`,
    [barId, q]
  );
  const items = rows.map((r) => ({
    id: r.id,
    name: r.name,
    price: r.price,
    visible: r.visible,
    category_id: r.categoryid,
  }));
  const lines = items.map((i) => `#${i.id} ${i.name}${i.visible === false ? ' (pausado)' : ''}`);
  return {
    ok: true,
    bar_id: barId,
    count: items.length,
    items,
    message: items.length
      ? `Encontrei ${items.length} item(ns):\n${lines.join('\n')}${
          items.length > 1 ? '\nDiga o #id (ou o nome exato) para pausar/reativar um por vez.' : ''
        }`
      : onlyPaused
        ? 'Nenhum item pausado com esse nome.'
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

  try {
    const { emitMenuItemVisibilityChanged } = require('../../utils/menuRealtime');
    emitMenuItemVisibilityChanged({
      barId,
      establishmentId,
      itemId: item.id,
      name: item.name,
      visible,
    });
  } catch (_) {
    /* realtime opcional */
  }

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
    `SELECT id, wa_id, contact_name, establishment_id, human_takeover_until
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
    (m) =>
      `${m.direction === 'inbound' || m.direction === 'in' ? 'Cliente' : 'Casa'}: ${String(m.body || '').slice(0, 200)}`
  );
  return {
    ok: true,
    wa_id: waId,
    customer_name: c.contact_name,
    transcript_preview: lines.slice(-12),
    message: lines.length
      ? `Resumo bruto (${lines.length} msgs). Cliente: ${c.contact_name || waId}. Últimas falas:\n${lines.slice(-6).join('\n')}`
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
async function executeTool(pool, { toolName, args, establishmentId, mode, userId }) {
  const a = args && typeof args === 'object' ? args : {};
  try {
    switch (toolName) {
      case 'briefing_turno':
        return await briefingTurno(pool, { establishmentId, args: a });
      case 'buscar_reservas':
        return await buscarReservas(pool, { establishmentId, args: a });
      case 'checar_capacidade':
        return await checarCapacidade(pool, { establishmentId, args: a });
      case 'listar_espera':
        return await listarEspera(pool, { establishmentId, args: a });
      case 'chamar_espera':
        return await chamarEspera(pool, {
          establishmentId,
          args: a,
          mode: mode === 'apply' ? 'apply' : 'preview',
        });
      case 'listar_itens_cardapio':
        return await listarItensCardapio(pool, { establishmentId, args: a });
      case 'pausar_item_cardapio':
        return await setItemVisibility(pool, {
          establishmentId,
          args: a,
          mode: mode === 'apply' ? 'apply' : 'preview',
          visible: false,
        });
      case 'reativar_item_cardapio':
        return await setItemVisibility(pool, {
          establishmentId,
          args: a,
          mode: mode === 'apply' ? 'apply' : 'preview',
          visible: true,
        });
      case 'listar_bloqueios_agenda':
        return await listarBloqueiosAgenda(pool, { establishmentId, args: a });
      case 'bloquear_dia_agenda':
        return await bloquearDiaAgenda(pool, {
          establishmentId,
          args: a,
          mode: mode === 'apply' ? 'apply' : 'preview',
          userId,
        });
      case 'liberar_dia_agenda':
        return await liberarDiaAgenda(pool, {
          establishmentId,
          args: a,
          mode: mode === 'apply' ? 'apply' : 'preview',
        });
      case 'resumir_conversa_whatsapp':
        return await resumirConversaWhatsapp(pool, { establishmentId, args: a });
      case 'sugerir_resposta_whatsapp':
        return await sugerirRespostaWhatsapp(pool, { establishmentId, args: a });
      default: {
        const err = new Error(`Tool não implementada: ${toolName}`);
        err.code = 'unknown_tool';
        throw err;
      }
    }
  } catch (e) {
    if (e.code === 'unknown_tool') throw e;
    console.error('[staffAgent] tool error', { toolName, message: e.message });
    return {
      ok: false,
      message: `Não consegui executar "${toolName}" agora. Tente de novo ou use o painel.`,
    };
  }
}

module.exports = {
  executeTool,
  todayIsoSp,
  parseDateOrToday,
};
