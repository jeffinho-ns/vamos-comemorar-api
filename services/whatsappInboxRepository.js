/**
 * Persistência da Central WhatsApp (conversas + mensagens).
 */

async function upsertConversation(pool, { waId, contactName }) {
  const name = contactName || null;
  const r = await pool.query(
    `INSERT INTO whatsapp_conversations (wa_id, contact_name, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (wa_id) DO UPDATE SET
       contact_name = COALESCE(EXCLUDED.contact_name, whatsapp_conversations.contact_name),
       updated_at = NOW()
     RETURNING id, wa_id, contact_name, human_takeover_until, updated_at, created_at`,
    [waId, name]
  );
  return r.rows[0];
}

async function getConversationByWaId(pool, waId) {
  const r = await pool.query(
    `SELECT id, wa_id, contact_name, human_takeover_until, updated_at, created_at
     FROM whatsapp_conversations WHERE wa_id = $1`,
    [waId]
  );
  return r.rows[0] || null;
}

async function isHumanTakeoverActive(pool, waId) {
  const r = await pool.query(
    `SELECT human_takeover_until FROM whatsapp_conversations WHERE wa_id = $1`,
    [waId]
  );
  const row = r.rows[0];
  if (!row || !row.human_takeover_until) return false;
  return new Date(row.human_takeover_until) > new Date();
}

async function setHumanTakeoverHours(pool, waId, hours = 24) {
  await pool.query(
    `UPDATE whatsapp_conversations
     SET human_takeover_until = NOW() + ($2::int * interval '1 hour'),
         updated_at = NOW()
     WHERE wa_id = $1`,
    [waId, hours]
  );
  return getConversationByWaId(pool, waId);
}

async function clearHumanTakeover(pool, waId) {
  await pool.query(
    `UPDATE whatsapp_conversations
     SET human_takeover_until = NULL,
         updated_at = NOW()
     WHERE wa_id = $1`,
    [waId]
  );
  return getConversationByWaId(pool, waId);
}

async function insertMessage(pool, { conversationId, direction, body, intent, suggestedReply, rawPayload }) {
  const r = await pool.query(
    `INSERT INTO whatsapp_messages (conversation_id, direction, body, intent, suggested_reply, raw_payload)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, conversation_id, direction, body, intent, suggested_reply, created_at`,
    [conversationId, direction, body, intent || null, suggestedReply || null, rawPayload || null]
  );
  await pool.query(
    `UPDATE whatsapp_conversations SET updated_at = NOW() WHERE id = $1`,
    [conversationId]
  );
  return r.rows[0];
}

async function updateInboundAiFields(pool, messageId, { intent, suggestedReply }) {
  await pool.query(
    `UPDATE whatsapp_messages SET intent = $2, suggested_reply = $3 WHERE id = $1`,
    [messageId, intent || null, suggestedReply || null]
  );
}

async function getRecentMessagesForContext(pool, conversationId, limit = 12) {
  const r = await pool.query(
    `SELECT direction, body FROM whatsapp_messages
     WHERE conversation_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [conversationId, limit]
  );
  return r.rows.reverse();
}

async function listConversations(pool, limit = 100) {
  const r = await pool.query(
    `SELECT c.id, c.wa_id, c.contact_name, c.human_takeover_until, c.updated_at,
            lm.body AS last_body,
            lm.created_at AS last_message_at,
            lm.direction AS last_direction
     FROM whatsapp_conversations c
     LEFT JOIN LATERAL (
       SELECT body, created_at, direction
       FROM whatsapp_messages m
       WHERE m.conversation_id = c.id
       ORDER BY m.created_at DESC
       LIMIT 1
     ) lm ON true
     ORDER BY c.updated_at DESC
     LIMIT $1`,
    [limit]
  );
  return r.rows;
}

async function listMessages(pool, conversationId, limit = 200) {
  const r = await pool.query(
    `SELECT id, direction, body, intent, suggested_reply, created_at
     FROM whatsapp_messages
     WHERE conversation_id = $1
     ORDER BY created_at ASC
     LIMIT $2`,
    [conversationId, limit]
  );
  return r.rows;
}

module.exports = {
  upsertConversation,
  getConversationByWaId,
  isHumanTakeoverActive,
  setHumanTakeoverHours,
  clearHumanTakeover,
  insertMessage,
  updateInboundAiFields,
  getRecentMessagesForContext,
  listConversations,
  listMessages,
};
