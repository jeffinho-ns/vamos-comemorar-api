const { withConversationLock } = require('../conversationLock');
const messageDedup = require('../whatsappMessageDedupRepository');
const { processInboundTurn } = require('../conversationEngine/processInboundTurn');
const { enqueueInboundTurn } = require('../../infrastructure/queue/producers');
const { isQueueEnabled } = require('../../infrastructure/queue/redisConnection');
const { extractInstagramInbound } = require('./instagramWebhookParse');

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
    });
  });
  return { handled: true, reason: 'inline' };
}

module.exports = {
  processInstagramWebhook,
};
