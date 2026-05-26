const outboundGateway = require('../messaging/outboundGateway');
const inbox = require('../whatsappInboxRepository');
const stateManager = require('../stateManager/stateManager');
const { getMemory } = require('../agent/agentMemoryService');
const { parseReservationFieldsFromUserText } = require('../agent/reservationFunnel');
const { mapAgentWorkingStateToLegacyFields, hydrateLegacyStateFromAgent } = require('../conversationEngine/reservationRouting');
const { resolveDefaultReservationSlot } = require('../agent/agentTools');
const { processInboundTurn } = require('../conversationEngine/processInboundTurn');
const {
  validateProcessReservationParams,
  mapRowsToOpenAIHistory,
  applyBusinessRulesToReservationParams,
} = require('../conversationEngine/helpers');
const {
  ageFromIsoDate,
  createReservationInternal,
  buildReservationBodyFromParams,
  buildGuestListSecondMessage,
} = require('../whatsappReservationService');
const { generateReservationConfirmationMessage } = require('../aiService');
const { recordEvent, EVENT_TYPES } = require('../metrics/conversationMetricsService');

const STUCK_IDLE_MINUTES = Number(process.env.CONVERSATION_STUCK_IDLE_MINUTES || 4);
const MAX_STUCK_ATTEMPTS = Number(process.env.CONVERSATION_MAX_STUCK_ATTEMPTS || 3);
const STUCK_COOLDOWN_MINUTES = Number(process.env.CONVERSATION_STUCK_COOLDOWN_MINUTES || 15);

function isStuckResolverEnabled() {
  const raw = String(process.env.WHATSAPP_STUCK_RESOLVER_ENABLED ?? 'true')
    .trim()
    .toLowerCase();
  return !['0', 'false', 'no', 'off'].includes(raw);
}

function looksLikeDeferredOutbound(body) {
  const normalized = String(body || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  return /\b(vou verificar|vou consultar|um momento|aguarde)\b/.test(normalized);
}

async function listStuckConversationCandidates(pool) {
  const result = await pool.query(
    `WITH conv AS (
       SELECT c.id, c.wa_id, c.establishment_id
         FROM whatsapp_conversations c
        WHERE (c.human_takeover_until IS NULL OR c.human_takeover_until < NOW())
     ),
     last_in AS (
       SELECT DISTINCT ON (m.conversation_id)
              m.conversation_id, m.body, m.created_at
         FROM whatsapp_messages m
         JOIN conv ON conv.id = m.conversation_id
        WHERE m.direction = 'inbound'
        ORDER BY m.conversation_id, m.created_at DESC, m.id DESC
     ),
     last_out AS (
       SELECT DISTINCT ON (m.conversation_id)
              m.conversation_id, m.body, m.created_at
         FROM whatsapp_messages m
         JOIN conv ON conv.id = m.conversation_id
        WHERE m.direction = 'outbound'
        ORDER BY m.conversation_id, m.created_at DESC, m.id DESC
     )
     SELECT conv.id AS conversation_id,
            conv.wa_id,
            conv.establishment_id,
            li.body AS last_inbound_body,
            li.created_at AS last_inbound_at,
            lo.body AS last_outbound_body,
            lo.created_at AS last_outbound_at,
            cs.current_step,
            cs.collected_fields,
            cs.reservation_context
       FROM conv
       JOIN last_in li ON li.conversation_id = conv.id
       LEFT JOIN last_out lo ON lo.conversation_id = conv.id
       LEFT JOIN conversation_state cs ON cs.conversation_id = conv.id
      WHERE (cs.current_step IS NULL OR cs.current_step NOT IN ('completed', 'handoff'))
        AND (
          (li.created_at > COALESCE(lo.created_at, 'epoch'::timestamptz)
           AND li.created_at < NOW() - ($1::int * interval '1 minute'))
          OR
          (lo.created_at > li.created_at
           AND lo.created_at < NOW() - ($1::int * interval '1 minute')
           AND (
             lo.body ILIKE '%vou verificar%'
             OR lo.body ILIKE '%um momento%'
             OR lo.body ILIKE '%temos horários%'
             OR lo.body ILIKE '%temos horarios%'
           ))
        )
      ORDER BY li.created_at ASC
      LIMIT 40`,
    [STUCK_IDLE_MINUTES]
  );
  return result.rows;
}

function canAttemptStuckResolve(reservationContext = {}) {
  const ctx = reservationContext && typeof reservationContext === 'object' ? reservationContext : {};
  const count = Number(ctx.stuck_resolver_count) || 0;
  if (count >= MAX_STUCK_ATTEMPTS) return false;
  const lastAt = ctx.stuck_resolver_at ? new Date(ctx.stuck_resolver_at).getTime() : 0;
  if (lastAt && Date.now() - lastAt < STUCK_COOLDOWN_MINUTES * 60 * 1000) {
    return false;
  }
  return true;
}

async function markStuckResolverAttempt(pool, conversationId, reservationContext = {}) {
  const count = Number(reservationContext.stuck_resolver_count) || 0;
  await stateManager.persistState(pool, conversationId, {
    reservationContext: {
      ...reservationContext,
      stuck_resolver_at: new Date().toISOString(),
      stuck_resolver_count: count + 1,
    },
  });
}

async function assembleReservationParams(pool, { conversationId, waId, establishmentId }) {
  const state = await stateManager.getByConversationId(pool, conversationId);
  const memory = await getMemory(pool, conversationId);
  const contact = await inbox.getContactByWaId(pool, waId).catch(() => null);
  const messageRows = await inbox.getRecentMessagesForContext(pool, conversationId, 32);
  const messageHistory = mapRowsToOpenAIHistory(messageRows);

  let params = {
    ...(state?.collectedFields || {}),
    ...mapAgentWorkingStateToLegacyFields(memory.workingState || {}),
  };

  if (!params.establishment_id && establishmentId) {
    params.establishment_id = Number(establishmentId);
  }

  if (!params.client_email && contact?.client_email) {
    params.client_email = String(contact.client_email).trim().toLowerCase();
  }
  if (!params.data_nascimento && contact?.birth_date) {
    params.data_nascimento = String(contact.birth_date).slice(0, 10);
  }
  const contactName = String(contact?.contact_name || '').trim();
  if (!params.client_name && contactName.split(/\s+/).filter(Boolean).length >= 2) {
    params.client_name = contactName;
  }

  for (const row of [...messageRows].reverse()) {
    if (row.direction !== 'inbound') continue;
    const patch = parseReservationFieldsFromUserText(row.body, params, messageHistory);
    params = { ...params, ...patch };
  }

  if (
    !params.area_id &&
    params.establishment_id &&
    params.reservation_date
  ) {
    try {
      const slot = await resolveDefaultReservationSlot(
        pool,
        Number(params.establishment_id),
        String(params.reservation_date).slice(0, 10),
        Number(params.quantidade_convidados) || 2
      );
      if (slot?.area_id) params.area_id = slot.area_id;
    } catch (_error) {
      // ignore
    }
  }

  return params;
}

async function tryAutoSubmitReservation(pool, app, row, params) {
  const missing = validateProcessReservationParams(params);
  if (missing.length > 0) return { ok: false, reason: 'incomplete', missing };

  const age = ageFromIsoDate(params.data_nascimento);
  if (age !== null && age < 18) {
    return { ok: false, reason: 'minor' };
  }

  const businessValidation = applyBusinessRulesToReservationParams(params);
  if (!businessValidation.ok) {
    return { ok: false, reason: 'business_rules', error: businessValidation.message };
  }

  const body = buildReservationBodyFromParams(params, row.wa_id, {
    notes: 'Origem: WhatsApp (retomada automática)',
  });
  const created = await createReservationInternal(body);
  if (!created.success) {
    return { ok: false, reason: 'create_failed', error: created.error };
  }

  const resData = created.data || {};
  const reservationRow = resData.reservation || resData;
  const guestListLink = resData.guest_list_link || null;

  await stateManager.markCompleted(pool, row.conversation_id);
  await inbox.upsertContact(pool, {
    waId: row.wa_id,
    contactName: reservationRow.client_name || params.client_name,
    clientEmail: reservationRow.client_email || params.client_email,
    birthDate: params.data_nascimento,
    lastEstablishmentId: Number(params.establishment_id) || null,
    lastReservationId: reservationRow.id || null,
  });

  let confirmText;
  try {
    confirmText = await generateReservationConfirmationMessage({
      reservation: reservationRow,
      hasGuestList: Boolean(guestListLink),
      isBirthday: false,
    });
  } catch (_error) {
    const firstName = String(reservationRow.client_name || '').trim().split(/\s+/)[0] || '';
    const dateBr = String(reservationRow.reservation_date || '').slice(0, 10);
    const timeBr = String(reservationRow.reservation_time || '').slice(0, 5);
    const greet = firstName ? `Fechado, ${firstName}!` : 'Fechado!';
    confirmText =
      `${greet} Sua reserva tá confirmada pra ${dateBr}${timeBr ? ' às ' + timeBr : ''}. Te espero aqui — qualquer coisa é só me chamar.`;
  }

  await outboundGateway.sendText(row.wa_id, confirmText);
  await inbox.insertMessage(pool, {
    conversationId: row.conversation_id,
    direction: 'outbound',
    body: confirmText,
    intent: 'STUCK_AUTO_COMPLETED',
    suggestedReply: null,
    rawPayload: null,
  });

  if (guestListLink) {
    const linkMsg = buildGuestListSecondMessage(guestListLink);
    await outboundGateway.sendText(row.wa_id, linkMsg);
    await inbox.insertMessage(pool, {
      conversationId: row.conversation_id,
      direction: 'outbound',
      body: linkMsg,
      intent: 'GUEST_LIST_LINK',
      suggestedReply: null,
      rawPayload: null,
    });
  }

  await recordEvent(pool, {
    eventType: EVENT_TYPES.CONVERSION_COMPLETED,
    conversationId: row.conversation_id,
    waId: row.wa_id,
    establishmentId: Number(params.establishment_id) || null,
    step: 'completed',
    payload: { source: 'stuck_resolver_auto' },
  });

  const io = app?.get?.('socketio');
  if (io) io.to('whatsapp_inbox').emit('whatsapp_inbox_update', { type: 'stuck_auto_completed' });

  return { ok: true, reservationId: reservationRow.id };
}

async function proactiveResumeTurn(pool, app, row, triggerText) {
  const text = String(triggerText || '').trim();
  if (!text) return { ok: false, reason: 'no_trigger' };

  const memory = await getMemory(pool, row.conversation_id);
  await hydrateLegacyStateFromAgent(pool, row.conversation_id, row.wa_id, memory.workingState || {});

  await processInboundTurn({
    pool,
    app,
    payload: { proactive_resume: true },
    incomingMessageText: text,
    waId: row.wa_id,
    proactiveResume: true,
  });

  return { ok: true, reason: 'turn_processed' };
}

function pickResumeTriggerText(row) {
  const inbound = String(row.last_inbound_body || '').trim();
  const outbound = String(row.last_outbound_body || '').trim();
  const inboundAt = row.last_inbound_at ? new Date(row.last_inbound_at).getTime() : 0;
  const outboundAt = row.last_outbound_at ? new Date(row.last_outbound_at).getTime() : 0;

  if (inbound && inboundAt > outboundAt) return inbound;
  if (inbound) return inbound;
  if (looksLikeDeferredOutbound(outbound)) return inbound || 'continuar reserva';
  return inbound || 'continuar reserva';
}

async function processStuckConversationBatch(pool, app, options = {}) {
  if (!isStuckResolverEnabled() && !options.force) {
    return { scanned: 0, autoCompleted: 0, resumed: 0, skipped: 0 };
  }

  const waIdFilter = options.waId ? String(options.waId).trim() : null;
  let candidates = await listStuckConversationCandidates(pool);
  if (waIdFilter) {
    candidates = candidates.filter((row) => String(row.wa_id) === waIdFilter);
  }

  let autoCompleted = 0;
  let resumed = 0;
  let skipped = 0;

  for (const row of candidates) {
    try {
      const humanActive = await inbox.isHumanTakeoverActive(pool, row.wa_id);
      if (humanActive) {
        skipped += 1;
        continue;
      }

      const reservationContext =
        row.reservation_context && typeof row.reservation_context === 'object'
          ? row.reservation_context
          : typeof row.reservation_context === 'string'
            ? JSON.parse(row.reservation_context || '{}')
            : {};

      if (!options.force && !canAttemptStuckResolve(reservationContext)) {
        skipped += 1;
        continue;
      }

      await stateManager.ensureSession(pool, {
        conversationId: row.conversation_id,
        waId: row.wa_id,
      });

      const params = await assembleReservationParams(pool, {
        conversationId: row.conversation_id,
        waId: row.wa_id,
        establishmentId: row.establishment_id,
      });

      const auto = await tryAutoSubmitReservation(pool, app, row, params);
      await markStuckResolverAttempt(pool, row.conversation_id, reservationContext);

      if (auto.ok) {
        autoCompleted += 1;
        console.log(
          `[stuckResolver] reserva criada waId=${row.wa_id} reservation_id=${auto.reservationId}`
        );
        continue;
      }

      if (auto.reason === 'incomplete' && auto.missing?.length <= 2) {
        const triggerText = pickResumeTriggerText(row);
        await proactiveResumeTurn(pool, app, row, triggerText);
        resumed += 1;
        console.log(`[stuckResolver] turno proativo waId=${row.wa_id} trigger="${triggerText.slice(0, 40)}"`);
        continue;
      }

      if (auto.reason === 'incomplete') {
        const triggerText = pickResumeTriggerText(row);
        await proactiveResumeTurn(pool, app, row, triggerText);
        resumed += 1;
        continue;
      }

      skipped += 1;
    } catch (error) {
      skipped += 1;
      console.warn('[stuckResolver] falha:', {
        waId: row.wa_id,
        error: error.message,
      });
    }
  }

  return {
    scanned: candidates.length,
    autoCompleted,
    resumed,
    skipped,
  };
}

module.exports = {
  isStuckResolverEnabled,
  listStuckConversationCandidates,
  assembleReservationParams,
  processStuckConversationBatch,
  tryAutoSubmitReservation,
  STUCK_IDLE_MINUTES,
};
