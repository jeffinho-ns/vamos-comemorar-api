/**
 * Persistência da Central WhatsApp (conversas + mensagens).
 */

async function upsertConversation(pool, { waId, contactName, establishmentId = null }) {
  const name = contactName || null;
  const r = await pool.query(
    `INSERT INTO whatsapp_conversations (wa_id, contact_name, establishment_id, updated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (wa_id) DO UPDATE SET
       contact_name = COALESCE(EXCLUDED.contact_name, whatsapp_conversations.contact_name),
       establishment_id = COALESCE(EXCLUDED.establishment_id, whatsapp_conversations.establishment_id),
       updated_at = NOW()
     RETURNING id, wa_id, contact_name, establishment_id, status, assigned_user_id, assigned_at, human_takeover_until, updated_at, created_at`,
    [waId, name, establishmentId]
  );
  return r.rows[0];
}

async function getConversationByWaId(pool, waId) {
  const r = await pool.query(
    `SELECT c.id, c.wa_id, c.contact_name, c.establishment_id, p.name AS establishment_name,
            c.status, c.assigned_user_id, u.name AS assigned_user_name, c.assigned_at,
            c.human_takeover_until, c.updated_at, c.created_at
     FROM whatsapp_conversations c
     LEFT JOIN places p ON p.id = c.establishment_id
     LEFT JOIN users u ON u.id = c.assigned_user_id
     WHERE c.wa_id = $1`,
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

async function setConversationEstablishment(pool, waId, establishmentId) {
  const normalizedId = Number(establishmentId);
  if (!Number.isFinite(normalizedId) || normalizedId <= 0) {
    return getConversationByWaId(pool, waId);
  }

  await pool.query(
    `UPDATE whatsapp_conversations
     SET establishment_id = $2,
         updated_at = NOW()
     WHERE wa_id = $1`,
    [waId, normalizedId]
  );
  return getConversationByWaId(pool, waId);
}

async function updateConversationStatus(pool, waId, status) {
  await pool.query(
    `UPDATE whatsapp_conversations
     SET status = $2,
         updated_at = NOW()
     WHERE wa_id = $1`,
    [waId, status]
  );
  return getConversationByWaId(pool, waId);
}

async function assignConversation(pool, waId, userId) {
  const normalizedUserId = Number(userId);
  const hasAssignee = Number.isFinite(normalizedUserId) && normalizedUserId > 0;
  await pool.query(
    `UPDATE whatsapp_conversations
     SET assigned_user_id = $2,
         assigned_at = CASE WHEN $2 IS NULL THEN NULL ELSE NOW() END,
         updated_at = NOW()
     WHERE wa_id = $1`,
    [waId, hasAssignee ? normalizedUserId : null]
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

async function upsertContact(
  pool,
  {
    waId,
    contactName = null,
    clientEmail = null,
    birthDate = null,
    lastEstablishmentId = null,
    lastReservationId = null,
  }
) {
  const r = await pool.query(
    `INSERT INTO whatsapp_contacts (
       wa_id, contact_name, client_email, birth_date, last_establishment_id, last_reservation_id, last_seen_at, updated_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
     ON CONFLICT (wa_id) DO UPDATE SET
       contact_name = COALESCE(EXCLUDED.contact_name, whatsapp_contacts.contact_name),
       client_email = COALESCE(EXCLUDED.client_email, whatsapp_contacts.client_email),
       birth_date = COALESCE(EXCLUDED.birth_date, whatsapp_contacts.birth_date),
       last_establishment_id = COALESCE(EXCLUDED.last_establishment_id, whatsapp_contacts.last_establishment_id),
       last_reservation_id = COALESCE(EXCLUDED.last_reservation_id, whatsapp_contacts.last_reservation_id),
       last_seen_at = NOW(),
       updated_at = NOW()
     RETURNING *`,
    [waId, contactName, clientEmail, birthDate, lastEstablishmentId, lastReservationId]
  );
  return r.rows[0];
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

async function listConversations(pool, options = {}) {
  const limit = Number(options.limit) > 0 ? Number(options.limit) : 100;
  const allowedEstablishmentIds = Array.isArray(options.allowedEstablishmentIds)
    ? options.allowedEstablishmentIds
        .map((v) => Number(v))
        .filter((v) => Number.isFinite(v) && v > 0)
    : null;
  const status = typeof options.status === 'string' ? options.status.trim() : '';
  const assignee = options.assignedUserId !== undefined ? Number(options.assignedUserId) : null;

  const filters = [];
  const params = [];
  let idx = 1;

  if (allowedEstablishmentIds && allowedEstablishmentIds.length > 0) {
    filters.push(`c.establishment_id = ANY($${idx++}::int[])`);
    params.push(allowedEstablishmentIds);
  }

  if (status) {
    filters.push(`c.status = $${idx++}`);
    params.push(status);
  }

  if (Number.isFinite(assignee)) {
    if (assignee <= 0) {
      filters.push(`c.assigned_user_id IS NULL`);
    } else {
      filters.push(`c.assigned_user_id = $${idx++}`);
      params.push(assignee);
    }
  }

  const whereClause = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';
  params.push(limit);

  const r = await pool.query(
    `SELECT c.id, c.wa_id, c.contact_name, c.establishment_id, p.name AS establishment_name,
            c.status, c.assigned_user_id, u.name AS assigned_user_name, c.assigned_at,
            c.human_takeover_until, c.updated_at,
            lm.body AS last_body,
            lm.created_at AS last_message_at,
            lm.direction AS last_direction
     FROM whatsapp_conversations c
     LEFT JOIN places p ON p.id = c.establishment_id
     LEFT JOIN users u ON u.id = c.assigned_user_id
     LEFT JOIN LATERAL (
       SELECT body, created_at, direction
       FROM whatsapp_messages m
       WHERE m.conversation_id = c.id
       ORDER BY m.created_at DESC
       LIMIT 1
     ) lm ON true
     ${whereClause}
     ORDER BY c.updated_at DESC
     LIMIT $${idx}`,
    params
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

async function listContacts(pool, options = {}) {
  const limit = Number(options.limit) > 0 ? Number(options.limit) : 500;
  const allowedEstablishmentIds = Array.isArray(options.allowedEstablishmentIds)
    ? options.allowedEstablishmentIds
        .map((v) => Number(v))
        .filter((v) => Number.isFinite(v) && v > 0)
    : null;
  const establishmentId = Number(options.establishmentId);
  const marketingOptIn =
    options.marketingOptIn === true || options.marketingOptIn === false
      ? options.marketingOptIn
      : null;
  const search = typeof options.search === 'string' ? options.search.trim() : '';

  const filters = [];
  const params = [];
  let idx = 1;

  if (allowedEstablishmentIds && allowedEstablishmentIds.length > 0) {
    filters.push(`c.last_establishment_id = ANY($${idx++}::int[])`);
    params.push(allowedEstablishmentIds);
  }

  if (Number.isFinite(establishmentId) && establishmentId > 0) {
    filters.push(`c.last_establishment_id = $${idx++}`);
    params.push(establishmentId);
  }

  if (marketingOptIn !== null) {
    filters.push(`c.marketing_opt_in = $${idx++}`);
    params.push(marketingOptIn);
  }

  if (search) {
    filters.push(`(c.contact_name ILIKE $${idx} OR c.client_email ILIKE $${idx} OR c.wa_id ILIKE $${idx})`);
    params.push(`%${search}%`);
    idx += 1;
  }

  const whereClause = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';
  params.push(limit);

  const r = await pool.query(
    `SELECT c.id, c.wa_id, c.contact_name, c.client_email, c.birth_date,
            c.last_establishment_id, p.name AS last_establishment_name,
            c.last_reservation_id, c.marketing_opt_in, c.marketing_opt_in_at,
            c.first_seen_at, c.last_seen_at
     FROM whatsapp_contacts c
     LEFT JOIN places p ON p.id = c.last_establishment_id
     ${whereClause}
     ORDER BY c.last_seen_at DESC
     LIMIT $${idx}`,
    params
  );
  return r.rows;
}

module.exports = {
  upsertConversation,
  getConversationByWaId,
  isHumanTakeoverActive,
  setHumanTakeoverHours,
  clearHumanTakeover,
  setConversationEstablishment,
  updateConversationStatus,
  assignConversation,
  insertMessage,
  updateInboundAiFields,
  upsertContact,
  getRecentMessagesForContext,
  listConversations,
  listMessages,
  listContacts,
};
