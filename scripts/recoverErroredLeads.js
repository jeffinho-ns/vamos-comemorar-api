#!/usr/bin/env node
/**
 * Recupera clientes impactados por AGENT_ERROR em janela recente.
 *
 * Uso:
 *   node scripts/recoverErroredLeads.js --hours=12
 *   node scripts/recoverErroredLeads.js --hours=12 --apply --limit=30 --mode=human
 *
 * Modo padrao: dry-run (nao envia mensagens).
 * --apply envia mensagem e registra outbound no historico.
 * --mode=human ativa takeover por 24h para o time fechar manualmente.
 */

require('dotenv').config();
const pool = require('../config/database');
const outboundGateway = require('../services/messaging/outboundGateway');
const inbox = require('../services/whatsappInboxRepository');

function parseArgs() {
  const args = {
    hours: 12,
    limit: 40,
    apply: false,
    mode: 'human',
  };
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith('--hours=')) args.hours = Number(arg.split('=')[1]) || 12;
    else if (arg.startsWith('--limit=')) args.limit = Number(arg.split('=')[1]) || 40;
    else if (arg === '--apply') args.apply = true;
    else if (arg.startsWith('--mode=')) args.mode = String(arg.split('=')[1] || 'human').trim();
  }
  if (!['human', 'ai'].includes(args.mode)) args.mode = 'human';
  return args;
}

function buildRecoveryMessage(mode = 'human') {
  if (mode === 'human') {
    return (
      'Oi! Tivemos uma instabilidade mais cedo e sua conversa pode ter parado no meio. ' +
      'Pra voce nao perder tempo, ja encaminhei seu atendimento para uma pessoa da equipe. ' +
      'Se ainda quiser fechar sua reserva, me responde aqui com "quero continuar" que seguimos agora.'
    );
  }
  return (
    'Oi! Tivemos uma instabilidade mais cedo e sua conversa pode ter parado no meio. ' +
    'Se voce ainda quiser fechar sua reserva, me manda: data, horario e quantidade de pessoas, ' +
    'que eu continuo com prioridade agora.'
  );
}

async function getCandidates(hours, limit) {
  const safeHours = Number.isFinite(hours) && hours > 0 ? hours : 12;
  const safeLimit = Number.isFinite(limit) && limit > 0 ? limit : 40;

  const q = await pool.query(
    `
    WITH recent_errors AS (
      SELECT
        m.conversation_id,
        COUNT(*)::int AS err_count,
        MAX(m.created_at) AS last_error_at
      FROM whatsapp_messages m
      WHERE m.direction = 'outbound'
        AND m.intent = 'AGENT_ERROR'
        AND m.created_at > NOW() - (($1::text || ' hours')::interval)
      GROUP BY m.conversation_id
    )
    SELECT
      c.id AS conversation_id,
      c.wa_id,
      c.establishment_id,
      c.human_takeover_until,
      re.err_count,
      re.last_error_at,
      lo.intent AS last_outbound_intent,
      lo.created_at AS last_outbound_at,
      li.created_at AS last_inbound_at,
      COALESCE(last_rec.sent_at, to_timestamp(0)) AS last_recovery_at
    FROM recent_errors re
    JOIN whatsapp_conversations c ON c.id = re.conversation_id
    LEFT JOIN LATERAL (
      SELECT m.intent, m.created_at
      FROM whatsapp_messages m
      WHERE m.conversation_id = c.id
        AND m.direction = 'outbound'
      ORDER BY m.created_at DESC
      LIMIT 1
    ) lo ON true
    LEFT JOIN LATERAL (
      SELECT m.created_at
      FROM whatsapp_messages m
      WHERE m.conversation_id = c.id
        AND m.direction = 'inbound'
      ORDER BY m.created_at DESC
      LIMIT 1
    ) li ON true
    LEFT JOIN LATERAL (
      SELECT m.created_at AS sent_at
      FROM whatsapp_messages m
      WHERE m.conversation_id = c.id
        AND m.direction = 'outbound'
        AND m.intent = 'RECOVERY_REENGAGE'
      ORDER BY m.created_at DESC
      LIMIT 1
    ) last_rec ON true
    WHERE c.establishment_id = 7
      AND lo.intent = 'AGENT_ERROR'
      AND (last_rec.sent_at IS NULL OR last_rec.sent_at < re.last_error_at)
    ORDER BY re.last_error_at DESC
    LIMIT $2
    `,
    [safeHours, safeLimit]
  );

  return q.rows;
}

async function persistOutbound(conversationId, body, intent, rawPayload) {
  await inbox.insertMessage(pool, {
    conversationId,
    direction: 'outbound',
    body,
    intent,
    suggestedReply: null,
    rawPayload,
  });
}

async function main() {
  const args = parseArgs();
  const message = buildRecoveryMessage(args.mode);

  try {
    const candidates = await getCandidates(args.hours, args.limit);
    console.log(`\nCandidatos para recuperacao (Highline, ${args.hours}h): ${candidates.length}`);
    for (const c of candidates) {
      const takeoverActive = c.human_takeover_until && new Date(c.human_takeover_until) > new Date();
      console.log(
        `- conv=${c.conversation_id} wa=${c.wa_id} err=${c.err_count} lastError=${new Date(c.last_error_at).toISOString()} takeoverAtivo=${Boolean(takeoverActive)}`
      );
    }

    if (!args.apply) {
      console.log('\nDry-run: nenhuma mensagem enviada. Use --apply para executar.');
      return;
    }

    let sent = 0;
    let skipped = 0;

    for (const c of candidates) {
      try {
        if (!c.wa_id) {
          skipped += 1;
          continue;
        }

        if (args.mode === 'human') {
          await inbox.setHumanTakeoverHours(pool, c.wa_id, 24);
          await inbox.updateConversationStatus(pool, c.wa_id, 'in_progress');
        }

        await outboundGateway.sendText(c.wa_id, message, {
          source: 'recover_errored_leads',
          mode: args.mode,
          conversationId: c.conversation_id,
        });
        await persistOutbound(c.conversation_id, message, 'RECOVERY_REENGAGE', {
          source: 'recover_errored_leads',
          mode: args.mode,
          last_error_at: c.last_error_at,
          err_count: c.err_count,
        });
        sent += 1;
      } catch (error) {
        skipped += 1;
        console.warn(
          `[recoverErroredLeads] falha conv=${c.conversation_id} wa=${c.wa_id}: ${error.message}`
        );
      }
    }

    console.log(`\nRecuperacao concluida: enviados=${sent} pulados=${skipped}`);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error('Falha no recoverErroredLeads:', error.message);
  process.exitCode = 1;
});

