/**
 * Idempotência de mensagens inbound do WhatsApp (wamid).
 */

async function claimInboundMessage(pool, providerMessageId, waId = null) {
  const messageId = String(providerMessageId || '').trim();
  if (!messageId) {
    return { claimed: true, duplicate: false };
  }

  const result = await pool.query(
    `INSERT INTO whatsapp_message_dedup (provider_message_id, wa_id, received_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (provider_message_id) DO NOTHING
     RETURNING provider_message_id`,
    [messageId, waId || null]
  );

  if (result.rowCount > 0) {
    return { claimed: true, duplicate: false, providerMessageId: messageId };
  }

  return { claimed: false, duplicate: true, providerMessageId: messageId };
}

module.exports = {
  claimInboundMessage,
};
