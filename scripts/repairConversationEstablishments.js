#!/usr/bin/env node
/**
 * Restaura whatsapp_conversations.establishment_id a partir da memória do agente
 * ou do funil legado (conversation_state), quando campanhas de marketing
 * reatribuíram conversas existentes para outro estabelecimento.
 *
 *   node scripts/repairConversationEstablishments.js
 *   node scripts/repairConversationEstablishments.js --dry-run
 *   node scripts/repairConversationEstablishments.js --campaign-establishment-id=1
 */
require('dotenv').config();
const pool = require('../config/database');

function parseArgs() {
  const out = { dryRun: false, campaignEstablishmentId: null };
  for (const arg of process.argv.slice(2)) {
    if (arg === '--dry-run') out.dryRun = true;
    else if (arg.startsWith('--campaign-establishment-id=')) {
      out.campaignEstablishmentId = Number(arg.split('=')[1]);
    }
  }
  return out;
}

async function main() {
  const { dryRun, campaignEstablishmentId } = parseArgs();

  const filters = [
    `EXISTS (
       SELECT 1 FROM whatsapp_messages m
        WHERE m.conversation_id = wc.id
          AND m.intent IN ('AGENT_REPLY', 'PROCESS_RESERVATION', 'HUMAN_REQUESTED', 'B2B_HANDOFF', 'GUEST_LIST_LINK')
     )`,
  ];
  const params = [];

  if (Number.isFinite(campaignEstablishmentId) && campaignEstablishmentId > 0) {
    params.push(campaignEstablishmentId);
    filters.push(`wc.establishment_id = $${params.length}`);
  }

  const sql = `
    SELECT wc.id,
           wc.wa_id,
           wc.establishment_id AS current_establishment_id,
           p.name AS current_establishment_name,
           COALESCE(
             NULLIF(acc.working_state->>'establishment_id', '')::int,
             NULLIF(cs.collected_fields->>'establishment_id', '')::int
           ) AS inferred_establishment_id,
           ip.name AS inferred_establishment_name
      FROM whatsapp_conversations wc
      LEFT JOIN agent_conversation_context acc ON acc.conversation_id = wc.id
      LEFT JOIN conversation_state cs ON cs.conversation_id = wc.id
      LEFT JOIN places p ON p.id = wc.establishment_id
      LEFT JOIN places ip ON ip.id = COALESCE(
             NULLIF(acc.working_state->>'establishment_id', '')::int,
             NULLIF(cs.collected_fields->>'establishment_id', '')::int
           )
     WHERE ${filters.join(' AND ')}
       AND COALESCE(
             NULLIF(acc.working_state->>'establishment_id', '')::int,
             NULLIF(cs.collected_fields->>'establishment_id', '')::int
           ) IS NOT NULL
       AND COALESCE(
             NULLIF(acc.working_state->>'establishment_id', '')::int,
             NULLIF(cs.collected_fields->>'establishment_id', '')::int
           ) <> wc.establishment_id
     ORDER BY wc.id ASC
  `;

  const result = await pool.query(sql, params);
  const rows = result.rows || [];

  if (!rows.length) {
    console.log('Nenhuma conversa para reparar.');
    await pool.end?.();
    return;
  }

  console.log(`Encontradas ${rows.length} conversa(s) com estabelecimento inconsistente:\n`);
  for (const row of rows.slice(0, 30)) {
    console.log(
      `  wa_id=${row.wa_id} atual=${row.current_establishment_name || row.current_establishment_id} -> inferido=${row.inferred_establishment_name || row.inferred_establishment_id}`
    );
  }
  if (rows.length > 30) {
    console.log(`  ... e mais ${rows.length - 30}`);
  }

  if (dryRun) {
    console.log('\n(dry-run — nenhuma alteração feita)');
    await pool.end?.();
    return;
  }

  const update = await pool.query(
    `UPDATE whatsapp_conversations wc
        SET establishment_id = src.inferred_establishment_id,
            updated_at = NOW()
       FROM (
         SELECT wc2.id,
                COALESCE(
                  NULLIF(acc.working_state->>'establishment_id', '')::int,
                  NULLIF(cs.collected_fields->>'establishment_id', '')::int
                ) AS inferred_establishment_id
           FROM whatsapp_conversations wc2
           LEFT JOIN agent_conversation_context acc ON acc.conversation_id = wc2.id
           LEFT JOIN conversation_state cs ON cs.conversation_id = wc2.id
          WHERE ${filters.join(' AND ').replace(/wc\./g, 'wc2.')}
            AND COALESCE(
                  NULLIF(acc.working_state->>'establishment_id', '')::int,
                  NULLIF(cs.collected_fields->>'establishment_id', '')::int
                ) IS NOT NULL
            AND COALESCE(
                  NULLIF(acc.working_state->>'establishment_id', '')::int,
                  NULLIF(cs.collected_fields->>'establishment_id', '')::int
                ) <> wc2.establishment_id
       ) src
      WHERE wc.id = src.id
      RETURNING wc.wa_id, wc.establishment_id`,
    params
  );

  console.log(`\nReparadas ${update.rowCount} conversa(s).`);
  await pool.end?.();
}

main().catch(async (error) => {
  console.error('[repairConversationEstablishments]', error);
  try {
    await pool.end?.();
  } catch (_) {
    /* ignore */
  }
  process.exit(1);
});
