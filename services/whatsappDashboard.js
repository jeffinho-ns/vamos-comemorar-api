'use strict';

const TZ = 'America/Sao_Paulo';

const ORIGEM_LABEL = {
  whatsapp: 'WhatsApp',
  instagram: 'Instagram',
  cliente: 'Site / portal',
  site: 'Site / portal',
  google: 'Google',
  pessoal: 'Equipe',
  admin: 'Equipe',
  camarote: 'Camarote',
  lista_espera: 'Lista de espera',
  listaespera: 'Lista de espera',
};

const INTENT_LABEL = {
  PROCESS_RESERVATION: 'Reserva',
  OPERATIONAL_INFO: 'Funcionamento',
  GUEST_LIST_LINK: 'Lista de convidados',
  FAQ: 'Dúvida',
  greeting: 'Saudação',
  GREETING: 'Saudação',
  MENU: 'Cardápio',
  EVENT: 'Evento',
  BIRTHDAY: 'Aniversário',
};

function soNumero(valor, fallback = 0) {
  const n = Number(valor);
  return Number.isFinite(n) ? n : fallback;
}

function dataIso(valor) {
  const texto = String(valor || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(texto) ? texto : '';
}

function hojeSp() {
  return new Date().toLocaleDateString('en-CA', { timeZone: TZ });
}

function acrescentarDias(iso, dias) {
  const partes = String(iso).split('-').map(Number);
  const data = new Date(Date.UTC(partes[0], partes[1] - 1, partes[2], 12, 0, 0));
  data.setUTCDate(data.getUTCDate() + dias);
  return data.toISOString().slice(0, 10);
}

function periodoPadrao(hoje) {
  const fim = dataIso(hoje) || hojeSp();
  const inicio = acrescentarDias(fim, -29);
  const anteriorFim = acrescentarDias(inicio, -1);
  const anteriorInicio = acrescentarDias(anteriorFim, -29);
  return { inicio, fim, anteriorInicio, anteriorFim };
}

function rotuloOrigem(origin) {
  const chave = String(origin || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
  if (!chave) return 'Sem origem';
  return ORIGEM_LABEL[chave] || String(origin);
}

function rotuloIntent(intent) {
  const bruto = String(intent || '').trim();
  if (!bruto || bruto === 'sem_tema') return 'Outros assuntos';
  if (INTENT_LABEL[bruto]) return INTENT_LABEL[bruto];
  return bruto
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/^\w/, (c) => c.toUpperCase());
}

function pct(parte, total, casas = 1) {
  if (!total) return 0;
  const fator = 10 ** casas;
  return Math.round((parte / total) * 100 * fator) / fator;
}

function variacaoPct(atual, anterior) {
  if (!anterior) return null;
  return Math.round(((atual - anterior) / anterior) * 1000) / 10;
}

function montarDashboard(bruto) {
  const fonte = bruto || {};
  const conversas = fonte.conversas || {};
  const reservas = fonte.reservas || {};
  const anterior = fonte.reservasAnterior || {};
  const conversasAnterior = fonte.conversasAnterior || {};
  const contacts = fonte.contacts || {};
  const ia = fonte.ia || {};
  const totalOrigem = (fonte.origens || []).reduce((acc, item) => acc + soNumero(item.reservas), 0);
  const origens = (fonte.origens || [])
    .map((item) => ({
      origem: String(item.origin || ''),
      label: rotuloOrigem(item.origin),
      reservas: soNumero(item.reservas),
      pessoas: soNumero(item.pessoas),
      pct: pct(soNumero(item.reservas), totalOrigem || soNumero(reservas.total)),
    }))
    .sort((a, b) => b.reservas - a.reservas);
  const tentaram = Math.max(soNumero(fonte.tentaramReservar), soNumero(reservas.whatsapp));
  const funil = [
    { id: 'conversas', label: 'Conversas iniciadas', valor: soNumero(conversas.total) },
    { id: 'tentaram', label: 'Tentaram fazer reserva', valor: tentaram },
    { id: 'reservas', label: 'Conseguiram finalizar reserva', valor: soNumero(reservas.whatsapp) },
    { id: 'confirmadas', label: 'Reservas confirmadas', valor: soNumero(reservas.confirmadas) },
    { id: 'compareceram', label: 'Compareceram', valor: soNumero(reservas.compareceram) },
  ];
  const conversasIa = soNumero(ia.conversas);
  const reservasIa = soNumero(ia.reservas);
  return {
    conversations_total: soNumero(conversas.total),
    conversations_resolved: soNumero(conversas.resolvidas),
    contacts_total: soNumero(contacts.total),
    contacts_opt_in: soNumero(contacts.optIn),
    reservations_whatsapp: soNumero(reservas.whatsapp),
    periodo: fonte.periodo || null,
    kpis: {
      reservas: soNumero(reservas.total),
      pessoas: soNumero(reservas.pessoas),
      pessoasPorReserva: reservas.total ? Math.round((soNumero(reservas.pessoas) / soNumero(reservas.total)) * 10) / 10 : 0,
      tempoConversaoHoras: fonte.tempoConversaoHoras == null ? null : Math.round(soNumero(fonte.tempoConversaoHoras) * 10) / 10,
      variacaoReservasPct: variacaoPct(soNumero(reservas.total), soNumero(anterior.total)),
      variacaoConversasPct: variacaoPct(soNumero(conversas.total), soNumero(conversasAnterior.total)),
      conversas: soNumero(conversas.total),
    },
    funil,
    ia: {
      reservas: reservasIa,
      conversas: conversasIa,
      taxaPct: pct(reservasIa, conversasIa),
      capturadas: reservasIa,
      vendas: reservasIa,
      handoff: soNumero(conversas.passaramHumano),
    },
    origens,
    temas: (fonte.temas || []).map((item) => ({
      tema: rotuloIntent(item.intent),
      n: soNumero(item.n),
    })),
    heatmap: fonte.heatmap || [],
    serie: fonte.serie || [],
    statusReservas: {
      confirmadas: soNumero(reservas.confirmadas),
      compareceram: soNumero(reservas.compareceram),
      canceladas: soNumero(reservas.canceladas),
      noshow: soNumero(reservas.noshow),
    },
    atendimento: {
      resolvidas: soNumero(conversas.resolvidas),
      handoffAtivo: soNumero(conversas.handoffAtivo),
      passaramHumano: soNumero(conversas.passaramHumano),
    },
  };
}

function whereDatas(alias, start, end, params) {
  const partes = [];
  if (start) {
    params.push(start);
    partes.push(`${alias} >= $${params.length}::date`);
  }
  if (end) {
    params.push(end);
    partes.push(`${alias} < ($${params.length}::date + interval '1 day')`);
  }
  return partes;
}

function whereEstab(coluna, establishmentId, params) {
  if (!establishmentId) return [];
  params.push(establishmentId);
  return [`${coluna} = $${params.length}`];
}

function checkinExpr() {
  return `lower(COALESCE(checked_in::text, '0')) IN ('1', 't', 'true')`;
}

function statusConfirmada() {
  return `lower(replace(COALESCE(status, ''), '_', '-')) IN ('confirmed', 'confirmada', 'checked-in', 'checked_in', 'seated', 'nova')`;
}

async function queryUm(pool, sql, params, fallback) {
  try {
    const r = await pool.query(sql, params);
    return r.rows[0] || fallback;
  } catch (err) {
    console.warn('[whatsapp-dashboard] query falhou', { message: err && err.message ? err.message : String(err) });
    return fallback;
  }
}

async function queryLista(pool, sql, params) {
  try {
    const r = await pool.query(sql, params);
    return r.rows;
  } catch (err) {
    console.warn('[whatsapp-dashboard] lista falhou', { message: err && err.message ? err.message : String(err) });
    return [];
  }
}

function filtrosTabela(start, end, establishmentId, alias = '') {
  const col = alias ? `${alias}.` : '';
  const params = [];
  const partes = [
    ...whereEstab(`${col}establishment_id`, establishmentId, params),
    ...whereDatas(`${col}created_at`, start, end, params),
  ];
  return { params, where: partes.length ? `WHERE ${partes.join(' AND ')}` : '' };
}

async function carregarDashboard(pool, options = {}) {
  const pedido = periodoPadrao(hojeSp());
  const inicio = dataIso(options.startDate) || pedido.inicio;
  const fim = dataIso(options.endDate) || pedido.fim;
  const anteriorFim = acrescentarDias(inicio, -1);
  const dias = Math.max(1, Math.round((Date.parse(`${fim}T12:00:00Z`) - Date.parse(`${inicio}T12:00:00Z`)) / 86400000) + 1);
  const anteriorInicio = acrescentarDias(anteriorFim, -(dias - 1));
  const establishmentId = Number(options.establishmentId);
  const estab = Number.isFinite(establishmentId) && establishmentId > 0 ? establishmentId : null;

  const conv = filtrosTabela(inicio, fim, estab);
  const convWc = filtrosTabela(inicio, fim, estab, 'wc');
  const convAnt = filtrosTabela(anteriorInicio, anteriorFim, estab);
  const res = filtrosTabela(inicio, fim, estab);
  const resRr = filtrosTabela(inicio, fim, estab, 'rr');
  const resAnt = filtrosTabela(anteriorInicio, anteriorFim, estab);

  const contactParams = [];
  const contactWhere = [
    ...whereEstab('last_establishment_id', estab, contactParams),
    ...whereDatas('last_seen_at', inicio, fim, contactParams),
  ];
  const contactSql = contactWhere.length ? `WHERE ${contactWhere.join(' AND ')}` : '';

  const { carregarOperacao } = require('./whatsappOperacao');
  const { carregarZigPeriodo, aplicarPessoas } = require('./whatsappZig');
  const operacaoP = carregarOperacao(pool, { inicio, fim, establishmentId: estab });
  const zigP = carregarZigPeriodo(pool, { inicio, fim, establishmentId: estab });

  const [
    conversas,
    conversasAnterior,
    reservas,
    reservasAnterior,
    origens,
    tentaramRow,
    temas,
    heatmap,
    serieConversas,
    serieReservas,
    tempoRow,
    iaRow,
    contacts,
  ] = await Promise.all([
    queryUm(
      pool,
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE status = 'resolved')::int AS resolvidas,
              COUNT(*) FILTER (WHERE human_takeover_until IS NOT NULL AND human_takeover_until > NOW())::int AS handoff_ativo,
              COUNT(*) FILTER (WHERE human_takeover_until IS NOT NULL)::int AS passaram_humano
         FROM whatsapp_conversations ${conv.where}`,
      conv.params,
      { total: 0, resolvidas: 0, handoff_ativo: 0, passaram_humano: 0 },
    ),
    queryUm(
      pool,
      `SELECT COUNT(*)::int AS total FROM whatsapp_conversations ${convAnt.where}`,
      convAnt.params,
      { total: 0 },
    ),
    queryUm(
      pool,
      `SELECT COUNT(*)::int AS total,
              COALESCE(SUM(number_of_people), 0)::int AS pessoas,
              COUNT(*) FILTER (WHERE lower(COALESCE(origin, '')) LIKE '%whatsapp%')::int AS whatsapp,
              COUNT(*) FILTER (WHERE ${statusConfirmada()})::int AS confirmadas,
              COUNT(*) FILTER (WHERE ${checkinExpr()})::int AS compareceram,
              COALESCE(SUM(number_of_people) FILTER (WHERE ${checkinExpr()}), 0)::int AS pessoas_compareceram,
              COALESCE(SUM(number_of_people) FILTER (WHERE ${checkinExpr()} AND lower(COALESCE(origin, '')) LIKE '%whatsapp%'), 0)::int AS pessoas_compareceram_whatsapp,
              COUNT(*) FILTER (WHERE lower(replace(COALESCE(status, ''), '_', '-')) LIKE '%cancel%')::int AS canceladas,
              COUNT(*) FILTER (WHERE lower(replace(COALESCE(status, ''), '_', '-')) LIKE '%no%show%')::int AS noshow
         FROM restaurant_reservations ${res.where}`,
      res.params,
      { total: 0, pessoas: 0, whatsapp: 0, confirmadas: 0, compareceram: 0, pessoas_compareceram: 0, pessoas_compareceram_whatsapp: 0, canceladas: 0, noshow: 0 },
    ),
    queryUm(
      pool,
      `SELECT COUNT(*)::int AS total,
              COALESCE(SUM(number_of_people), 0)::int AS pessoas,
              COUNT(*) FILTER (WHERE lower(COALESCE(origin, '')) LIKE '%whatsapp%')::int AS whatsapp
         FROM restaurant_reservations ${resAnt.where}`,
      resAnt.params,
      { total: 0, pessoas: 0, whatsapp: 0 },
    ),
    queryLista(
      pool,
      `SELECT COALESCE(origin, '') AS origin,
              COUNT(*)::int AS reservas,
              COALESCE(SUM(number_of_people), 0)::int AS pessoas
         FROM restaurant_reservations ${res.where}
        GROUP BY 1
        ORDER BY reservas DESC`,
      res.params,
    ),
    queryUm(
      pool,
      `SELECT COUNT(*)::int AS n
         FROM agent_conversation_context acc
         JOIN whatsapp_conversations wc ON wc.id = acc.conversation_id
        ${convWc.where ? `${convWc.where} AND` : 'WHERE'}
          (
            COALESCE(acc.working_state->>'reservation_date', '') <> ''
            OR COALESCE(acc.working_state->>'quantidade_convidados', '') <> ''
            OR COALESCE(acc.working_state->>'client_name', '') <> ''
          )`,
      convWc.params,
      { n: 0 },
    ),
    queryLista(
      pool,
      `SELECT COALESCE(NULLIF(m.intent, ''), 'sem_tema') AS intent, COUNT(*)::int AS n
         FROM whatsapp_messages m
         JOIN whatsapp_conversations wc ON wc.id = m.conversation_id
        ${convWc.where ? `${convWc.where} AND` : 'WHERE'}
          m.direction = 'inbound'
          AND COALESCE(m.intent, '') NOT LIKE 'CAMPAIGN%'
        GROUP BY 1
        ORDER BY n DESC
        LIMIT 8`,
      convWc.params,
    ),
    queryLista(
      pool,
      `SELECT EXTRACT(DOW FROM created_at AT TIME ZONE '${TZ}')::int AS dow,
              EXTRACT(HOUR FROM created_at AT TIME ZONE '${TZ}')::int AS hora,
              COUNT(*)::int AS n
         FROM restaurant_reservations ${res.where}
        GROUP BY 1, 2`,
      res.params,
    ),
    queryLista(
      pool,
      `SELECT (created_at AT TIME ZONE '${TZ}')::date::text AS date, COUNT(*)::int AS n
         FROM whatsapp_conversations ${conv.where}
        GROUP BY 1
        ORDER BY 1`,
      conv.params,
    ),
    queryLista(
      pool,
      `SELECT (created_at AT TIME ZONE '${TZ}')::date::text AS date, COUNT(*)::int AS n
         FROM restaurant_reservations ${res.where}
        GROUP BY 1
        ORDER BY 1`,
      res.params,
    ),
    queryUm(
      pool,
      `SELECT AVG(EXTRACT(EPOCH FROM (rr.created_at - first_in.first_at)) / 3600.0) AS horas
         FROM restaurant_reservations rr
         JOIN whatsapp_conversations wc
           ON right(regexp_replace(COALESCE(rr.client_phone, ''), '\\D', '', 'g'), 8)
            = right(regexp_replace(COALESCE(wc.wa_id, ''), '\\D', '', 'g'), 8)
         JOIN LATERAL (
           SELECT MIN(m.created_at) AS first_at
             FROM whatsapp_messages m
            WHERE m.conversation_id = wc.id AND m.direction = 'inbound'
         ) first_in ON first_in.first_at IS NOT NULL
        ${resRr.where ? `${resRr.where} AND` : 'WHERE'}
          lower(COALESCE(rr.origin, '')) LIKE '%whatsapp%'
          AND rr.created_at >= first_in.first_at`,
      resRr.params,
      { horas: null },
    ),
    queryUm(
      pool,
      `SELECT COUNT(*)::int AS reservas
         FROM restaurant_reservations rr
         JOIN whatsapp_conversations wc
           ON right(regexp_replace(COALESCE(rr.client_phone, ''), '\\D', '', 'g'), 8)
            = right(regexp_replace(COALESCE(wc.wa_id, ''), '\\D', '', 'g'), 8)
        ${resRr.where ? `${resRr.where} AND` : 'WHERE'}
          lower(COALESCE(rr.origin, '')) LIKE '%whatsapp%'
          AND (wc.human_takeover_until IS NULL OR wc.human_takeover_until < rr.created_at)`,
      resRr.params,
      { reservas: 0 },
    ),
    queryUm(
      pool,
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE marketing_opt_in = TRUE)::int AS opt_in
         FROM whatsapp_contacts ${contactSql}`,
      contactParams,
      { total: 0, opt_in: 0 },
    ),
  ]);

  const porDia = new Map();
  serieConversas.forEach((row) => {
    porDia.set(row.date, { date: row.date, conversas: soNumero(row.n), reservas: 0 });
  });
  serieReservas.forEach((row) => {
    const atual = porDia.get(row.date) || { date: row.date, conversas: 0, reservas: 0 };
    atual.reservas = soNumero(row.n);
    porDia.set(row.date, atual);
  });

  const [operacao, zigBase] = await Promise.all([operacaoP, zigP]);
  const zig = aplicarPessoas(
    zigBase,
    soNumero(reservas.pessoas_compareceram),
    soNumero(reservas.pessoas_compareceram_whatsapp),
  );
  const dashboard = montarDashboard({
    periodo: { inicio, fim, anteriorInicio, anteriorFim },
    conversas: {
      total: soNumero(conversas.total),
      resolvidas: soNumero(conversas.resolvidas),
      handoffAtivo: soNumero(conversas.handoff_ativo),
      passaramHumano: soNumero(conversas.passaram_humano),
    },
    conversasAnterior: { total: soNumero(conversasAnterior.total) },
    tentaramReservar: soNumero(tentaramRow.n),
    reservas: {
      total: soNumero(reservas.total),
      pessoas: soNumero(reservas.pessoas),
      whatsapp: soNumero(reservas.whatsapp),
      confirmadas: soNumero(reservas.confirmadas),
      compareceram: soNumero(reservas.compareceram),
      canceladas: soNumero(reservas.canceladas),
      noshow: soNumero(reservas.noshow),
    },
    reservasAnterior: {
      total: soNumero(reservasAnterior.total),
      pessoas: soNumero(reservasAnterior.pessoas),
      whatsapp: soNumero(reservasAnterior.whatsapp),
    },
    origens: origens.map((row) => ({
      origin: row.origin,
      reservas: row.reservas,
      pessoas: row.pessoas,
    })),
    ia: {
      reservas: soNumero(iaRow.reservas),
      conversas: soNumero(conversas.total),
    },
    temas,
    heatmap: heatmap.map((row) => ({
      dow: soNumero(row.dow),
      hora: soNumero(row.hora),
      n: soNumero(row.n),
    })),
    serie: [...porDia.values()].sort((a, b) => a.date.localeCompare(b.date)),
    tempoConversaoHoras: tempoRow.horas == null ? null : soNumero(tempoRow.horas),
    contacts: { total: soNumero(contacts.total), optIn: soNumero(contacts.opt_in) },
  });
  return { ...dashboard, operacao, zig };
}

module.exports = {
  TZ,
  soNumero,
  pct,
  rotuloOrigem,
  rotuloIntent,
  periodoPadrao,
  montarDashboard,
  carregarDashboard,
  filtrosTabela,
  queryUm,
  queryLista,
};
