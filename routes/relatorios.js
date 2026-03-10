/**
 * API de Relatórios - Geração dinâmica
 * POST /api/relatorios/gerar - Gera relatório conforme parâmetros
 * GET /api/relatorios/estabelecimentos - Lista estabelecimentos
 * GET /api/relatorios/eventos - Lista eventos (filtro por establishment, data)
 */

const express = require('express');
const router = express.Router();

module.exports = (pool) => {
  /**
   * GET /api/relatorios/estabelecimentos
   * Retorna estabelecimentos (places + bars) para o seletor
   */
  router.get('/estabelecimentos', async (req, res) => {
    try {
      const r = await pool.query(`
        SELECT DISTINCT e.id_place as id, COALESCE(b.name, p.name) as nome
        FROM eventos e
        LEFT JOIN bars b ON b.id = e.id_place
        LEFT JOIN places p ON p.id = e.id_place
        WHERE e.id_place IS NOT NULL AND (b.name IS NOT NULL OR p.name IS NOT NULL)
        ORDER BY nome
      `);
      const estabelecimentos = (r.rows || []).map((row) => ({ id: row.id, nome: row.nome }));
      res.json({ success: true, estabelecimentos });
    } catch (e) {
      console.error('Erro relatórios estabelecimentos:', e);
      res.status(500).json({ success: false, error: e.message });
    }
  });

  /**
   * GET /api/relatorios/eventos
   * Params: establishment_id, data_inicio, data_fim
   */
  router.get('/eventos', async (req, res) => {
    try {
      const { establishment_id, data_inicio, data_fim } = req.query;
      let q = `SELECT e.id, e.nome_do_evento, e.data_do_evento, e.tipo_evento
               FROM eventos e WHERE 1=1`;
      const params = [];
      let i = 1;
      if (establishment_id) {
        q += ` AND e.id_place = $${i++}`;
        params.push(establishment_id);
      }
      if (data_inicio) {
        q += ` AND e.data_do_evento::DATE >= $${i++}`;
        params.push(data_inicio);
      }
      if (data_fim) {
        q += ` AND e.data_do_evento::DATE <= $${i++}`;
        params.push(data_fim);
      }
      q += ` ORDER BY e.data_do_evento DESC LIMIT 200`;
      const r = await pool.query(q, params);
      res.json({ success: true, eventos: r.rows });
    } catch (e) {
      console.error('Erro relatórios eventos:', e);
      res.status(500).json({ success: false, error: e.message });
    }
  });

  /**
   * POST /api/relatorios/gerar
   * Body: { tipo, establishment_id, data_inicio, data_fim, evento_id, formatos, secoes }
   * tipos: 'periodo' | 'evento'
   */
  router.post('/gerar', async (req, res) => {
    try {
      const { tipo, establishment_id, data_inicio, data_fim, evento_id } = req.body;
      const client = await pool.connect();

      try {
        await client.query(`SET search_path TO meu_backup_db, public`);
        await client.query(`SET timezone = 'America/Sao_Paulo'`);

        let relatorio = {};

        if (tipo === 'evento' && evento_id) {
          relatorio = await gerarRelatorioEvento(client, parseInt(evento_id, 10));
        } else if (tipo === 'periodo') {
          const estId = establishment_id ? parseInt(establishment_id, 10) : 7;
          const di = data_inicio || '2025-11-28';
          const df = data_fim || new Date().toISOString().split('T')[0];
          relatorio = await gerarRelatorioPeriodo(client, estId, di, df);
        } else {
          return res.status(400).json({ success: false, error: 'Parâmetros inválidos' });
        }

        res.json({ success: true, relatorio });
      } finally {
        client.release();
      }
    } catch (e) {
      console.error('Erro ao gerar relatório:', e);
      res.status(500).json({ success: false, error: e.message });
    }
  });

  return router;
};

async function gerarRelatorioEvento(client, eventoId) {
  const eventoRes = await client.query(
    `SELECT id, nome_do_evento, data_do_evento, hora_do_evento FROM eventos WHERE id = $1`,
    [eventoId]
  );
  if (eventoRes.rows.length === 0) {
    throw new Error('Evento não encontrado');
  }

  const listasRes = await client.query(
    `SELECT l.lista_id, l.nome, l.tipo, l.promoter_responsavel_id, p.nome as promoter_nome
     FROM listas l
     LEFT JOIN promoters p ON l.promoter_responsavel_id = p.promoter_id
     WHERE l.evento_id = $1`,
    [eventoId]
  );
  const listaIds = listasRes.rows.map((l) => l.lista_id);
  if (listaIds.length === 0) {
    return {
      tipo: 'evento',
      evento: eventoRes.rows[0],
      listas: [],
      resumo: { total_pessoas: 0, total_checkins: 0, total_listas: 0 },
      por_promoter: [],
      duplicidades: [],
      vip_noite_toda: [],
    };
  }

  const convidadosRes = await client.query(
    `SELECT lc.lista_convidado_id, lc.lista_id, lc.nome_convidado, lc.status_checkin,
            lc.data_checkin, lc.is_vip, lc.entrada_tipo, lc.entrada_valor
     FROM listas_convidados lc
     WHERE lc.lista_id = ANY($1)`,
    [listaIds]
  );
  const convidados = convidadosRes.rows;
  const listaMap = Object.fromEntries(listasRes.rows.map((l) => [l.lista_id, l]));

  const totalPessoas = convidados.length;
  const totalCheckins = convidados.filter((c) => c.status_checkin === 'Check-in').length;

  const promoterMap = {};
  for (const c of convidados) {
    const lista = listaMap[c.lista_id];
    const key = lista.promoter_responsavel_id ? `p${lista.promoter_responsavel_id}` : 'casa';
    if (!promoterMap[key]) {
      promoterMap[key] = { promoter_nome: lista.promoter_nome || 'Casa', total_na_lista: 0, total_checkins: 0 };
    }
    promoterMap[key].total_na_lista++;
    if (c.status_checkin === 'Check-in') promoterMap[key].total_checkins++;
  }

  const duplicidades = [];
  for (const lista of listasRes.rows) {
    const convs = convidados.filter((c) => c.lista_id === lista.lista_id);
    const norm = (n) => (n || '').toString().trim().toLowerCase().replace(/\s+/g, ' ');
    const counts = {};
    convs.forEach((c) => {
      const k = norm(c.nome_convidado);
      counts[k] = (counts[k] || 0) + 1;
    });
    const dups = Object.entries(counts).filter(([, v]) => v > 1);
    if (dups.length) {
      duplicidades.push({
        lista: lista.nome,
        promoter: lista.promoter_nome || 'Casa',
        duplicados: dups.map(([nome, qtd]) => ({ nome, quantidade: qtd })),
      });
    }
  }

  const vipNoiteToda = convidados
    .filter((c) => c.status_checkin === 'Check-in' && ((c.entrada_tipo && String(c.entrada_tipo).toUpperCase() === 'VIP') || c.is_vip))
    .map((c) => {
      const l = listaMap[c.lista_id];
      return {
        nome: c.nome_convidado,
        promoter: l?.promoter_nome || 'N/A',
        data_checkin: c.data_checkin ? new Date(c.data_checkin).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : null,
      };
    });

  const horariosEntrada = convidados
    .filter((c) => c.status_checkin === 'Check-in' && c.data_checkin)
    .sort((a, b) => new Date(a.data_checkin) - new Date(b.data_checkin))
    .map((c) => {
      const l = listaMap[c.lista_id];
      return {
        nome: c.nome_convidado,
        promoter: l?.promoter_nome || 'N/A',
        horario: new Date(c.data_checkin).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' }),
        tipo_entrada: c.entrada_tipo || (c.is_vip ? 'VIP' : 'N/A'),
      };
    });

  return {
    tipo: 'evento',
    evento: eventoRes.rows[0],
    listas: listasRes.rows,
    resumo: {
      total_pessoas_na_lista: totalPessoas,
      total_checkins: totalCheckins,
      taxa_checkin_pct: totalPessoas ? Math.round((totalCheckins / totalPessoas) * 100) : 0,
      total_listas: listasRes.rows.length,
    },
    por_promoter: Object.values(promoterMap).map((p) => ({
      ...p,
      taxa_checkin_pct: p.total_na_lista ? Math.round((p.total_checkins / p.total_na_lista) * 100) : 0,
    })),
    duplicidades,
    vip_noite_toda: vipNoiteToda,
    horarios_entrada: horariosEntrada,
  };
}

async function gerarRelatorioPeriodo(client, establishmentId, dataInicio, dataFim) {
  const [promotersRes, guestsRes, ownerRes, rrRes, lrRes, eventosRes] = await Promise.all([
    client.query(
      `SELECT lc.data_checkin::DATE as data_checkin, COUNT(*) as qtd
       FROM listas_convidados lc
       INNER JOIN listas l ON lc.lista_id = l.lista_id
       INNER JOIN eventos e ON l.evento_id = e.id
       WHERE e.id_place = $1 AND lc.status_checkin = 'Check-in' AND lc.data_checkin IS NOT NULL
         AND lc.data_checkin::DATE >= $2::DATE AND lc.data_checkin::DATE <= $3::DATE
       GROUP BY lc.data_checkin::DATE`,
      [establishmentId, dataInicio, dataFim]
    ),
    client.query(
      `SELECT g.checkin_time::DATE as data_checkin, COUNT(*) as qtd
       FROM guests g
       INNER JOIN guest_lists gl ON g.guest_list_id = gl.id
       LEFT JOIN restaurant_reservations rr ON gl.reservation_id = rr.id AND gl.reservation_type = 'restaurant'
       LEFT JOIN large_reservations lr ON gl.reservation_id = lr.id AND gl.reservation_type = 'large'
       WHERE COALESCE(rr.establishment_id, lr.establishment_id) = $1 AND g.checkin_time IS NOT NULL
         AND g.checkin_time::DATE >= $2::DATE AND g.checkin_time::DATE <= $3::DATE
       GROUP BY g.checkin_time::DATE`,
      [establishmentId, dataInicio, dataFim]
    ),
    client.query(
      `SELECT gl.owner_checkin_time::DATE as data_checkin, COUNT(*) as qtd
       FROM guest_lists gl
       LEFT JOIN restaurant_reservations rr ON gl.reservation_id = rr.id AND gl.reservation_type = 'restaurant'
       LEFT JOIN large_reservations lr ON gl.reservation_id = lr.id AND gl.reservation_type = 'large'
       WHERE gl.owner_checked_in = TRUE AND gl.owner_checkin_time IS NOT NULL
         AND gl.owner_checkin_time::DATE >= $2::DATE AND gl.owner_checkin_time::DATE <= $3::DATE
         AND COALESCE(rr.establishment_id, lr.establishment_id) = $1
       GROUP BY gl.owner_checkin_time::DATE`,
      [establishmentId, dataInicio, dataFim]
    ),
    client.query(
      `SELECT checkin_time::DATE as data_checkin, COUNT(*) as qtd
       FROM restaurant_reservations
       WHERE establishment_id = $1 AND checked_in = TRUE AND checkin_time IS NOT NULL
         AND checkin_time::DATE >= $2::DATE AND checkin_time::DATE <= $3::DATE
       GROUP BY checkin_time::DATE`,
      [establishmentId, dataInicio, dataFim]
    ),
    client.query(
      `SELECT checkin_time::DATE as data_checkin, COUNT(*) as qtd
       FROM large_reservations
       WHERE establishment_id = $1 AND checked_in = TRUE AND checkin_time IS NOT NULL
         AND checkin_time::DATE >= $2::DATE AND checkin_time::DATE <= $3::DATE
       GROUP BY checkin_time::DATE`,
      [establishmentId, dataInicio, dataFim]
    ),
    client.query(
      `SELECT data_do_evento::DATE as data_evento, COUNT(DISTINCT id) as qtd_eventos, array_agg(DISTINCT nome_do_evento) as nomes
       FROM eventos
       WHERE id_place = $1 AND data_do_evento IS NOT NULL
         AND data_do_evento::DATE >= $2::DATE AND data_do_evento::DATE <= $3::DATE
       GROUP BY data_do_evento::DATE`,
      [establishmentId, dataInicio, dataFim]
    ),
  ]);

  const mapPorDia = new Map();
  const addToDay = (dataStr, qtd, tipo) => {
    if (!dataStr) return;
    const dt = new Date(dataStr);
    if (isNaN(dt.getTime())) return;
    const d = dt.toISOString().split('T')[0];
    if (!mapPorDia.has(d)) mapPorDia.set(d, { data: d, promoters: 0, guests: 0, owner: 0, rr: 0, lr: 0, eventos: 0, nomes_eventos: [] });
    const row = mapPorDia.get(d);
    if (tipo === 'promoters') row.promoters += parseInt(qtd, 10) || 0;
    else if (tipo === 'guests') row.guests += parseInt(qtd, 10) || 0;
    else if (tipo === 'owner') row.owner += parseInt(qtd, 10) || 0;
    else if (tipo === 'rr') row.rr += parseInt(qtd, 10) || 0;
    else if (tipo === 'lr') row.lr += parseInt(qtd, 10) || 0;
    else if (tipo === 'eventos') row.eventos = parseInt(qtd, 10) || 0;
  };

  promotersRes.rows.forEach((r) => addToDay(r.data_checkin, r.qtd, 'promoters'));
  guestsRes.rows.forEach((r) => addToDay(r.data_checkin, r.qtd, 'guests'));
  ownerRes.rows.forEach((r) => addToDay(r.data_checkin, r.qtd, 'owner'));
  rrRes.rows.forEach((r) => addToDay(r.data_checkin, r.qtd, 'rr'));
  lrRes.rows.forEach((r) => addToDay(r.data_checkin, r.qtd, 'lr'));
  eventosRes.rows.forEach((r) => {
    const dt = new Date(r.data_evento);
    const d = !isNaN(dt.getTime()) ? dt.toISOString().split('T')[0] : null;
    if (d) {
      addToDay(r.data_evento, r.qtd_eventos, 'eventos');
      const row = mapPorDia.get(d);
      if (row && r.nomes) row.nomes_eventos = r.nomes || [];
    }
  });

  const porDia = Array.from(mapPorDia.entries())
    .map(([d, v]) => ({
      data: d,
      checkins_promoters: v.promoters,
      checkins_guests: v.guests,
      checkins_owner: v.owner,
      checkins_mesa: v.rr,
      checkins_large: v.lr,
      total_checkins: v.promoters + v.guests + v.owner + v.rr + v.lr,
      eventos: v.eventos,
      nomes_eventos: v.nomes_eventos || [],
    }))
    .sort((a, b) => a.data.localeCompare(b.data));

  const totalCheckins = porDia.reduce((s, d) => s + d.total_checkins, 0);
  const diasComCheckin = porDia.filter((d) => d.total_checkins > 0).length;
  const totalEventos = porDia.reduce((s, d) => s + (d.eventos || 0), 0);
  const diasComEvento = porDia.filter((d) => (d.eventos || 0) > 0).length;
  const diffTime = new Date(dataFim) - new Date(dataInicio);
  const diasNoPeriodo = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
  const diasEventoSemCheckin = porDia.filter((d) => (d.eventos || 0) > 0 && d.total_checkins === 0);

  const mapMes = new Map();
  porDia.forEach((d) => {
    const mes = d.data && d.data.length >= 7 ? d.data.slice(0, 7) : '0000-00';
    if (!mapMes.has(mes)) mapMes.set(mes, { mes, total: 0, dias: 0, eventos: 0 });
    const m = mapMes.get(mes);
    m.total += d.total_checkins;
    m.dias++;
    m.eventos += d.eventos || 0;
  });

  const dupRes = await client.query(`
    SELECT MAX(lc.nome_convidado) as nome, MAX(l.nome) as lista, lc.data_checkin::DATE as dt, COUNT(*) as qtd
    FROM listas_convidados lc
    INNER JOIN listas l ON lc.lista_id = l.lista_id
    INNER JOIN eventos e ON l.evento_id = e.id
    WHERE e.id_place = $1 AND lc.status_checkin = 'Check-in' AND lc.data_checkin IS NOT NULL
      AND lc.data_checkin::DATE >= $2::DATE AND lc.data_checkin::DATE <= $3::DATE
    GROUP BY LOWER(TRIM(lc.nome_convidado)), l.lista_id, lc.data_checkin::DATE
    HAVING COUNT(*) > 1
  `, [establishmentId, dataInicio, dataFim]);

  return {
    tipo: 'periodo',
    estabelecimento: 'Estabelecimento',
    establishment_id: establishmentId,
    periodo: { inicio: dataInicio, fim: dataFim },
    resumo: {
      total_checkins: totalCheckins,
      total_eventos: totalEventos,
      dias_periodo: diasNoPeriodo,
      dias_com_checkin: diasComCheckin,
      dias_com_evento: diasComEvento,
      media_checkins_por_dia: diasNoPeriodo ? Math.round((totalCheckins / diasNoPeriodo) * 10) / 10 : 0,
      media_checkins_por_dia_com_evento: diasComEvento ? Math.round((totalCheckins / diasComEvento) * 10) / 10 : 0,
      media_checkins_por_evento: totalEventos ? Math.round((totalCheckins / totalEventos) * 10) / 10 : 0,
      total_promoters: porDia.reduce((s, d) => s + d.checkins_promoters, 0),
      total_guests: porDia.reduce((s, d) => s + d.checkins_guests, 0),
      total_mesa: porDia.reduce((s, d) => s + d.checkins_mesa, 0),
      total_large: porDia.reduce((s, d) => s + d.checkins_large, 0),
    },
    por_dia: porDia,
    por_mes: Array.from(mapMes.values()).sort((a, b) => a.mes.localeCompare(b.mes)),
    analise_estabilidade: {
      dias_com_evento_sem_checkin: diasEventoSemCheckin.length,
      indicador_travamento: diasEventoSemCheckin.length === 0 ? 'Nenhum indicativo de travamento' : `${diasEventoSemCheckin.length} dia(s) com evento e sem check-in`,
      conclusao: diasEventoSemCheckin.length === 0 ? 'Sistema operou de forma estável.' : 'Verificar dias listados em possíveis anomalias.',
    },
    possiveis_anomalias: diasEventoSemCheckin.map((d) => ({
      data: d.data,
      data_formatada: d.data ? new Date(d.data + 'T12:00:00').toLocaleDateString('pt-BR') : '',
      eventos: d.eventos,
      nomes: d.nomes_eventos,
    })),
    consistencia_validacao: {
      nomes_duplicados_mesmo_dia: dupRes.rows.length,
      avaliacao: dupRes.rows.length <= 5 ? 'Consistência boa.' : 'Revisar duplicidades.',
    },
  };
}
