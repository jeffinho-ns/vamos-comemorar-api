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
  const contactStatus = typeof options.contactStatus === 'string' ? options.contactStatus.trim() : '';
  const tagsAny = Array.isArray(options.tagsAny)
    ? options.tagsAny.map((t) => String(t || '').trim()).filter(Boolean)
    : [];
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

  if (contactStatus) {
    filters.push(`c.contact_status = $${idx++}`);
    params.push(contactStatus);
  }

  if (tagsAny.length > 0) {
    filters.push(`c.tags && $${idx++}::text[]`);
    params.push(tagsAny);
  }

  if (search) {
    filters.push(`(c.contact_name ILIKE $${idx} OR c.client_email ILIKE $${idx} OR c.wa_id ILIKE $${idx})`);
    params.push(`%${search}%`);
    idx += 1;
  }

  const minContactId = Number(options.minContactId);
  if (Number.isFinite(minContactId) && minContactId >= 0) {
    filters.push(`c.id > $${idx++}`);
    params.push(minContactId);
  }

  const whereClause = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';
  const orderBy =
    options.orderBy === 'id_asc' ? 'c.id ASC' : 'c.last_seen_at DESC';
  params.push(limit);

  const r = await pool.query(
    `SELECT c.id, c.wa_id, c.contact_name, c.client_email, c.birth_date,
            c.last_establishment_id, p.name AS last_establishment_name,
            c.last_reservation_id, c.marketing_opt_in, c.marketing_opt_in_at,
            c.contact_status, c.tags, c.notes,
            c.first_seen_at, c.last_seen_at
     FROM whatsapp_contacts c
     LEFT JOIN places p ON p.id = c.last_establishment_id
     ${whereClause}
     ORDER BY ${orderBy}
     LIMIT $${idx}`,
    params
  );
  return r.rows;
}

/**
 * Conta contatos com os mesmos filtros de listContacts (sem paginação).
 */
async function countContacts(pool, options = {}) {
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
  const contactStatus = typeof options.contactStatus === 'string' ? options.contactStatus.trim() : '';
  const tagsAny = Array.isArray(options.tagsAny)
    ? options.tagsAny.map((t) => String(t || '').trim()).filter(Boolean)
    : [];
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

  if (contactStatus) {
    filters.push(`c.contact_status = $${idx++}`);
    params.push(contactStatus);
  }

  if (tagsAny.length > 0) {
    filters.push(`c.tags && $${idx++}::text[]`);
    params.push(tagsAny);
  }

  if (search) {
    filters.push(`(c.contact_name ILIKE $${idx} OR c.client_email ILIKE $${idx} OR c.wa_id ILIKE $${idx})`);
    params.push(`%${search}%`);
    idx += 1;
  }

  const minContactId = Number(options.minContactId);
  if (Number.isFinite(minContactId) && minContactId >= 0) {
    filters.push(`c.id > $${idx++}`);
    params.push(minContactId);
  }

  const whereClause = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';

  const r = await pool.query(
    `SELECT COUNT(*)::int AS n FROM whatsapp_contacts c ${whereClause}`,
    params
  );
  return r.rows[0]?.n || 0;
}

async function getContactById(pool, contactId) {
  const normalizedId = Number(contactId);
  if (!Number.isFinite(normalizedId) || normalizedId <= 0) return null;
  const r = await pool.query(
    `SELECT c.id, c.wa_id, c.contact_name, c.client_email, c.birth_date,
            c.last_establishment_id, p.name AS last_establishment_name,
            c.last_reservation_id, c.marketing_opt_in, c.marketing_opt_in_at,
            c.contact_status, c.tags, c.notes,
            c.first_seen_at, c.last_seen_at
     FROM whatsapp_contacts c
     LEFT JOIN places p ON p.id = c.last_establishment_id
     WHERE c.id = $1`,
    [normalizedId]
  );
  return r.rows[0] || null;
}

async function updateContactById(
  pool,
  contactId,
  { contactName, clientEmail, marketingOptIn, contactStatus, tags, notes }
) {
  const normalizedId = Number(contactId);
  if (!Number.isFinite(normalizedId) || normalizedId <= 0) return null;

  const r = await pool.query(
    `UPDATE whatsapp_contacts
     SET contact_name = COALESCE($2, contact_name),
         client_email = COALESCE($3, client_email),
         marketing_opt_in = COALESCE($4, marketing_opt_in),
         marketing_opt_in_at = CASE
           WHEN $4 IS TRUE THEN NOW()
           WHEN $4 IS FALSE THEN NULL
           ELSE marketing_opt_in_at
         END,
         contact_status = COALESCE($5, contact_status),
         tags = COALESCE($6, tags),
         notes = COALESCE($7, notes),
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [
      normalizedId,
      contactName ?? null,
      clientEmail ?? null,
      marketingOptIn ?? null,
      contactStatus ?? null,
      Array.isArray(tags) ? tags : null,
      notes ?? null,
    ]
  );
  return r.rows[0] || null;
}

async function listCampaigns(pool, options = {}) {
  const allowedEstablishmentIds = Array.isArray(options.allowedEstablishmentIds)
    ? options.allowedEstablishmentIds
        .map((v) => Number(v))
        .filter((v) => Number.isFinite(v) && v > 0)
    : null;
  const establishmentId = Number(options.establishmentId);

  const filters = [];
  const params = [];
  let idx = 1;

  if (allowedEstablishmentIds && allowedEstablishmentIds.length > 0) {
    filters.push(`c.establishment_id = ANY($${idx++}::int[])`);
    params.push(allowedEstablishmentIds);
  }
  if (Number.isFinite(establishmentId) && establishmentId > 0) {
    filters.push(`c.establishment_id = $${idx++}`);
    params.push(establishmentId);
  }

  const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

  const r = await pool.query(
    `SELECT c.id, c.establishment_id, p.name AS establishment_name, c.name,
            c.message_template, c.target_filters, c.is_active,
            c.created_by, c.updated_by, c.created_at, c.updated_at
     FROM whatsapp_campaigns c
     LEFT JOIN places p ON p.id = c.establishment_id
     ${whereClause}
     ORDER BY c.updated_at DESC`
    ,
    params
  );
  return r.rows;
}

async function getCampaignById(pool, campaignId) {
  const normalizedId = Number(campaignId);
  if (!Number.isFinite(normalizedId) || normalizedId <= 0) return null;
  const r = await pool.query(
    `SELECT c.id, c.establishment_id, p.name AS establishment_name, c.name,
            c.message_template, c.target_filters, c.is_active,
            c.created_by, c.updated_by, c.created_at, c.updated_at
     FROM whatsapp_campaigns c
     LEFT JOIN places p ON p.id = c.establishment_id
     WHERE c.id = $1`,
    [normalizedId]
  );
  return r.rows[0] || null;
}

async function createCampaign(pool, { establishmentId, name, messageTemplate, targetFilters, userId }) {
  const r = await pool.query(
    `INSERT INTO whatsapp_campaigns (
       establishment_id, name, message_template, target_filters, created_by, updated_by
     )
     VALUES ($1, $2, $3, $4::jsonb, $5, $5)
     RETURNING *`,
    [establishmentId, name, messageTemplate, JSON.stringify(targetFilters || {}), userId || null]
  );
  return r.rows[0];
}

async function updateCampaignById(
  pool,
  campaignId,
  { name, messageTemplate, targetFilters, isActive, userId }
) {
  const normalizedId = Number(campaignId);
  if (!Number.isFinite(normalizedId) || normalizedId <= 0) return null;
  const r = await pool.query(
    `UPDATE whatsapp_campaigns
     SET name = COALESCE($2, name),
         message_template = COALESCE($3, message_template),
         target_filters = COALESCE($4::jsonb, target_filters),
         is_active = COALESCE($5, is_active),
         updated_by = $6,
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [
      normalizedId,
      name ?? null,
      messageTemplate ?? null,
      targetFilters ? JSON.stringify(targetFilters) : null,
      isActive ?? null,
      userId || null,
    ]
  );
  return r.rows[0] || null;
}

async function deleteCampaignById(pool, campaignId) {
  const normalizedId = Number(campaignId);
  if (!Number.isFinite(normalizedId) || normalizedId <= 0) return null;
  const r = await pool.query(
    `DELETE FROM whatsapp_campaigns WHERE id = $1 RETURNING id, establishment_id`,
    [normalizedId]
  );
  return r.rows[0] || null;
}

function campaignAudienceQueryOptions(campaign, options = {}) {
  const filters = campaign.target_filters && typeof campaign.target_filters === 'object'
    ? campaign.target_filters
    : {};
  const tags = Array.isArray(filters.tags)
    ? filters.tags.map((t) => String(t || '').trim()).filter(Boolean)
    : [];
  const contactStatus = typeof filters.contact_status === 'string' ? filters.contact_status.trim() : '';
  const marketingOptIn =
    filters.marketing_opt_in === true || filters.marketing_opt_in === false
      ? filters.marketing_opt_in
      : null;

  return {
    limit: Number(options.limit) > 0 ? Number(options.limit) : 5000,
    establishmentId: Number(campaign.establishment_id),
    allowedEstablishmentIds: options.allowedEstablishmentIds || null,
    tagsAny: tags,
    contactStatus,
    marketingOptIn,
    search: typeof options.search === 'string' ? options.search : '',
    minContactId: options.minContactId,
    orderBy: options.orderBy,
  };
}

async function buildCampaignAudience(pool, campaign, options = {}) {
  if (!campaign) return [];
  return listContacts(pool, campaignAudienceQueryOptions(campaign, options));
}

async function countCampaignAudience(pool, campaign, options = {}) {
  if (!campaign) return 0;
  const q = campaignAudienceQueryOptions(campaign, options);
  return countContacts(pool, q);
}

async function getContactByWaId(pool, waId) {
  const r = await pool.query(
    `SELECT c.id, c.wa_id, c.contact_name, c.client_email, c.birth_date,
            c.last_establishment_id, p.name AS last_establishment_name,
            c.last_reservation_id, c.marketing_opt_in, c.marketing_opt_in_at,
            c.contact_status, c.tags, c.notes,
            c.first_seen_at, c.last_seen_at
     FROM whatsapp_contacts c
     LEFT JOIN places p ON p.id = c.last_establishment_id
     WHERE c.wa_id = $1`,
    [waId]
  );
  return r.rows[0] || null;
}

async function getWhatsappSummaryReport(pool, options = {}) {
  const establishmentId = Number(options.establishmentId);
  const hasEstablishmentFilter = Number.isFinite(establishmentId) && establishmentId > 0;
  const startDate = typeof options.startDate === 'string' ? options.startDate : null;
  const endDate = typeof options.endDate === 'string' ? options.endDate : null;

  const params = [];
  let idx = 1;
  const convFilters = [];
  const contactFilters = [];
  const reservationFilters = [];

  if (hasEstablishmentFilter) {
    convFilters.push(`establishment_id = $${idx}`);
    contactFilters.push(`last_establishment_id = $${idx}`);
    reservationFilters.push(`establishment_id = $${idx}`);
    params.push(establishmentId);
    idx += 1;
  }

  if (startDate) {
    convFilters.push(`updated_at >= $${idx}::date`);
    contactFilters.push(`last_seen_at >= $${idx}::date`);
    reservationFilters.push(`created_at >= $${idx}::date`);
    params.push(startDate);
    idx += 1;
  }

  if (endDate) {
    convFilters.push(`updated_at < ($${idx}::date + interval '1 day')`);
    contactFilters.push(`last_seen_at < ($${idx}::date + interval '1 day')`);
    reservationFilters.push(`created_at < ($${idx}::date + interval '1 day')`);
    params.push(endDate);
    idx += 1;
  }

  const convWhere = convFilters.length ? `WHERE ${convFilters.join(' AND ')}` : '';
  const contactWhere = contactFilters.length ? `WHERE ${contactFilters.join(' AND ')}` : '';
  const reservationWhere = reservationFilters.length
    ? `AND ${reservationFilters.join(' AND ')}`
    : '';

  const summary = await pool.query(
    `SELECT
      (SELECT COUNT(*)::int FROM whatsapp_conversations ${convWhere}) AS conversations_total,
      (SELECT COUNT(*)::int FROM whatsapp_conversations ${convWhere ? convWhere + ' AND' : 'WHERE'} status = 'resolved') AS conversations_resolved,
      (SELECT COUNT(*)::int FROM whatsapp_contacts ${contactWhere}) AS contacts_total,
      (SELECT COUNT(*)::int FROM whatsapp_contacts ${contactWhere ? contactWhere + ' AND' : 'WHERE'} marketing_opt_in = TRUE) AS contacts_opt_in,
      (SELECT COUNT(*)::int FROM restaurant_reservations WHERE origin = 'WHATSAPP' ${reservationWhere}) AS reservations_whatsapp`,
    params
  );

  return summary.rows[0] || {
    conversations_total: 0,
    conversations_resolved: 0,
    contacts_total: 0,
    contacts_opt_in: 0,
    reservations_whatsapp: 0,
  };
}

async function createCampaignBatch(pool, {
  campaignId,
  totalPlanned,
  chunkSize,
  delayMs,
  startedBy,
}) {
  const r = await pool.query(
    `INSERT INTO whatsapp_campaign_batches (
       campaign_id, status, total_planned, chunk_size, delay_ms, started_by, updated_at
     )
     VALUES ($1, 'queued', $2, $3, $4, $5, NOW())
     RETURNING *`,
    [campaignId, totalPlanned, chunkSize, delayMs, startedBy || null]
  );
  return r.rows[0];
}

async function getCampaignBatchById(pool, batchId) {
  const id = Number(batchId);
  if (!Number.isFinite(id) || id <= 0) return null;
  const r = await pool.query(
    `SELECT b.*, c.name AS campaign_name, c.establishment_id
     FROM whatsapp_campaign_batches b
     JOIN whatsapp_campaigns c ON c.id = b.campaign_id
     WHERE b.id = $1`,
    [id]
  );
  return r.rows[0] || null;
}

async function listCampaignBatchesForCampaign(pool, campaignId, limit = 30) {
  const r = await pool.query(
    `SELECT * FROM whatsapp_campaign_batches
     WHERE campaign_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [campaignId, limit]
  );
  return r.rows;
}

async function updateCampaignBatchFields(pool, batchId, patch) {
  const id = Number(batchId);
  if (!Number.isFinite(id) || id <= 0) return null;
  const sets = [];
  const params = [];
  let idx = 1;

  const add = (col, val) => {
    sets.push(`${col} = $${idx++}`);
    params.push(val);
  };

  if (patch.status !== undefined) add('status', patch.status);
  if (patch.cursorLastContactId !== undefined) add('cursor_last_contact_id', patch.cursorLastContactId);
  if (patch.processedCount !== undefined) add('processed_count', patch.processedCount);
  if (patch.sentOk !== undefined) add('sent_ok', patch.sentOk);
  if (patch.sentFail !== undefined) add('sent_fail', patch.sentFail);
  if (patch.skippedCount !== undefined) add('skipped_count', patch.skippedCount);
  if (patch.errorMessage !== undefined) add('error_message', patch.errorMessage);
  if (patch.completedAt !== undefined) add('completed_at', patch.completedAt);

  if (sets.length === 0) return getCampaignBatchById(pool, batchId);

  sets.push('updated_at = NOW()');
  params.push(id);
  const wherePos = idx;

  const r = await pool.query(
    `UPDATE whatsapp_campaign_batches SET ${sets.join(', ')} WHERE id = $${wherePos} RETURNING *`,
    params
  );
  return r.rows[0] || null;
}

async function insertCampaignSendLog(pool, {
  batchId,
  contactId,
  waId,
  status,
  errorMessage,
  meta,
}) {
  const r = await pool.query(
    `INSERT INTO whatsapp_campaign_send_logs (batch_id, contact_id, wa_id, status, error_message, meta)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, created_at`,
    [batchId, contactId || null, waId, status, errorMessage || null, meta || null]
  );
  return r.rows[0];
}

async function listCampaignSendLogs(pool, { batchId, limit = 100, offset = 0 }) {
  const r = await pool.query(
    `SELECT id, batch_id, contact_id, wa_id, status, error_message, meta, created_at
     FROM whatsapp_campaign_send_logs
     WHERE batch_id = $1
     ORDER BY id DESC
     LIMIT $2 OFFSET $3`,
    [batchId, limit, offset]
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
  getContactById,
  updateContactById,
  listCampaigns,
  getCampaignById,
  createCampaign,
  updateCampaignById,
  deleteCampaignById,
  buildCampaignAudience,
  countContacts,
  countCampaignAudience,
  getContactByWaId,
  getWhatsappSummaryReport,
  createCampaignBatch,
  getCampaignBatchById,
  listCampaignBatchesForCampaign,
  updateCampaignBatchFields,
  insertCampaignSendLog,
  listCampaignSendLogs,
};
