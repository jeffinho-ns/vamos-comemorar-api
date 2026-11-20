'use strict';

const {
  instanceIdFromStoredPayload,
  quotedMessageIdFromPayload,
  findEstablishmentWameInstanceId,
  resolveWameRouting,
} = require('./wameService');
const { resolveMappedInstanceForEstablishment } = require('./wameConfig');

async function loadWameSendContext(pool, { conversationId, establishmentId } = {}) {
  const convId = Number(conversationId);
  const estId = Number(establishmentId);
  let instanceId = null;
  let quotedMessageId = null;
  let serverUrl = null;
  let source = null;

  // 1) Mapa explícito establishment → instância (determinístico)
  if (Number.isFinite(estId) && estId > 0) {
    const mapped = resolveMappedInstanceForEstablishment(estId);
    if (mapped) {
      instanceId = mapped;
      source = 'env_map';
    }
  }

  // 2) Histórico da conversa (mesma casa — conversationId já escopado pelo caller)
  if (pool && Number.isFinite(convId) && convId > 0) {
    const recent = await pool.query(
      `SELECT direction, raw_payload
         FROM whatsapp_messages
        WHERE conversation_id = $1
          AND raw_payload IS NOT NULL
        ORDER BY created_at DESC
        LIMIT 20`,
      [convId],
    );
    if (!instanceId) {
      instanceId =
        recent.rows.map((row) => instanceIdFromStoredPayload(row.raw_payload)).find(Boolean) ||
        null;
      if (instanceId) source = 'conversation';
    }
    quotedMessageId =
      recent.rows
        .filter((row) => row.direction === 'inbound')
        .map((row) => quotedMessageIdFromPayload(row.raw_payload))
        .find(Boolean) || null;
  }

  // 3) Histórico da casa (nunca key global de outra casa)
  if (!instanceId && Number.isFinite(estId) && estId > 0) {
    instanceId = await findEstablishmentWameInstanceId(pool, estId);
    if (instanceId) source = source || 'establishment_history';
  }

  if (instanceId && Number.isFinite(estId) && estId > 0) {
    const routing = await resolveWameRouting(pool, estId);
    if (routing.instanceId === instanceId) {
      serverUrl = routing.serverUrl;
    }
  }

  return {
    instanceId: instanceId || null,
    quotedMessageId: quotedMessageId || null,
    serverUrl: serverUrl || null,
    establishmentId: Number.isFinite(estId) && estId > 0 ? estId : null,
    source: source || null,
  };
}

module.exports = {
  loadWameSendContext,
};
