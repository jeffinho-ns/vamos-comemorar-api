'use strict';

const {
  TZ,
  soNumero,
  pct,
  rotuloIntent,
  filtrosTabela,
  queryUm,
  queryLista,
} = require('./whatsappDashboard');

const DIAS_PG = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const ORDEM_SEMANA = [1, 2, 3, 4, 5, 6, 0];

function serieSemana(linhas, campo) {
  const mapa = new Map();
  (linhas || []).forEach((row) => {
    mapa.set(Number(row.dow), soNumero(row[campo]));
  });
  return ORDEM_SEMANA.map((dow, indice) => ({
    dia: ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'][indice],
    dow,
    valor: mapa.get(dow) || 0,
  }));
}

function picoDe(heatmap) {
  let melhor = null;
  (heatmap || []).forEach((celula) => {
    if (!melhor || soNumero(celula.n) > soNumero(melhor.n)) melhor = celula;
  });
  if (!melhor) return null;
  return {
    dia: DIAS_PG[soNumero(melhor.dow)] || '',
    hora: soNumero(melhor.hora),
    n: soNumero(melhor.n),
  };
}

function montarOperacao(bruto) {
  const fonte = bruto || {};
  const conversas = fonte.conversas || {};
  const total = soNumero(conversas.total);
  const resolvidas = soNumero(conversas.resolvidas);
  const humano = soNumero(conversas.passaramHumano);
  const ia = soNumero(conversas.ia, Math.max(0, total - humano));
  const sessoes = (fonte.origemSessoes || []).map((item) => ({
    label: String(item.canal || 'Outros'),
    n: soNumero(item.n),
  }));
  const totalSessoes = sessoes.reduce((acc, item) => acc + item.n, 0);
  const origemSessoes = sessoes
    .map((item) => ({ ...item, pct: pct(item.n, totalSessoes) }))
    .sort((a, b) => b.n - a.n);
  const cancelamentosBruto = fonte.cancelamentos || [];
  const totalCancel = cancelamentosBruto.reduce((acc, item) => acc + soNumero(item.n), 0);
  return {
    taxaResolucaoPct: pct(resolvidas, total),
    taxaIaPct: pct(ia, total),
    resolvidas,
    total,
    primeiraRespostaSegundos: fonte.primeiraRespostaSegundos == null
      ? null
      : Math.round(soNumero(fonte.primeiraRespostaSegundos) * 10) / 10,
    primeiraRespostaMediana: fonte.primeiraRespostaMediana == null
      ? null
      : Math.round(soNumero(fonte.primeiraRespostaMediana) * 10) / 10,
    resolucaoAutomatica: { ia, humano },
    origemSessoes,
    heatmapConversas: fonte.heatmapConversas || [],
    pico: picoDe(fonte.heatmapConversas),
    resolvidosPorDia: serieSemana(fonte.resolvidosPorDia, 'n'),
    primeiraRespostaPorDia: serieSemana(fonte.primeiraRespostaPorDia, 'segundos'),
    tempoAtendimentoPorDia: serieSemana(fonte.tempoAtendimentoPorDia, 'minutos'),
    categorias: (fonte.categorias || []).map((item) => ({
      tema: rotuloIntent(item.intent || item.tema),
      n: soNumero(item.n),
    })),
    cancelamentos: cancelamentosBruto.map((item) => ({
      motivo: String(item.motivo || 'Outros'),
      n: soNumero(item.n),
      pct: pct(soNumero(item.n), totalCancel),
    })),
  };
}

function extraWhere(filtros, extra) {
  if (!filtros.where) return { params: filtros.params, where: `WHERE ${extra}` };
  return { params: filtros.params, where: `${filtros.where} AND ${extra}` };
}

function filtrosMensagens(start, end, establishmentId) {
  const params = [];
  const partes = [];
  if (establishmentId) {
    params.push(establishmentId);
    partes.push(`wc.establishment_id = $${params.length}`);
  }
  if (start) {
    params.push(start);
    partes.push(`m.created_at >= $${params.length}::date`);
  }
  if (end) {
    params.push(end);
    partes.push(`m.created_at < ($${params.length}::date + interval '1 day')`);
  }
  return { params, where: partes.length ? `WHERE ${partes.join(' AND ')}` : '' };
}

async function carregarOperacao(pool, options = {}) {
  const inicio = options.inicio;
  const fim = options.fim;
  const estab = options.establishmentId || null;
  const conv = filtrosTabela(inicio, fim, estab);
  const convWc = filtrosTabela(inicio, fim, estab, 'wc');
  const res = filtrosTabela(inicio, fim, estab);
  const msg = filtrosMensagens(inicio, fim, estab);
  const resolvidasFiltro = extraWhere(conv, `status = 'resolved'`);

  const [
    conversas,
    tempos,
    origemSessoes,
    heatmapConversas,
    resolvidosPorDia,
    primeiraRespostaPorDia,
    tempoAtendimentoPorDia,
    categorias,
    cancelamentos,
  ] = await Promise.all([
    queryUm(
      pool,
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE status = 'resolved')::int AS resolvidas,
              COUNT(*) FILTER (WHERE human_takeover_until IS NOT NULL)::int AS passaram_humano,
              COUNT(*) FILTER (WHERE human_takeover_until IS NULL)::int AS ia
         FROM whatsapp_conversations ${conv.where}`,
      conv.params,
      { total: 0, resolvidas: 0, passaram_humano: 0, ia: 0 },
    ),
    queryUm(
      pool,
      `SELECT AVG(EXTRACT(EPOCH FROM (pri.out_at - pri.in_at))) AS media,
              PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (pri.out_at - pri.in_at))) AS mediana
         FROM (
           SELECT MIN(m.created_at) FILTER (WHERE m.direction = 'inbound') AS in_at,
                  MIN(m.created_at) FILTER (WHERE m.direction = 'outbound') AS out_at
             FROM whatsapp_messages m
             JOIN whatsapp_conversations wc ON wc.id = m.conversation_id
            ${convWc.where}
            GROUP BY wc.id
         ) pri
        WHERE pri.in_at IS NOT NULL
          AND pri.out_at IS NOT NULL
          AND pri.out_at >= pri.in_at`,
      convWc.params,
      { media: null, mediana: null },
    ),
    queryLista(
      pool,
      `SELECT canal, COUNT(*)::int AS n FROM (
          SELECT CASE
                   WHEN EXISTS (
                     SELECT 1 FROM whatsapp_messages cm
                      WHERE cm.conversation_id = wc.id
                        AND COALESCE(cm.intent, '') LIKE 'CAMPAIGN%'
                   ) THEN 'WhatsApp campanha'
                   WHEN lower(COALESCE(ct.source_channel, '')) LIKE '%instagram%' THEN 'Instagram'
                   WHEN lower(COALESCE(ct.source_channel, '')) IN ('site', 'cliente', 'portal', 'google') THEN 'Site / portal'
                   ELSE 'WhatsApp orgânico'
                 END AS canal
            FROM whatsapp_conversations wc
            LEFT JOIN whatsapp_contacts ct ON ct.wa_id = wc.wa_id
           ${convWc.where}
       ) sessoes
       GROUP BY 1
       ORDER BY n DESC`,
      convWc.params,
    ),
    queryLista(
      pool,
      `SELECT EXTRACT(DOW FROM m.created_at AT TIME ZONE '${TZ}')::int AS dow,
              EXTRACT(HOUR FROM m.created_at AT TIME ZONE '${TZ}')::int AS hora,
              COUNT(*)::int AS n
         FROM whatsapp_messages m
         JOIN whatsapp_conversations wc ON wc.id = m.conversation_id
        ${msg.where ? `${msg.where} AND` : 'WHERE'} m.direction = 'inbound'
        GROUP BY 1, 2`,
      msg.params,
    ),
    queryLista(
      pool,
      `SELECT EXTRACT(DOW FROM updated_at AT TIME ZONE '${TZ}')::int AS dow, COUNT(*)::int AS n
         FROM whatsapp_conversations ${resolvidasFiltro.where}
        GROUP BY 1`,
      resolvidasFiltro.params,
    ),
    queryLista(
      pool,
      `SELECT EXTRACT(DOW FROM pri.in_at AT TIME ZONE '${TZ}')::int AS dow,
              AVG(EXTRACT(EPOCH FROM (pri.out_at - pri.in_at))) AS segundos
         FROM (
           SELECT MIN(m.created_at) FILTER (WHERE m.direction = 'inbound') AS in_at,
                  MIN(m.created_at) FILTER (WHERE m.direction = 'outbound') AS out_at
             FROM whatsapp_messages m
             JOIN whatsapp_conversations wc ON wc.id = m.conversation_id
            ${convWc.where}
            GROUP BY wc.id
         ) pri
        WHERE pri.in_at IS NOT NULL AND pri.out_at IS NOT NULL AND pri.out_at >= pri.in_at
        GROUP BY 1`,
      convWc.params,
    ),
    queryLista(
      pool,
      `SELECT EXTRACT(DOW FROM created_at AT TIME ZONE '${TZ}')::int AS dow,
              AVG(EXTRACT(EPOCH FROM (updated_at - created_at)) / 60.0) AS minutos
         FROM whatsapp_conversations ${conv.where}
        GROUP BY 1`,
      conv.params,
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
      `SELECT motivo, COUNT(*)::int AS n FROM (
          SELECT CASE
                   WHEN lower(replace(COALESCE(status, ''), '_', '-')) LIKE '%no%show%' THEN 'No-show'
                   WHEN lower(COALESCE(origin, '')) LIKE '%pessoal%'
                     OR lower(COALESCE(origin, '')) LIKE '%admin%' THEN 'Estabelecimento recusou'
                   WHEN lower(replace(COALESCE(status, ''), '_', '-')) LIKE '%cancel%' THEN 'Cliente recusou'
                   ELSE 'Outros'
                 END AS motivo
            FROM restaurant_reservations ${res.where ? `${res.where} AND` : 'WHERE'} (
              lower(replace(COALESCE(status, ''), '_', '-')) LIKE '%cancel%'
              OR lower(replace(COALESCE(status, ''), '_', '-')) LIKE '%no%show%'
            )
       ) cancel
       GROUP BY 1
       ORDER BY n DESC`,
      res.params,
    ),
  ]);

  return montarOperacao({
    conversas: {
      total: soNumero(conversas.total),
      resolvidas: soNumero(conversas.resolvidas),
      passaramHumano: soNumero(conversas.passaram_humano),
      ia: soNumero(conversas.ia),
    },
    primeiraRespostaSegundos: tempos.media == null ? null : soNumero(tempos.media),
    primeiraRespostaMediana: tempos.mediana == null ? null : soNumero(tempos.mediana),
    origemSessoes,
    heatmapConversas: heatmapConversas.map((row) => ({
      dow: soNumero(row.dow),
      hora: soNumero(row.hora),
      n: soNumero(row.n),
    })),
    resolvidosPorDia,
    primeiraRespostaPorDia,
    tempoAtendimentoPorDia,
    categorias,
    cancelamentos,
  });
}

module.exports = {
  montarOperacao,
  carregarOperacao,
};
