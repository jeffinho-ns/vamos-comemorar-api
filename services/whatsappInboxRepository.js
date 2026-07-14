/**
 * Persistência da Central WhatsApp (conversas + mensagens).
 */

async function resolveOrganizationIdForEstablishment(pool, establishmentId) {
  const placeId = Number(establishmentId);
  if (!Number.isFinite(placeId) || placeId <= 0) return null;
  const r = await pool.query(
    `SELECT organization_id
       FROM meu_backup_db.establishments
      WHERE legacy_place_id = $1 OR legacy_bar_id = $1
      ORDER BY CASE WHEN legacy_place_id = $1 THEN 0 ELSE 1 END
      LIMIT 1`,
    [placeId],
  );
  const org = Number(r.rows[0]?.organization_id);
  return Number.isFinite(org) && org > 0 ? org : null;
}

async function upsertConversation(pool, { waId, contactName, establishmentId = null }) {
  const name = contactName || null;
  const orgId = await resolveOrganizationIdForEstablishment(pool, establishmentId);
  const r = await pool.query(
    `INSERT INTO whatsapp_conversations (wa_id, contact_name, establishment_id, organization_id, updated_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (wa_id) DO UPDATE SET
       contact_name = COALESCE(EXCLUDED.contact_name, whatsapp_conversations.contact_name),
       -- Preserva a casa já vinculada (ex.: Highline). Campanhas/outbound não devem
       -- reatribuir conversas existentes para outro estabelecimento.
       establishment_id = COALESCE(whatsapp_conversations.establishment_id, EXCLUDED.establishment_id),
       organization_id = COALESCE(
         whatsapp_conversations.organization_id,
         EXCLUDED.organization_id
       ),
       updated_at = NOW()
     RETURNING id, wa_id, contact_name, establishment_id, organization_id, status, assigned_user_id, assigned_at, human_takeover_until, updated_at, created_at`,
    [waId, name, establishmentId, orgId]
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

/** Pausa a IA até o operador clicar em "Retornar para IA" no painel. */
async function setHumanTakeoverUntilManualResume(pool, waId) {
  await pool.query(
    `UPDATE whatsapp_conversations
     SET human_takeover_until = '2099-12-31 23:59:59+00'::timestamptz,
         updated_at = NOW()
     WHERE wa_id = $1`,
    [waId]
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

  const orgId = await resolveOrganizationIdForEstablishment(pool, normalizedId);
  await pool.query(
    `UPDATE whatsapp_conversations
     SET establishment_id = $2,
         organization_id = COALESCE($3, organization_id),
         updated_at = NOW()
     WHERE wa_id = $1`,
    [waId, normalizedId, orgId]
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

async function resolveOrganizationIdForConversation(pool, conversationId) {
  const r = await pool.query(
    `SELECT c.organization_id AS conv_org_id,
            e.organization_id AS est_org_id
       FROM whatsapp_conversations c
       LEFT JOIN meu_backup_db.establishments e
         ON e.legacy_place_id = c.establishment_id
         OR e.legacy_bar_id = c.establishment_id
      WHERE c.id = $1
      LIMIT 1`,
    [conversationId],
  );
  const row = r.rows[0];
  if (!row) return null;
  const convOrg = Number(row.conv_org_id);
  if (Number.isFinite(convOrg) && convOrg > 0) return convOrg;
  const estOrg = Number(row.est_org_id);
  if (Number.isFinite(estOrg) && estOrg > 0) {
    await pool.query(
      `UPDATE whatsapp_conversations
          SET organization_id = $2
        WHERE id = $1 AND organization_id IS NULL`,
      [conversationId, estOrg],
    );
    return estOrg;
  }
  return null;
}

async function insertMessage(
  pool,
  {
    conversationId,
    direction,
    body,
    intent,
    suggestedReply,
    rawPayload,
    messageType,
    mediaUrl,
    mediaMime,
    mediaPublicId,
  }
) {
  const organizationId = await resolveOrganizationIdForConversation(pool, conversationId);
  let resolvedOrgId = organizationId;
  if (!resolvedOrgId) {
    const ctx = await pool.query(
      `SELECT NULLIF(current_setting('app.current_org', true), '')::integer AS org_id`,
    );
    const fromSession = Number(ctx.rows[0]?.org_id);
    if (Number.isFinite(fromSession) && fromSession > 0) {
      resolvedOrgId = fromSession;
    }
  }
  const r = await pool.query(
    `INSERT INTO whatsapp_messages
       (conversation_id, direction, body, intent, suggested_reply, raw_payload, message_type, media_url, media_mime, media_public_id, organization_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING id, conversation_id, direction, body, intent, suggested_reply,
               message_type, media_url, media_mime, created_at`,
    [
      conversationId,
      direction,
      body,
      intent || null,
      suggestedReply || null,
      rawPayload || null,
      messageType || 'text',
      mediaUrl || null,
      mediaMime || null,
      mediaPublicId || null,
      resolvedOrgId,
    ]
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
    /** true quando o contato iniciou conversa (inbound) — concede opt-in de marketing. */
    grantMarketingOptIn = false,
  }
) {
  const orgId = await resolveOrganizationIdForEstablishment(pool, lastEstablishmentId);
  const r = await pool.query(
    `INSERT INTO whatsapp_contacts (
       wa_id, contact_name, client_email, birth_date, last_establishment_id, last_reservation_id,
       marketing_opt_in, marketing_opt_in_at, last_seen_at, updated_at, organization_id
     )
     VALUES (
       $1, $2, $3, $4, $5, $6,
       $7, CASE WHEN $7 THEN NOW() ELSE NULL END,
       NOW(), NOW(), $8
     )
     ON CONFLICT (wa_id) DO UPDATE SET
       contact_name = COALESCE(EXCLUDED.contact_name, whatsapp_contacts.contact_name),
       client_email = COALESCE(EXCLUDED.client_email, whatsapp_contacts.client_email),
       birth_date = COALESCE(EXCLUDED.birth_date, whatsapp_contacts.birth_date),
       last_establishment_id = COALESCE(EXCLUDED.last_establishment_id, whatsapp_contacts.last_establishment_id),
       last_reservation_id = COALESCE(EXCLUDED.last_reservation_id, whatsapp_contacts.last_reservation_id),
       organization_id = COALESCE(whatsapp_contacts.organization_id, EXCLUDED.organization_id),
       marketing_opt_in = CASE
         WHEN $7 THEN TRUE
         ELSE whatsapp_contacts.marketing_opt_in
       END,
       marketing_opt_in_at = CASE
         WHEN $7 AND NOT whatsapp_contacts.marketing_opt_in THEN NOW()
         WHEN $7 THEN COALESCE(whatsapp_contacts.marketing_opt_in_at, NOW())
         ELSE whatsapp_contacts.marketing_opt_in_at
       END,
       last_seen_at = NOW(),
       updated_at = NOW()
     RETURNING *`,
    [
      waId,
      contactName,
      clientEmail,
      birthDate,
      lastEstablishmentId,
      lastReservationId,
      Boolean(grantMarketingOptIn),
      orgId,
    ]
  );
  return r.rows[0];
}

/** Normaliza telefone BR para wa_id (somente dígitos, prefixo 55). */
function normalizeWaId(raw) {
  let digits = String(raw || '').replace(/\D/g, '');
  if (!digits) return null;
  digits = digits.replace(/^0+/, '');
  if (digits.length === 10 || digits.length === 11) digits = `55${digits}`;
  if (digits.length < 12) return null;
  return digits;
}

/**
 * Importa contatos de uma base externa (CSV/planilha). Upsert por wa_id.
 * @returns {{ imported: number, updated: number, skipped: number, errors: object[] }}
 */
async function importContacts(
  pool,
  {
    establishmentId,
    rows = [],
    defaultMarketingOptIn = false,
    sourceTag = 'importado',
  }
) {
  const estId = Number(establishmentId);
  if (!Number.isFinite(estId) || estId <= 0) {
    throw new Error('establishment_id inválido');
  }

  const result = { imported: 0, updated: 0, skipped: 0, errors: [] };
  const seen = new Set();

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i] || {};
    const waId = normalizeWaId(row.wa_id ?? row.waId ?? row.telefone ?? row.phone);
    if (!waId) {
      result.skipped += 1;
      result.errors.push({ line: i + 1, reason: 'wa_id/telefone inválido' });
      continue;
    }
    if (seen.has(waId)) {
      result.skipped += 1;
      continue;
    }
    seen.add(waId);

    const contactName =
      typeof row.contact_name === 'string' && row.contact_name.trim()
        ? row.contact_name.trim()
        : typeof row.nome === 'string' && row.nome.trim()
          ? row.nome.trim()
          : null;

    const clientEmail =
      typeof row.client_email === 'string' && row.client_email.trim()
        ? row.client_email.trim()
        : typeof row.email === 'string' && row.email.trim()
          ? row.email.trim()
          : null;

    let marketingOptIn = defaultMarketingOptIn;
    if (row.marketing_opt_in === true || row.marketing_opt_in === 'true' || row.marketing_opt_in === '1') {
      marketingOptIn = true;
    }
    if (row.marketing_opt_in === false || row.marketing_opt_in === 'false' || row.marketing_opt_in === '0') {
      marketingOptIn = false;
    }

    let tags = [];
    const tagsRaw = row.tags ?? row.etiquetas;
    if (Array.isArray(tagsRaw)) {
      tags = tagsRaw.map((t) => String(t).trim()).filter(Boolean);
    } else if (typeof tagsRaw === 'string' && tagsRaw.trim()) {
      tags = tagsRaw.split(/[;,]/).map((t) => t.trim()).filter(Boolean);
    }
    if (sourceTag && !tags.includes(sourceTag)) tags.push(sourceTag);

    const existing = await pool.query(`SELECT id FROM whatsapp_contacts WHERE wa_id = $1`, [waId]);
    const isNew = existing.rows.length === 0;
    const orgId = await resolveOrganizationIdForEstablishment(pool, estId);

    await pool.query(
      `INSERT INTO whatsapp_contacts (
         wa_id, contact_name, client_email, last_establishment_id, marketing_opt_in, marketing_opt_in_at,
         contact_status, tags, last_seen_at, updated_at, organization_id
       )
       VALUES ($1, $2, $3, $4, $5, CASE WHEN $5 THEN NOW() ELSE NULL END, $6, $7, NOW(), NOW(), $8)
       ON CONFLICT (wa_id) DO UPDATE SET
         contact_name = COALESCE(EXCLUDED.contact_name, whatsapp_contacts.contact_name),
         client_email = COALESCE(EXCLUDED.client_email, whatsapp_contacts.client_email),
         last_establishment_id = COALESCE(EXCLUDED.last_establishment_id, whatsapp_contacts.last_establishment_id),
         organization_id = COALESCE(whatsapp_contacts.organization_id, EXCLUDED.organization_id),
         marketing_opt_in = CASE
           WHEN EXCLUDED.marketing_opt_in THEN TRUE
           ELSE whatsapp_contacts.marketing_opt_in
         END,
         marketing_opt_in_at = CASE
           WHEN EXCLUDED.marketing_opt_in AND NOT whatsapp_contacts.marketing_opt_in THEN NOW()
           WHEN EXCLUDED.marketing_opt_in THEN COALESCE(whatsapp_contacts.marketing_opt_in_at, NOW())
           ELSE whatsapp_contacts.marketing_opt_in_at
         END,
         contact_status = COALESCE(EXCLUDED.contact_status, whatsapp_contacts.contact_status),
         tags = (
           SELECT ARRAY(
             SELECT DISTINCT unnest(
               COALESCE(whatsapp_contacts.tags, '{}')::text[] || COALESCE(EXCLUDED.tags, '{}')::text[]
             )
           )
         ),
         updated_at = NOW()`,
      [
        waId,
        contactName,
        clientEmail,
        estId,
        marketingOptIn,
        typeof row.contact_status === 'string' && row.contact_status.trim()
          ? row.contact_status.trim()
          : 'new',
        tags,
        orgId,
      ]
    );

    if (isNew) result.imported += 1;
    else result.updated += 1;
  }

  return result;
}

/**
 * Concede opt-in a contatos que já enviaram pelo menos 1 mensagem inbound.
 */
async function backfillMarketingOptInFromConversations(pool, options = {}) {
  const establishmentId = Number(options.establishmentId);
  const hasEst =
    Number.isFinite(establishmentId) && establishmentId > 0;

  const params = [];
  let estClause = '';
  if (hasEst) {
    params.push(establishmentId);
    estClause = ` AND c.last_establishment_id = $${params.length}`;
  }

  const r = await pool.query(
    `UPDATE whatsapp_contacts c
        SET marketing_opt_in = TRUE,
            marketing_opt_in_at = COALESCE(c.marketing_opt_in_at, NOW()),
            updated_at = NOW()
      WHERE c.marketing_opt_in = FALSE
        AND EXISTS (
          SELECT 1
            FROM whatsapp_conversations cv
            JOIN whatsapp_messages m ON m.conversation_id = cv.id
           WHERE cv.wa_id = c.wa_id
             AND m.direction = 'inbound'
        )
        ${estClause}
      RETURNING c.id`,
    params
  );
  return { updated: r.rowCount || 0 };
}

function resolveContextMessageLimit(limit) {
  if (limit !== undefined && limit !== null && Number.isFinite(Number(limit)) && Number(limit) > 0) {
    return Math.min(Math.floor(Number(limit)), 32);
  }
  const fromEnv = Number(process.env.MAX_CONTEXT_MESSAGES || 10);
  return Number.isFinite(fromEnv) && fromEnv > 0 ? Math.min(Math.floor(fromEnv), 32) : 10;
}

async function getRecentMessagesForContext(pool, conversationId, limit) {
  const resolvedLimit = resolveContextMessageLimit(limit);
  const r = await pool.query(
    `SELECT direction, body FROM whatsapp_messages
     WHERE conversation_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [conversationId, resolvedLimit]
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
  const establishmentId = Number(options.establishmentId);
  const unassignedOnly = options.unassignedOnly === true;
  const userId = Number(options.userId);
  const status = typeof options.status === 'string' ? options.status.trim() : '';
  const assignee = options.assignedUserId !== undefined ? Number(options.assignedUserId) : null;

  const filters = [];
  const params = [];
  let idx = 1;

  let readUserParam = null;
  if (Number.isFinite(userId) && userId > 0) {
    readUserParam = idx++;
    params.push(userId);
  }

  if (allowedEstablishmentIds && allowedEstablishmentIds.length > 0) {
    filters.push(`c.establishment_id = ANY($${idx++}::int[])`);
    params.push(allowedEstablishmentIds);
  }

  if (unassignedOnly) {
    filters.push('c.establishment_id IS NULL');
  } else if (Number.isFinite(establishmentId) && establishmentId > 0) {
    filters.push(`c.establishment_id = $${idx++}`);
    params.push(establishmentId);
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

  const readJoin =
    readUserParam != null
      ? `LEFT JOIN whatsapp_inbox_read_state irs ON irs.conversation_id = c.id AND irs.user_id = $${readUserParam}`
      : '';
  const unreadSelect =
    readUserParam != null
      ? `(irs.conversation_id IS NULL) AS never_opened_by_me,
            CASE
              WHEN lm.id IS NULL THEN FALSE
              WHEN irs.last_read_message_id IS NULL THEN TRUE
              WHEN lm.id > irs.last_read_message_id THEN TRUE
              ELSE FALSE
            END AS has_unread`
      : `FALSE AS never_opened_by_me, FALSE AS has_unread`;

  const orderClause =
    readUserParam != null
      ? `ORDER BY
            CASE
              WHEN c.human_takeover_until IS NOT NULL AND c.human_takeover_until > NOW() THEN 0
              WHEN lm.id IS NOT NULL AND (irs.last_read_message_id IS NULL OR lm.id > irs.last_read_message_id)
                   AND lm.direction = 'inbound' THEN 1
              WHEN irs.conversation_id IS NULL THEN 2
              WHEN lm.id IS NOT NULL AND (irs.last_read_message_id IS NULL OR lm.id > irs.last_read_message_id) THEN 3
              WHEN lm.direction = 'outbound'
                   AND (lm.intent IN ('AGENT_REPLY', 'PROCESS_RESERVATION', 'OPERATIONAL_INFO', 'GUEST_LIST_LINK', 'recovery_followup')
                        OR (lm.intent IS NULL OR lm.intent = '')) THEN 4
              ELSE 5
            END ASC,
            GREATEST(COALESCE(lm.created_at, c.updated_at), c.updated_at) DESC,
            c.id DESC`
      : `ORDER BY
            CASE
              WHEN c.human_takeover_until IS NOT NULL AND c.human_takeover_until > NOW() THEN 0
              ELSE 1
            END ASC,
            GREATEST(COALESCE(lm.created_at, c.updated_at), c.updated_at) DESC,
              c.id DESC`;

  const r = await pool.query(
    `SELECT c.id, c.wa_id, c.contact_name, c.establishment_id, p.name AS establishment_name,
            c.status, c.assigned_user_id, u.name AS assigned_user_name, c.assigned_at,
            c.human_takeover_until, c.updated_at,
            lm.id AS last_message_id,
            lm.intent AS last_intent,
            ${unreadSelect},
            COALESCE(
              NULLIF(lm.body, ''),
              CASE WHEN lm.message_type = 'image' THEN '📷 Foto' ELSE lm.body END
            ) AS last_body,
            lm.created_at AS last_message_at,
            lm.direction AS last_direction
     FROM whatsapp_conversations c
     LEFT JOIN places p ON p.id = c.establishment_id
     LEFT JOIN users u ON u.id = c.assigned_user_id
     ${readJoin}
     LEFT JOIN LATERAL (
       SELECT id, body, created_at, direction, message_type, intent
       FROM whatsapp_messages m
       WHERE m.conversation_id = c.id
       ORDER BY m.created_at DESC, m.id DESC
       LIMIT 1
     ) lm ON true
     ${whereClause}
     ${orderClause}
     LIMIT $${idx}`,
    params
  );
  return r.rows;
}

async function markConversationRead(pool, { userId, conversationId, lastMessageId }) {
  const uid = Number(userId);
  const convId = Number(conversationId);
  const msgId = Number(lastMessageId);
  if (!Number.isFinite(uid) || uid <= 0 || !Number.isFinite(convId) || convId <= 0) {
    return null;
  }

  const r = await pool.query(
    `INSERT INTO whatsapp_inbox_read_state (user_id, conversation_id, last_read_message_id, last_read_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (user_id, conversation_id) DO UPDATE SET
       last_read_message_id = CASE
         WHEN $3 IS NULL THEN whatsapp_inbox_read_state.last_read_message_id
         WHEN whatsapp_inbox_read_state.last_read_message_id IS NULL THEN $3
         ELSE GREATEST(whatsapp_inbox_read_state.last_read_message_id, $3)
       END,
       last_read_at = NOW()
     RETURNING user_id, conversation_id, last_read_message_id, last_read_at`,
    [uid, convId, Number.isFinite(msgId) && msgId > 0 ? msgId : null]
  );
  return r.rows[0] || null;
}

/** Contagem por estabelecimento para abas do inbox (independe do LIMIT da listagem). */
async function countConversationsByEstablishment(pool, options = {}) {
  const allowedEstablishmentIds = Array.isArray(options.allowedEstablishmentIds)
    ? options.allowedEstablishmentIds
        .map((v) => Number(v))
        .filter((v) => Number.isFinite(v) && v > 0)
    : null;

  const filters = [];
  const params = [];
  let idx = 1;

  if (allowedEstablishmentIds && allowedEstablishmentIds.length > 0) {
    filters.push(`c.establishment_id = ANY($${idx++}::int[])`);
    params.push(allowedEstablishmentIds);
  }

  const whereClause = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';

  const r = await pool.query(
    `SELECT c.establishment_id, COUNT(*)::int AS total
       FROM whatsapp_conversations c
       ${whereClause}
      GROUP BY c.establishment_id`,
    params
  );

  const byEstablishment = {};
  let unassigned = 0;
  let total = 0;
  for (const row of r.rows) {
    const count = Number(row.total) || 0;
    total += count;
    if (row.establishment_id == null) {
      unassigned += count;
    } else {
      byEstablishment[String(row.establishment_id)] = count;
    }
  }

  return { total, unassigned, byEstablishment };
}

async function listMessages(pool, conversationId, limit = 500) {
  // CRÍTICO: pega as N mensagens MAIS RECENTES (DESC) e devolve em ordem cronológica (ASC).
  // Antes era ORDER BY created_at ASC LIMIT 300, o que retornava as mais ANTIGAS
  // — mensagens novas sumiam quando a conversa passava de 300 trocas.
  const r = await pool.query(
    `SELECT id, direction, body, intent, suggested_reply, message_type, media_url, media_mime, raw_payload, created_at
       FROM (
         SELECT id, direction, body, intent, suggested_reply, message_type, media_url, media_mime, raw_payload, created_at
           FROM whatsapp_messages
          WHERE conversation_id = $1
          ORDER BY created_at DESC, id DESC
          LIMIT $2
       ) recentes
      ORDER BY created_at ASC, id ASC`,
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
            c.headline, c.message_template, c.image_url, c.send_mode,
            c.meta_template_name, c.meta_template_language,
            c.target_filters, c.is_active,
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
            c.headline, c.message_template, c.image_url, c.send_mode,
            c.meta_template_name, c.meta_template_language,
            c.target_filters, c.is_active,
            c.created_by, c.updated_by, c.created_at, c.updated_at
     FROM whatsapp_campaigns c
     LEFT JOIN places p ON p.id = c.establishment_id
     WHERE c.id = $1`,
    [normalizedId]
  );
  return r.rows[0] || null;
}

async function createCampaign(
  pool,
  {
    establishmentId,
    name,
    messageTemplate,
    headline,
    imageUrl,
    sendMode,
    metaTemplateName,
    metaTemplateLanguage,
    targetFilters,
    userId,
  }
) {
  const r = await pool.query(
    `INSERT INTO whatsapp_campaigns (
       establishment_id, name, headline, message_template, image_url, send_mode,
       meta_template_name, meta_template_language, target_filters, created_by, updated_by
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $10)
     RETURNING *`,
    [
      establishmentId,
      name,
      headline || null,
      messageTemplate,
      imageUrl || null,
      sendMode || 'auto',
      metaTemplateName || null,
      metaTemplateLanguage || 'pt_BR',
      JSON.stringify(targetFilters || {}),
      userId || null,
    ]
  );
  return r.rows[0];
}

async function updateCampaignById(
  pool,
  campaignId,
  {
    name,
    messageTemplate,
    headline,
    imageUrl,
    sendMode,
    metaTemplateName,
    metaTemplateLanguage,
    targetFilters,
    isActive,
    userId,
  }
) {
  const normalizedId = Number(campaignId);
  if (!Number.isFinite(normalizedId) || normalizedId <= 0) return null;
  const r = await pool.query(
    `UPDATE whatsapp_campaigns
     SET name = COALESCE($2, name),
         headline = COALESCE($3, headline),
         message_template = COALESCE($4, message_template),
         image_url = COALESCE($5, image_url),
         send_mode = COALESCE($6, send_mode),
         meta_template_name = COALESCE($7, meta_template_name),
         meta_template_language = COALESCE($8, meta_template_language),
         target_filters = COALESCE($9::jsonb, target_filters),
         is_active = COALESCE($10, is_active),
         updated_by = $11,
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [
      normalizedId,
      name ?? null,
      headline ?? null,
      messageTemplate ?? null,
      imageUrl ?? null,
      sendMode ?? null,
      metaTemplateName ?? null,
      metaTemplateLanguage ?? null,
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
  setHumanTakeoverUntilManualResume,
  clearHumanTakeover,
  setConversationEstablishment,
  updateConversationStatus,
  assignConversation,
  insertMessage,
  updateInboundAiFields,
  upsertContact,
  getRecentMessagesForContext,
  listConversations,
  markConversationRead,
  countConversationsByEstablishment,
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
  normalizeWaId,
  importContacts,
  backfillMarketingOptInFromConversations,
};
