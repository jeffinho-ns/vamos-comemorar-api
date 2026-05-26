/**
 * Lê (READ-ONLY) as N conversas mais recentes do WhatsApp.
 * Para cada uma, imprime as últimas 40 mensagens em ordem cronológica.
 *
 * Uso:
 *   DATABASE_URL=postgresql://... node scripts/inspect_recent_conversations.js [N]
 */
const { Pool } = require('pg');

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL não definido.');
  process.exit(1);
}

const limit = Number(process.argv[2]) || 3;

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: { rejectUnauthorized: false },
});

function fmtTs(d) {
  if (!d) return '';
  return new Date(d).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

async function main() {
  const conv = await pool.query(
    `SELECT c.id,
            c.wa_id,
            c.contact_name,
            c.establishment_id,
            c.assigned_user_id,
            c.human_takeover_until,
            c.updated_at,
            (SELECT MAX(created_at) FROM whatsapp_messages WHERE conversation_id = c.id) AS last_msg_at
       FROM whatsapp_conversations c
      ORDER BY (SELECT MAX(created_at) FROM whatsapp_messages WHERE conversation_id = c.id) DESC NULLS LAST,
               c.updated_at DESC
      LIMIT $1`,
    [limit]
  );

  console.log(`\n=== ${conv.rows.length} conversas mais recentes ===\n`);

  for (const c of conv.rows) {
    console.log('=================================================================');
    console.log(`Conversa id=${c.id} | wa_id=${c.wa_id} | contact=${c.contact_name || '(sem nome)'}`);
    console.log(`establishment_id=${c.establishment_id || 'null'} | assigned_user_id=${c.assigned_user_id || 'null'}`);
    console.log(`human_takeover_until=${fmtTs(c.human_takeover_until) || 'null'}`);
    console.log(`last_msg_at=${fmtTs(c.last_msg_at)} | updated_at=${fmtTs(c.updated_at)}`);
    console.log('=================================================================');

    const messages = await pool.query(
      `SELECT id, direction, body, intent, suggested_reply, created_at
         FROM whatsapp_messages
        WHERE conversation_id = $1
        ORDER BY created_at ASC, id ASC`,
      [c.id]
    );

    const recent = messages.rows.slice(-60);
    for (const m of recent) {
      const tag = m.direction === 'inbound' ? 'CLIENTE' : 'BOT    ';
      const intent = m.intent ? ` [${m.intent}]` : '';
      const body = String(m.body || '').replace(/\s+/g, ' ').trim();
      console.log(`[${fmtTs(m.created_at)}] ${tag}${intent}: ${body}`);
    }

    const state = await pool.query(
      `SELECT current_step, retry_count, handoff_recommended, collected_fields, reservation_context, last_validation_failure
         FROM conversation_state
        WHERE conversation_id = $1`,
      [c.id]
    );
    if (state.rows.length) {
      const s = state.rows[0];
      console.log(`\n  STATE (legado): step=${s.current_step} | retry=${s.retry_count} | handoff=${s.handoff_recommended}`);
      console.log(`  collected_fields=${JSON.stringify(s.collected_fields)}`);
      console.log(`  reservation_context=${JSON.stringify(s.reservation_context)}`);
      if (s.last_validation_failure) {
        console.log(`  last_validation_failure=${JSON.stringify(s.last_validation_failure)}`);
      }
    }

    const memory = await pool.query(
      `SELECT memory_key, memory_value, updated_at
         FROM agent_memory_entries
        WHERE conversation_id = $1
        ORDER BY updated_at DESC
        LIMIT 6`,
      [c.id]
    );
    if (memory.rows.length) {
      console.log(`\n  MEMORY (agente novo):`);
      for (const m of memory.rows) {
        console.log(`    [${fmtTs(m.updated_at)}] ${m.memory_key} = ${JSON.stringify(m.memory_value)}`);
      }
    }

    console.log('');
  }

  await pool.end();
}

main().catch((error) => {
  console.error(error);
  pool.end().finally(() => process.exit(1));
});
