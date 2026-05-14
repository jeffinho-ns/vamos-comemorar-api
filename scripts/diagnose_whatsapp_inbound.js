require('dotenv').config();
const pool = require('../config/database');

async function main() {
  const conversations = await pool.query(
    `SELECT c.wa_id,
            c.contact_name,
            c.human_takeover_until,
            c.updated_at,
            cs.current_step,
            cs.handoff_recommended
       FROM whatsapp_conversations c
       LEFT JOIN conversation_state cs ON cs.conversation_id = c.id
      ORDER BY c.updated_at DESC
      LIMIT 10`
  );

  const messages = await pool.query(
    `SELECT wm.id,
            wm.direction,
            wm.body,
            wm.intent,
            wm.created_at,
            c.wa_id
       FROM whatsapp_messages wm
       JOIN whatsapp_conversations c ON c.id = wm.conversation_id
      ORDER BY wm.created_at DESC
      LIMIT 20`
  );

  const dedup = await pool.query(
    `SELECT provider_message_id, wa_id, received_at
       FROM whatsapp_message_dedup
      ORDER BY received_at DESC
      LIMIT 15`
  );

  console.log(JSON.stringify({ conversations: conversations.rows, messages: messages.rows, dedup: dedup.rows }, null, 2));
  await pool.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
