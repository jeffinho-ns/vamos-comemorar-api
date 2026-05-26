/**
 * Lê (READ-ONLY) a conversa do WhatsApp com a contact_name = "Gio" (ou variações)
 * direto do banco de produção. Imprime todas as mensagens em ordem cronológica.
 *
 * Uso:
 *   DATABASE_URL=postgresql://... node scripts/inspect_gio_conversation.js
 *   ou
 *   node scripts/inspect_gio_conversation.js
 *   (se .env já tem DATABASE_URL apontando pra prod)
 */
const { Pool } = require('pg');

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL não definido. Passe a URL externa do Render.');
  process.exit(1);
}

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: { rejectUnauthorized: false },
});

async function main() {
  const conv = await pool.query(
    `SELECT c.id,
            c.wa_id,
            c.contact_name,
            c.establishment_id,
            c.assigned_user_id,
            c.human_takeover_until,
            c.updated_at
       FROM whatsapp_conversations c
      WHERE c.contact_name ILIKE '%gio%'
         OR c.wa_id ILIKE '%gio%'
      ORDER BY c.updated_at DESC
      LIMIT 10`
  );

  if (conv.rows.length === 0) {
    console.log('Nenhuma conversa encontrada com contact_name contendo "Gio".');
    await pool.end();
    return;
  }

  console.log('=== Conversas encontradas com "Gio" ===');
  console.log(JSON.stringify(conv.rows, null, 2));

  const target = conv.rows[0];
  console.log(`\n=== Detalhe da conversa mais recente (id=${target.id}, wa_id=${target.wa_id}) ===\n`);

  const messages = await pool.query(
    `SELECT id,
            direction,
            body,
            intent,
            suggested_reply,
            created_at
       FROM whatsapp_messages
      WHERE conversation_id = $1
      ORDER BY created_at ASC, id ASC`,
    [target.id]
  );

  for (const m of messages.rows) {
    const ts = new Date(m.created_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    const tag = m.direction === 'inbound' ? 'CLIENTE' : 'BOT';
    const intent = m.intent ? ` [${m.intent}]` : '';
    console.log(`[${ts}] ${tag}${intent}: ${m.body}`);
    if (m.suggested_reply && m.suggested_reply !== m.body) {
      console.log(`   (sugestao: ${m.suggested_reply})`);
    }
  }

  console.log(`\n=== ConversationState (funil legado) ===`);
  const state = await pool.query(
    `SELECT current_step, retry_count, handoff_recommended, collected_fields, reservation_context, last_validation_failure
       FROM conversation_state
      WHERE conversation_id = $1`,
    [target.id]
  );
  console.log(JSON.stringify(state.rows, null, 2));

  console.log(`\n=== AgentMemory (agente novo) ===`);
  const memory = await pool.query(
    `SELECT memory_key, memory_value, updated_at
       FROM agent_memory_entries
      WHERE conversation_id = $1
      ORDER BY updated_at DESC
      LIMIT 20`,
    [target.id]
  );
  console.log(JSON.stringify(memory.rows, null, 2));

  await pool.end();
}

main().catch((error) => {
  console.error(error);
  pool.end().finally(() => process.exit(1));
});
