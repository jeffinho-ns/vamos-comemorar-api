'use strict';

const { runWithWame } = require('../wame/wameContext');
const { processInboundTurn } = require('../conversationEngine/processInboundTurn');

function didEnableHouseAi(previousEnabled, nextEnabled) {
  return previousEnabled === false && nextEnabled === true;
}

function parsePayload(value) {
  if (!value) return null;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(String(value));
  } catch (_error) {
    return null;
  }
}

function instanceIdFromPayload(payload) {
  const parsed = parsePayload(payload);
  return (
    parsed?.entry?.[0]?.changes?.[0]?.value?.metadata?.phone_number_id ||
    parsed?.instance ||
    null
  );
}

async function releaseAutomaticHousePauses(pool, establishmentId) {
  const result = await pool.query(
    `UPDATE whatsapp_conversations
        SET human_takeover_until = NULL,
            updated_at = NOW()
      WHERE establishment_id = $1
        AND assigned_user_id IS NULL
        AND human_takeover_until IS NOT NULL
        AND human_takeover_until > NOW()
        AND human_takeover_until < TIMESTAMPTZ '2090-01-01'
      RETURNING wa_id`,
    [establishmentId]
  );
  return result.rows.map((row) => row.wa_id);
}

async function listUnansweredConversations(pool, establishmentId) {
  const result = await pool.query(
    `SELECT c.wa_id, c.contact_name, m.body, m.raw_payload
       FROM whatsapp_conversations c
       JOIN LATERAL (
         SELECT direction, body, raw_payload, created_at
           FROM whatsapp_messages
          WHERE conversation_id = c.id
          ORDER BY created_at DESC, id DESC
          LIMIT 1
       ) m ON TRUE
      WHERE c.establishment_id = $1
        AND c.assigned_user_id IS NULL
        AND (c.human_takeover_until IS NULL OR c.human_takeover_until <= NOW())
        AND COALESCE(c.status, '') <> 'resolved'
        AND m.direction = 'inbound'
        AND NULLIF(BTRIM(m.body), '') IS NOT NULL
        AND m.created_at > NOW() - INTERVAL '36 hours'
      ORDER BY m.created_at DESC
      LIMIT 12`,
    [establishmentId]
  );
  return result.rows;
}

async function answerUnansweredHouseConversations(pool, app, establishmentId) {
  const pending = await listUnansweredConversations(pool, establishmentId);
  for (const row of pending) {
    const instanceId = instanceIdFromPayload(row.raw_payload);
    const payload = parsePayload(row.raw_payload) || {};
    try {
      await runWithWame(
        { enabled: true, instanceId: instanceId ? String(instanceId) : null },
        () =>
          processInboundTurn({
            pool,
            app,
            payload,
            incomingMessageText: row.body,
            waId: row.wa_id,
            hintedEstablishmentId: establishmentId,
            pinnedEstablishmentId: establishmentId,
            skipInboundPersist: true,
          })
      );
    } catch (error) {
      console.error(
        `[resumeHouseAi] falha ao responder waId=${row.wa_id} establishment_id=${establishmentId}:`,
        error.message
      );
    }
  }
  console.log(
    `[resumeHouseAi] casa ${establishmentId} religada; conversas pendentes=${pending.length}`
  );
  return pending.length;
}

module.exports = {
  didEnableHouseAi,
  releaseAutomaticHousePauses,
  answerUnansweredHouseConversations,
};
