#!/usr/bin/env node
/**
 * Health-check de leitura do agente conversacional (WhatsApp).
 *
 * NÃO altera nada no banco — só faz SELECT. Pode rodar em produção
 * sem risco.
 *
 *   node scripts/checkAiHealth.js
 *   node scripts/checkAiHealth.js --hours=4
 *   node scripts/checkAiHealth.js --since="2026-05-27T05:30:00Z"
 *
 * Mostra:
 *   1. Config atual (modelo, agente novo, legado, stuck-resolver)
 *   2. Distribuição de intents nas últimas N horas
 *   3. Saídas LEGADAS na janela (alvo: 0 após Fase 1)
 *   4. Conversas pedindo humano sem takeover ativado
 *   5. Conversas mais ativas no momento
 *   6. Reservas criadas pela IA no período
 */

require('dotenv').config();
const pool = require('../config/database');

const LEGACY_INTENTS = [
  'COLLECT_DATA',
  'PROCESS_RESERVATION',
  'PROCESS_RESERVATION_CONFIRM',
  'PROCESS_RESERVATION_ERROR',
  'STATE_VALIDATION_ERROR',
  'REFUSE_MINOR',
  'falar_com_humano',
];

const NEW_INTENTS = ['AGENT_REPLY', 'HUMAN_REQUESTED', 'B2B_HANDOFF', 'GUEST_LIST_LINK', 'OPERATIONAL_INFO'];

function parseArgs() {
  const out = { hours: 1, since: null, phase1At: null };
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith('--hours=')) out.hours = Number(arg.split('=')[1]) || 1;
    else if (arg.startsWith('--since=')) out.since = arg.split('=')[1];
    else if (arg.startsWith('--phase1=')) out.phase1At = arg.split('=')[1];
  }
  if (!out.phase1At && process.env.AI_HEALTH_PHASE1_AT) {
    out.phase1At = process.env.AI_HEALTH_PHASE1_AT;
  }
  return out;
}

function pad(label, width = 30) {
  return String(label).padEnd(width);
}

function classifyIntent(intent) {
  if (!intent) return 'sem_intent';
  if (LEGACY_INTENTS.includes(intent)) return 'legado';
  if (NEW_INTENTS.includes(intent)) return 'novo';
  if (intent === 'recovery_followup') return 'recovery';
  return 'outro';
}

async function showConfig() {
  console.log('=== CONFIG ATUAL ===');
  console.log(`  OPENAI_AGENT_MODEL              = ${process.env.OPENAI_AGENT_MODEL || '(default: gpt-5.5)'}`);
  console.log(`  WHATSAPP_AGENT_MODE             = ${process.env.WHATSAPP_AGENT_MODE || '(default: true)'}`);
  console.log(`  WHATSAPP_STUCK_RESOLVER_ENABLED = ${process.env.WHATSAPP_STUCK_RESOLVER_ENABLED || '(default: true)'}`);
  console.log(
    `  WHATSAPP_LEGACY_RESERVATION_FUNNEL = ${process.env.WHATSAPP_LEGACY_RESERVATION_FUNNEL || '(default: false)'}`
  );
  console.log('');
}

async function showWindowBreakdown(windowClause, windowLabel) {
  console.log(`=== INTENTS POR CAMINHO — ${windowLabel} ===`);
  const r = await pool.query(`
    SELECT intent, COUNT(*) AS qtd
      FROM whatsapp_messages
     WHERE direction = 'outbound' ${windowClause}
     GROUP BY intent ORDER BY qtd DESC`);

  if (r.rowCount === 0) {
    console.log('  (nenhuma saída na janela)');
    console.log('');
    return { legado: 0, novo: 0, total: 0 };
  }

  const totals = { legado: 0, novo: 0, recovery: 0, outro: 0, sem_intent: 0 };
  for (const row of r.rows) {
    const grupo = classifyIntent(row.intent);
    totals[grupo] = (totals[grupo] || 0) + Number(row.qtd);
    const tag = grupo === 'legado' ? '[LEGADO]' : grupo === 'novo' ? '[NOVO]  ' : `[${grupo.toUpperCase()}]`;
    console.log(`  ${tag} ${pad(row.intent || 'NULL', 30)} qtd=${row.qtd}`);
  }
  const total = Object.values(totals).reduce((a, b) => a + b, 0);
  console.log('');
  console.log(
    `  Resumo: legado=${totals.legado}  novo=${totals.novo}  recovery=${totals.recovery}  outro=${totals.outro}  TOTAL=${total}`
  );
  console.log('');
  return { ...totals, total };
}

async function showLegacySamples(windowClause, phase1At) {
  const r = await pool.query(`
    SELECT m.id, m.intent, m.conversation_id, c.establishment_id, c.wa_id,
           m.created_at, LEFT(m.body, 120) AS body
      FROM whatsapp_messages m
      JOIN whatsapp_conversations c ON c.id = m.conversation_id
     WHERE m.direction = 'outbound'
       AND m.intent = ANY($1::text[])
       ${windowClause}
     ORDER BY m.created_at DESC LIMIT 10`, [LEGACY_INTENTS]);

  if (r.rowCount === 0) {
    console.log('=== SAÍDAS LEGADAS NA JANELA: ZERO ===');
    console.log('');
    return { total: 0, posPhase1: 0 };
  }

  let posPhase1 = 0;
  console.log(`=== ${r.rowCount} SAÍDAS LEGADAS NA JANELA ===`);
  for (const row of r.rows) {
    const when = new Date(row.created_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    const isPost = phase1At && new Date(row.created_at) >= phase1At;
    if (isPost) posPhase1++;
    const tag = phase1At ? (isPost ? '[PÓS-FASE1]' : '[pré-fase1]') : '';
    console.log(`  ${tag} [${row.intent}] ${when} conv=${row.conversation_id} est=${row.establishment_id} wa=${row.wa_id}`);
    console.log(`    → ${row.body}`);
  }
  console.log('');
  return { total: r.rowCount, posPhase1 };
}

async function showHumanTakeoverIssues() {
  console.log('=== CONVERSAS PEDINDO HUMANO (últimas 24h) ===');
  const r = await pool.query(`
    SELECT c.id AS conv, c.wa_id, c.establishment_id, c.human_takeover_until,
           m.created_at AS last_request, LEFT(m.body, 80) AS body
      FROM whatsapp_conversations c
      JOIN LATERAL (
        SELECT m.body, m.created_at
          FROM whatsapp_messages m
         WHERE m.conversation_id = c.id
           AND m.direction = 'inbound'
           AND m.created_at > NOW() - interval '24 hours'
           AND (LOWER(m.body) ~ '\\\\matendente\\\\M'
                OR LOWER(m.body) ~ '\\\\mhumano\\\\M'
                OR LOWER(m.body) ~ '\\\\mpessoa\\\\M')
         ORDER BY m.created_at DESC LIMIT 1
      ) m ON true
     WHERE c.updated_at > NOW() - interval '24 hours'
     ORDER BY m.created_at DESC LIMIT 8`);

  if (r.rowCount === 0) {
    console.log('  (nenhuma)');
    console.log('');
    return;
  }

  for (const row of r.rows) {
    const ativo = row.human_takeover_until && new Date(row.human_takeover_until) > new Date();
    const status = ativo ? 'TAKEOVER OK' : 'TAKEOVER AUSENTE';
    const when = new Date(row.last_request).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    console.log(`  [${status}] conv=${row.conv} est=${row.establishment_id} ${when}`);
    console.log(`    → ${row.body}`);
  }
  console.log('');
}

async function showActiveConversations() {
  console.log('=== CONVERSAS MAIS ATIVAS (últimas 2h) ===');
  const r = await pool.query(`
    SELECT c.id AS conv, c.wa_id, c.establishment_id, c.status,
           COUNT(*) FILTER (WHERE m.direction='inbound') AS in_msgs,
           COUNT(*) FILTER (WHERE m.direction='outbound') AS out_msgs,
           MAX(m.created_at) AS last_msg
      FROM whatsapp_conversations c
      JOIN whatsapp_messages m ON m.conversation_id = c.id
     WHERE m.created_at > NOW() - interval '2 hours'
     GROUP BY c.id, c.wa_id, c.establishment_id, c.status
     ORDER BY MAX(m.created_at) DESC LIMIT 5`);

  if (r.rowCount === 0) {
    console.log('  (nenhuma)');
    console.log('');
    return;
  }

  for (const row of r.rows) {
    const ageMin = Math.round((Date.now() - new Date(row.last_msg).getTime()) / 60000);
    console.log(
      `  conv=${row.conv} est=${row.establishment_id} status=${row.status} in=${row.in_msgs} out=${row.out_msgs} (última msg há ${ageMin}min)`
    );
  }
  console.log('');
}

async function showReservationsCreated(windowClause) {
  const r = await pool.query(`
    SELECT
      COUNT(*) FILTER (WHERE created_at > NOW() - interval '24 hours') AS last_24h,
      COUNT(*) FILTER (WHERE ${windowClause.replace(/^AND /, '')}) AS in_window
      FROM restaurant_reservations
     WHERE origin = 'WHATSAPP'`);

  console.log('=== RESERVAS CRIADAS PELA IA ===');
  console.log(`  Na janela analisada: ${r.rows[0].in_window}`);
  console.log(`  Últimas 24h:         ${r.rows[0].last_24h}`);
  console.log('');
}

async function main() {
  const args = parseArgs();
  const phase1At = args.phase1At ? new Date(args.phase1At) : null;

  const windowClause = args.since
    ? `AND created_at > '${args.since}'`
    : `AND created_at > NOW() - interval '${args.hours} hours'`;
  const windowClauseM = windowClause.replace(/^AND created_at/, 'AND m.created_at');
  const label = args.since ? `desde ${args.since}` : `últimas ${args.hours}h`;

  console.log(`\nHealth-check: ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })} (SP)`);
  if (phase1At) {
    console.log(`Marco Fase 1: ${phase1At.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })} (SP)`);
  }
  console.log('');

  try {
    await showConfig();
    const totals = await showWindowBreakdown(windowClause, label);
    const legacy = await showLegacySamples(windowClauseM, phase1At);
    await showHumanTakeoverIssues();
    await showActiveConversations();
    await showReservationsCreated(windowClause);

    console.log('=== VEREDITO RÁPIDO ===');
    if (totals.total === 0) {
      console.log('  Sem tráfego na janela. Roda de novo daqui a algumas horas.');
    } else if (legacy.total === 0) {
      console.log('  Caminho LEGADO sem saída na janela ✅ — agente novo está dirigindo as conversas.');
    } else if (phase1At && legacy.posPhase1 === 0) {
      console.log(`  Tem ${legacy.total} saída(s) legada(s) na janela, mas TODAS antes do marco da Fase 1.`);
      console.log('  Pós-Fase 1: ZERO saída legada ✅');
    } else {
      const qtd = phase1At ? legacy.posPhase1 : legacy.total;
      console.log(`  ATENÇÃO: ${qtd} saída(s) legada(s) ${phase1At ? 'APÓS o marco da Fase 1' : 'na janela'}.`);
      console.log('  Verifique se WHATSAPP_STUCK_RESOLVER_ENABLED=false está aplicado no Render.');
    }
    console.log('');
  } catch (err) {
    console.error('Falha no health-check:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
