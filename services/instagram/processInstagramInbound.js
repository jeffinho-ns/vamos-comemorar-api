const { withConversationLock } = require('../conversationLock');
const messageDedup = require('../whatsappMessageDedupRepository');
const { processInboundTurn } = require('../conversationEngine/processInboundTurn');
const { enqueueInboundTurn } = require('../../infrastructure/queue/producers');
const { isQueueEnabled } = require('../../infrastructure/queue/redisConnection');
const { extractInstagramInbound, extractInstagramAccountIds } = require('./instagramWebhookParse');
const { findActiveByAccountIds } = require('./instagramAccountService');

async function resolveHouseFromPayload(pool, payload) {
  try {
    return await findActiveByAccountIds(pool, extractInstagramAccountIds(payload));
  } catch (error) {
    console.warn('[instagram] falha ao resolver a casa do Direct:', error.message);
    return null;
  }
}

async function processInstagramWebhook({ pool, app, payload }) {
  const inbound = extractInstagramInbound(payload);
  if (!inbound?.waId) return { handled: false, reason: 'empty' };
  if (inbound.kind === 'comment') {
    console.log(`[instagram] comentário ignorado waId=${inbound.waId}`);
    return { handled: true, reason: 'comment_ignored' };
  }
  if (!inbound.text) {
    return { handled: true, reason: 'no_text' };
  }
  const account = await resolveHouseFromPayload(pool, payload);
  const hintedEstablishmentId = Number(account?.establishment_id) || null;
  if (hintedEstablishmentId) {
    console.log(
      `[instagram] Direct da casa establishment_id=${hintedEstablishmentId} ig=${account.ig_user_id} waId=${inbound.waId}`
    );
  } else {
    console.warn(
      `[instagram] Direct sem casa cadastrada accountIds=${extractInstagramAccountIds(payload).join(',') || 'vazio'} waId=${inbound.waId}`
    );
  }

  const wamid = inbound.messageId;
  try {
    const dedupResult = await messageDedup.claimInboundMessage(pool, wamid, inbound.waId);
    if (dedupResult.duplicate) {
      return { handled: true, reason: 'duplicate' };
    }
  } catch (dedupError) {
    console.warn('[instagram] deduplicação indisponível:', dedupError.message);
  }

  if (isQueueEnabled() && process.env.BULLMQ_WEBHOOK_INLINE !== 'true') {
    const enqueueResult = await enqueueInboundTurn({
      waId: inbound.waId,
      wamid,
      payload,
      incomingMessageText: inbound.text,
      hintedEstablishmentId,
    });
    if (enqueueResult.enqueued) {
      return { handled: true, reason: 'queued', jobId: enqueueResult.jobId };
    }
  }

  await withConversationLock(pool, inbound.waId, async () => {
    await processInboundTurn({
      pool,
      app,
      payload,
      incomingMessageText: inbound.text,
      waId: inbound.waId,
      hintedEstablishmentId,
    });
  });
  return { handled: true, reason: 'inline' };
}

module.exports = {
  processInstagramWebhook,
};
