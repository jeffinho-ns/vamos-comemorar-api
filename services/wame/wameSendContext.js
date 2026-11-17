'use strict';

const {
  instanceIdFromStoredPayload,
  quotedMessageIdFromPayload,
  findEstablishmentWameInstanceId,
} = require('./wameService');

async function loadWameSendContext(pool, { conversationId, establishmentId } = {}) {
  const convId = Number(conversationId);
  let instanceId = null;
  let quotedMessageId = null;

  if (pool && Number.isFinite(convId) && convId > 0) {
    const recent = await pool.query(
      `SELECT direction, raw_payload
         FROM whatsapp_messages
        WHERE conversation_id = $1
          AND raw_payload IS NOT NULL
        ORDER BY created_at DESC
        LIMIT 20`,
      [convId]
    );
    instanceId = recent.rows.map((row) => instanceIdFromStoredPayload(row.raw_payload)).find(Boolean) || null;
    quotedMessageId = recent.rows
      .filter((row) => row.direction === 'inbound')
      .map((row) => quotedMessageIdFromPayload(row.raw_payload))
      .find(Boolean) || null;
  }

  if (!instanceId) {
    instanceId = await findEstablishmentWameInstanceId(pool, establishmentId);
  }

  return {
    instanceId: instanceId || null,
    quotedMessageId: quotedMessageId || null,
  };
}

module.exports = {
  loadWameSendContext,
};
