const { enqueuePostgresSync } = require('../../infrastructure/queue/producers');
const { isQueueEnabled } = require('../../infrastructure/queue/redisConnection');
const stateManager = require('../stateManager/stateManager');
const {
  refreshProfileFromSources,
} = require('../operationalMemory/customerOperationalProfileService');

async function persistConversationState(pool, conversationId, patch, options = {}) {
  if (isQueueEnabled() && process.env.BULLMQ_POSTGRES_INLINE !== 'true') {
    const result = await enqueuePostgresSync({
      operation: 'conversation_state.persist',
      conversationId,
      patch,
      options,
    });
    if (result.enqueued) {
      return { persisted: true, mode: 'queued', jobId: result.jobId };
    }
  }

  await stateManager.persistState(pool, conversationId, patch);
  return { persisted: true, mode: 'inline' };
}

async function refreshOperationalProfile(pool, waId) {
  if (isQueueEnabled() && process.env.BULLMQ_POSTGRES_INLINE !== 'true') {
    const result = await enqueuePostgresSync({
      operation: 'customer_profile.refresh',
      waId,
    });
    if (result.enqueued) {
      return { refreshed: true, mode: 'queued', jobId: result.jobId };
    }
  }

  await refreshProfileFromSources(pool, waId);
  return { refreshed: true, mode: 'inline' };
}

module.exports = {
  persistConversationState,
  refreshOperationalProfile,
};
