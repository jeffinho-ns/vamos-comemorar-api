/**
 * Relatório Consolidado - Highline
 * Período: 28/11/2025 até hoje
 *
 * Analisa: médias de check-ins, estabilidade do sistema, consistência de validação
 *
 * Execute: node scripts/gerar_relatorio_highline_periodo.js
 *
 * Saída: relatorio_highline_periodo.json, .md e .html
 */

const pool = require('../config/database');
const fs = require('fs');
const path = require('path');

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const ESTABLISHMENT_ID = 7; // Highline
const DATA_INICIO = '2025-11-28';
const DATA_FIM = new Date().toISOString().split('T')[0]; // Hoje

function fmt(d) {
  if (!d) return 'N/A';
  return new Date(d).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

async function gerarRelatorio() {
  const client = await pool.connect();
  const relatorio = {
    estabelecimento: 'Highline',
    establishment_id: ESTABLISHMENT_ID,
    periodo: { inicio: DATA_INICIO, fim: DATA_FIM },
    gerado_em: new Date().toISOString(),
    resumo: {},
    por_dia: [],
    por_mes: [],
    media_checkins: {},
    analise_estabilidade: {},
    consistencia_validacao: {},
    possiveis_anomalias: [],
  };

  try {
    await client.query(`SET search_path TO meu_backup_db, public`);
    await client.query(`SET timezone = 'America/Sao_Paulo'`);

    // 1. Check-ins de listas_convidados (promoters) - eventos Highline
    const promotersRes = await client.query(`
      SELECT 
        lc.data_checkin::DATE as data_checkin,
        COUNT(*) as qtd,
        MIN(lc.data_checkin) as primeiro,
        MAX(lc.data_checkin) as ultimo
      FROM listas_convidados lc
      INNER JOIN listas l ON lc.lista_id = l.lista_id
      INNER JOIN eventos e ON l.evento_id = e.id
      WHERE e.id_place = $1
        AND lc.status_checkin = 'Check-in'
        AND lc.data_checkin IS NOT NULL
        AND lc.data_checkin::DATE >= $2::DATE
        AND lc.data_checkin::DATE <= $3::DATE
      GROUP BY lc.data_checkin::DATE
      ORDER BY data_checkin
    `, [ESTABLISHMENT_ID, DATA_INICIO, DATA_FIM]);

    // 2. Check-ins de guests (guest lists - restaurante/grande)
    const guestsRes = await client.query(`
      SELECT 
        g.checkin_time::DATE as data_checkin,
        COUNT(*) as qtd
      FROM guests g
      INNER JOIN guest_lists gl ON g.guest_list_id = gl.id
      LEFT JOIN restaurant_reservations rr ON gl.reservation_id = rr.id AND gl.reservation_type = 'restaurant'
      LEFT JOIN large_reservations lr ON gl.reservation_id = lr.id AND gl.reservation_type = 'large'
      WHERE COALESCE(rr.establishment_id, lr.establishment_id) = $1
        AND g.checkin_time IS NOT NULL
        AND g.checkin_time::DATE >= $2::DATE
        AND g.checkin_time::DATE <= $3::DATE
      GROUP BY g.checkin_time::DATE
    `, [ESTABLISHMENT_ID, DATA_INICIO, DATA_FIM]);

    // 3. Check-ins de owner (guest_lists)
    const ownerRes = await client.query(`
      SELECT 
        gl.owner_checkin_time::DATE as data_checkin,
        COUNT(*) as qtd
      FROM guest_lists gl
      LEFT JOIN restaurant_reservations rr ON gl.reservation_id = rr.id AND gl.reservation_type = 'restaurant'
      LEFT JOIN large_reservations lr ON gl.reservation_id = lr.id AND gl.reservation_type = 'large'
      WHERE gl.owner_checked_in = TRUE
        AND gl.owner_checkin_time IS NOT NULL
        AND gl.owner_checkin_time::DATE >= $2::DATE
        AND gl.owner_checkin_time::DATE <= $3::DATE
        AND COALESCE(rr.establishment_id, lr.establishment_id) = $1
      GROUP BY gl.owner_checkin_time::DATE
    `, [ESTABLISHMENT_ID, DATA_INICIO, DATA_FIM]);

    // 4. Check-ins de restaurant_reservations (mesa direta)
    const rrRes = await client.query(`
      SELECT 
        checkin_time::DATE as data_checkin,
        COUNT(*) as qtd
      FROM restaurant_reservations
      WHERE establishment_id = $1
        AND checked_in = TRUE
        AND checkin_time IS NOT NULL
        AND checkin_time::DATE >= $2::DATE
        AND checkin_time::DATE <= $3::DATE
      GROUP BY checkin_time::DATE
    `, [ESTABLISHMENT_ID, DATA_INICIO, DATA_FIM]);

    // 5. Check-ins de large_reservations
    const lrRes = await client.query(`
      SELECT 
        checkin_time::DATE as data_checkin,
        COUNT(*) as qtd
      FROM large_reservations
      WHERE establishment_id = $1
        AND checked_in = TRUE
        AND checkin_time IS NOT NULL
        AND checkin_time::DATE >= $2::DATE
        AND checkin_time::DATE <= $3::DATE
      GROUP BY checkin_time::DATE
    `, [ESTABLISHMENT_ID, DATA_INICIO, DATA_FIM]);

    // 6. Eventos do Highline no período
    const eventosRes = await client.query(`
      SELECT 
        data_do_evento::DATE as data_evento,
        COUNT(DISTINCT id) as qtd_eventos,
        array_agg(DISTINCT nome_do_evento) as nomes
      FROM eventos
      WHERE id_place = $1
        AND data_do_evento IS NOT NULL
        AND data_do_evento::DATE >= $2::DATE
        AND data_do_evento::DATE <= $3::DATE
      GROUP BY data_do_evento::DATE
      ORDER BY data_evento
    `, [ESTABLISHMENT_ID, DATA_INICIO, DATA_FIM]);

    // Consolidar por dia
    const mapPorDia = new Map();
    const addToDay = (dataStr, qtd, tipo) => {
      if (!dataStr) return;
      const dt = new Date(dataStr);
      if (isNaN(dt.getTime())) return;
      const d = dt.toISOString().split('T')[0];
      if (!mapPorDia.has(d)) {
        mapPorDia.set(d, { data: d, promoters: 0, guests: 0, owner: 0, rr: 0, lr: 0, eventos: 0, nomes_eventos: [] });
      }
      const row = mapPorDia.get(d);
      if (tipo === 'promoters') row.promoters += parseInt(qtd, 10) || 0;
      else if (tipo === 'guests') row.guests += parseInt(qtd, 10) || 0;
      else if (tipo === 'owner') row.owner += parseInt(qtd, 10) || 0;
      else if (tipo === 'rr') row.rr += parseInt(qtd, 10) || 0;
      else if (tipo === 'lr') row.lr += parseInt(qtd, 10) || 0;
      else if (tipo === 'eventos') {
        row.eventos = parseInt(qtd, 10) || 0;
        row.nomes_eventos = row.nomes_eventos || [];
      }
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

    relatorio.por_dia = porDia;

    // Totais e médias
    const totalCheckins = porDia.reduce((s, d) => s + d.total_checkins, 0);
    const diasComCheckin = porDia.filter((d) => d.total_checkins > 0).length;
    const totalEventos = porDia.reduce((s, d) => s + (d.eventos || 0), 0);
    const diasComEvento = porDia.filter((d) => (d.eventos || 0) > 0).length;
    const diffTime = new Date(DATA_FIM) - new Date(DATA_INICIO);
    const diasNoPeriodo = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

    relatorio.resumo = {
      total_checkins: totalCheckins,
      total_eventos: totalEventos,
      dias_periodo: diasNoPeriodo,
      dias_com_checkin: diasComCheckin,
      dias_com_evento: diasComEvento,
      media_checkins_por_dia: diasNoPeriodo > 0 ? Math.round((totalCheckins / diasNoPeriodo) * 10) / 10 : 0,
      media_checkins_por_dia_com_evento: diasComEvento > 0 ? Math.round((totalCheckins / diasComEvento) * 10) / 10 : 0,
      media_checkins_por_evento: totalEventos > 0 ? Math.round((totalCheckins / totalEventos) * 10) / 10 : 0,
      total_promoters: porDia.reduce((s, d) => s + d.checkins_promoters, 0),
      total_guests: porDia.reduce((s, d) => s + d.checkins_guests, 0),
      total_mesa: porDia.reduce((s, d) => s + d.checkins_mesa, 0),
      total_large: porDia.reduce((s, d) => s + d.checkins_large, 0),
    };

    // Por mês (YYYY-MM)
    const mapMes = new Map();
    porDia.forEach((d) => {
      const mes = d.data && d.data.length >= 7 ? d.data.slice(0, 7) : '0000-00';
      if (!mapMes.has(mes)) mapMes.set(mes, { mes, total: 0, dias: 0, eventos: 0 });
      const m = mapMes.get(mes);
      m.total += d.total_checkins;
      m.dias++;
      m.eventos += d.eventos || 0;
    });
    relatorio.por_mes = Array.from(mapMes.entries())
      .map(([k, v]) => ({ mes: k, ...v }))
      .sort((a, b) => a.mes.localeCompare(b.mes));

    // Análise de estabilidade: dias com evento mas SEM check-in (possível travamento)
    const diasEventoSemCheckin = porDia.filter((d) => (d.eventos || 0) > 0 && d.total_checkins === 0);
    relatorio.possiveis_anomalias = diasEventoSemCheckin.map((d) => ({
      data: d.data,
      data_formatada: d.data ? new Date(d.data + 'T12:00:00').toLocaleDateString('pt-BR') : '',
      eventos: d.eventos,
      nomes: d.nomes_eventos,
      descricao: `Dia com ${d.eventos} evento(s) mas sem registro de check-in`,
    }));

    relatorio.analise_estabilidade = {
      dias_com_evento_sem_checkin: diasEventoSemCheckin.length,
      indicador_travamento: diasEventoSemCheckin.length === 0
        ? 'Nenhum indicativo de travamento'
        : `${diasEventoSemCheckin.length} dia(s) com evento e sem check-in (verificar manualmente)`,
      total_dias_operacionais: diasComCheckin,
      taxa_dias_com_checkin: diasNoPeriodo > 0
        ? Math.round((diasComCheckin / diasNoPeriodo) * 100)
        : 0,
      conclusao: diasEventoSemCheckin.length === 0
        ? 'Sistema operou de forma estável no período. Não há evidências de travamentos.'
        : 'Recomenda-se verificar os dias listados em possíveis anomalias.',
    };

    // Consistência de validação: verificar duplicidades e integridade
    const dupPromoters = await client.query(`
      SELECT MAX(lc.nome_convidado) as nome_convidado, MAX(l.nome) as lista, lc.data_checkin::DATE as dt, COUNT(*) as qtd
      FROM listas_convidados lc
      INNER JOIN listas l ON lc.lista_id = l.lista_id
      INNER JOIN eventos e ON l.evento_id = e.id
      WHERE e.id_place = $1 AND lc.status_checkin = 'Check-in' AND lc.data_checkin IS NOT NULL
        AND lc.data_checkin::DATE >= $2::DATE AND lc.data_checkin::DATE <= $3::DATE
      GROUP BY LOWER(TRIM(lc.nome_convidado)), l.lista_id, lc.data_checkin::DATE
      HAVING COUNT(*) > 1
    `, [ESTABLISHMENT_ID, DATA_INICIO, DATA_FIM]);

    const totalConvidados = await client.query(`
      SELECT COUNT(*) as total FROM listas_convidados lc
      INNER JOIN listas l ON lc.lista_id = l.lista_id
      INNER JOIN eventos e ON l.evento_id = e.id
      WHERE e.id_place = $1 AND lc.status_checkin = 'Check-in'
        AND lc.data_checkin::DATE >= $2::DATE AND lc.data_checkin::DATE <= $3::DATE
    `, [ESTABLISHMENT_ID, DATA_INICIO, DATA_FIM]);

    relatorio.consistencia_validacao = {
      total_checkins_validados: parseInt(totalConvidados.rows[0]?.total || 0, 10) + relatorio.resumo.total_guests + relatorio.resumo.total_mesa + relatorio.resumo.total_large,
      nomes_duplicados_mesmo_dia: dupPromoters.rows.length,
      taxa_duplicidade: totalConvidados.rows[0]?.total > 0
        ? Math.round((dupPromoters.rows.length / parseInt(totalConvidados.rows[0].total, 10)) * 10000) / 100
        : 0,
      avaliacao: dupPromoters.rows.length <= 5
        ? 'Consistência de validação boa. Poucos casos de duplicidade nas listas.'
        : 'Recomenda-se revisar listas com nomes duplicados.',
      detalhes_duplicidades: dupPromoters.rows.slice(0, 20).map((r) => ({
        nome: r.nome_convidado,
        lista: r.lista,
        data: r.dt,
        vezes: r.qtd,
      })),
    };

    await salvarRelatorio(relatorio);
    await salvarMarkdown(relatorio);
    await salvarHTML(relatorio);
    console.log('\n✅ Relatório Highline período gerado com sucesso!');
    console.log('   - relatorio_highline_periodo.json');
    console.log('   - relatorio_highline_periodo.md');
    console.log('   - relatorio_highline_periodo.html');
  } catch (error) {
    console.error('❌ Erro:', error.message);
    relatorio.erro = error.message;
    await salvarRelatorio(relatorio);
  } finally {
    client.release();
    await pool.end();
  }
}

async function salvarRelatorio(r) {
  const dir = path.join(__dirname, '..');
  fs.writeFileSync(path.join(dir, 'relatorio_highline_periodo.json'), JSON.stringify(r, null, 2), 'utf8');
}

async function salvarMarkdown(r) {
  const dir = path.join(__dirname, '..');
  let md = `# Relatório Consolidado - Highline\n`;
  md += `**Período:** ${r.periodo.inicio} a ${r.periodo.fim}\n`;
  md += `**Gerado em:** ${new Date().toLocaleString('pt-BR')}\n\n---\n\n`;

  if (r.erro) {
    md += `## Erro\n${r.erro}\n`;
    fs.writeFileSync(path.join(dir, 'relatorio_highline_periodo.md'), md, 'utf8');
    return;
  }

  const s = r.resumo;
  md += `## 1. Resumo Geral\n\n`;
  md += `| Métrica | Valor |\n|---------|-------|\n`;
  md += `| Total de check-ins | ${s.total_checkins} |\n`;
  md += `| Total de eventos | ${s.total_eventos} |\n`;
  md += `| Dias no período | ${s.dias_periodo} |\n`;
  md += `| Dias com check-in | ${s.dias_com_checkin} |\n`;
  md += `| Dias com evento | ${s.dias_com_evento} |\n`;
  md += `| Média check-ins/dia | ${s.media_checkins_por_dia} |\n`;
  md += `| Média check-ins/dia com evento | ${s.media_checkins_por_dia_com_evento} |\n`;
  md += `| Média check-ins/evento | ${s.media_checkins_por_evento} |\n`;
  md += `| Check-ins Promoters | ${s.total_promoters} |\n`;
  md += `| Check-ins Convidados (guest lists) | ${s.total_guests} |\n`;
  md += `| Check-ins Mesa (restaurante) | ${s.total_mesa} |\n`;
  md += `| Check-ins Large | ${s.total_large} |\n\n`;

  md += `## 2. Por Mês\n\n`;
  md += `| Mês | Total Check-ins | Dias | Eventos |\n|-----|-----------------|------|----------|\n`;
  (r.por_mes || []).forEach((m) => {
    md += `| ${m.mes} | ${m.total} | ${m.dias} | ${m.eventos} |\n`;
  });
  md += `\n`;

  md += `## 3. Estabilidade do Sistema (Indicadores de Travamento)\n\n`;
  const est = r.analise_estabilidade || {};
  md += `| Indicador | Resultado |\n|-----------|----------|\n`;
  md += `| Dias com evento e sem check-in | ${est.dias_com_evento_sem_checkin || 0} |\n`;
  md += `| Avaliação | ${est.indicador_travamento || '-'} |\n`;
  md += `| Dias operacionais | ${est.total_dias_operacionais || 0} |\n`;
  md += `| Conclusão | ${est.conclusao || '-'} |\n\n`;

  if ((r.possiveis_anomalias || []).length > 0) {
    md += `### Possíveis Anomalias\n\n`;
    r.possiveis_anomalias.forEach((a) => {
      md += `- **${a.data_formatada || a.data}** (${a.data}): ${a.descricao} ${(a.nomes || []).length ? `- Eventos: ${a.nomes.join(', ')}` : ''}\n`;
    });
    md += `\n`;
  }

  md += `## 4. Consistência de Validação\n\n`;
  const val = r.consistencia_validacao || {};
  md += `| Métrica | Valor |\n|---------|-------|\n`;
  md += `| Total check-ins validados | ${val.total_checkins_validados || 0} |\n`;
  md += `| Nomes duplicados (mesmo dia/lista) | ${val.nomes_duplicados_mesmo_dia || 0} |\n`;
  md += `| Taxa duplicidade | ${val.taxa_duplicidade || 0}% |\n`;
  md += `| Avaliação | ${val.avaliacao || '-'} |\n\n`;

  md += `---\n*Relatório gerado automaticamente - vamos-comemorar-api*\n`;
  fs.writeFileSync(path.join(dir, 'relatorio_highline_periodo.md'), md, 'utf8');
}

async function salvarHTML(r) {
  const dir = path.join(__dirname, '..');
  if (r.erro) return;

  const s = r.resumo;
  const est = r.analise_estabilidade || {};
  const val = r.consistencia_validacao || {};

  let html = `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><title>Relatório Highline - Período</title>
<style>
body{font-family:'Segoe UI',Tahoma,sans-serif;max-width:900px;margin:40px auto;padding:0 20px;color:#333}
h1{color:#1a5f2a;border-bottom:2px solid #1a5f2a;padding-bottom:8px}
h2{color:#2d7a3e;margin-top:32px}
table{border-collapse:collapse;width:100%;margin:16px 0}
th,td{border:1px solid #ddd;padding:10px 12px;text-align:left}
th{background:#1a5f2a;color:white}
.metric{background:#e8f5e9;border-left:4px solid #1a5f2a;padding:16px 24px;margin:8px 0;display:inline-block;min-width:140px}
.ok{color:#2e7d32}
.alerta{background:#fff3e0;border-left:4px solid #ff9800;padding:16px;margin:16px 0}
.btn-pdf{position:fixed;top:20px;right:20px;padding:12px 24px;background:#c62828;color:white;border:none;border-radius:8px;cursor:pointer}
@media print{.btn-pdf{display:none}}
</style>
</head>
<body>
<button class="btn-pdf" onclick="window.print();">Salvar em PDF</button>
<h1>Relatório Consolidado - Highline</h1>
<p style="color:#666">Período: ${r.periodo.inicio} a ${r.periodo.fim} | Gerado em: ${new Date().toLocaleString('pt-BR')}</p>

<h2>1. Resumo e Médias</h2>
<div>
<span class="metric"><strong>${s.total_checkins}</strong><br>Total Check-ins</span>
<span class="metric"><strong>${s.media_checkins_por_dia_com_evento}</strong><br>Média/dia com evento</span>
<span class="metric"><strong>${s.media_checkins_por_evento}</strong><br>Média/evento</span>
<span class="metric"><strong>${s.total_eventos}</strong><br>Eventos</span>
<span class="metric"><strong>${s.dias_com_checkin}</strong><br>Dias operacionais</span>
</div>

<h2>2. Estabilidade - Indicadores de Travamento</h2>
<table>
<tr><th>Indicador</th><th>Status</th></tr>
<tr><td>Dias com evento e sem check-in</td><td class="${est.dias_com_evento_sem_checkin === 0 ? 'ok' : ''}">${est.dias_com_evento_sem_checkin || 0}</td></tr>
<tr><td>Avaliação</td><td>${est.indicador_travamento || '-'}</td></tr>
<tr><td>Conclusão</td><td>${est.conclusao || '-'}</td></tr>
</table>
${(r.possiveis_anomalias || []).length > 0 ? `<div class="alerta"><strong>Possíveis anomalias:</strong><ul>${r.possiveis_anomalias.map(a => `<li>${a.data_formatada || a.data}: ${a.descricao}</li>`).join('')}</ul></div>` : ''}

<h2>3. Consistência de Validação</h2>
<table>
<tr><th>Métrica</th><th>Valor</th></tr>
<tr><td>Check-ins validados</td><td>${val.total_checkins_validados || 0}</td></tr>
<tr><td>Duplicidades (mesmo dia/lista)</td><td>${val.nomes_duplicados_mesmo_dia || 0}</td></tr>
<tr><td>Avaliação</td><td>${val.avaliacao || '-'}</td></tr>
</table>

<h2>4. Por Mês</h2>
<table><tr><th>Mês</th><th>Check-ins</th><th>Dias</th><th>Eventos</th></tr>`;
  (r.por_mes || []).forEach((m) => {
    html += `<tr><td>${m.mes}</td><td>${m.total}</td><td>${m.dias}</td><td>${m.eventos}</td></tr>`;
  });
  html += `</table>
<p style="margin-top:40px;color:#888;font-size:0.85em">Relatório gerado automaticamente - vamos-comemorar-api</p>
</body></html>`;

  fs.writeFileSync(path.join(dir, 'relatorio_highline_periodo.html'), html, 'utf8');
}

gerarRelatorio();
