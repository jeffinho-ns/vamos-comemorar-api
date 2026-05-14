const { Worker } = require('bullmq');
const { getRedisConnection, isQueueEnabled } = require('../infrastructure/queue/redisConnection');
const { queueNames } = require('../infrastructure/queue/queueRegistry');
const { withConversationLock } = require('../services/conversationLock');
const { processInboundTurn } = require('../services/conversationEngine/processInboundTurn');
const { interpretMessage } = require('../services/aiService');
const { sendMessage } = require('../services/whatsappService');
const stateManager = require('../services/stateManager/stateManager');
const {
  refreshProfileFromSources,
} = require('../services/operationalMemory/customerOperationalProfileService');
const { processRecoveryBatch } = require('../services/recoveryEngine/recoveryEngine');
const { processFollowUpBatch } = require('../services/followUpEngine/followUpEngine');

const workers = [];

function createAppStub() {
  return {
    get(key) {
      if (key === 'socketio') return null;
      return null;
    },
  };
}

function registerWorker(queueName, processor, options = {}) {
  const connection = getRedisConnection();
  if (!connection) return null;

  const worker = new Worker(queueName, processor, {
    connection,
    concurrency: Number(options.concurrency || 1),
  });

  worker.on('failed', (job, error) => {
    console.error(`[queue:${queueName}] job ${job?.id} falhou:`, error.message);
  });

  workers.push(worker);
  return worker;
}

function startQueueWorkers(pool, app) {
  if (!isQueueEnabled()) {
    console.log('[queueWorkers] BullMQ desabilitado (sem Redis ou ENABLE_BULLMQ=false).');
    return { started: false, workers: [] };
  }

  if (process.env.ENABLE_BULLMQ_WORKERS === 'false') {
    console.log('[queueWorkers] workers desabilitados por env.');
    return { started: false, workers: [] };
  }

  const runtimeApp = app || createAppStub();

  registerWorker(
    queueNames.INBOUND_TURN,
    async (job) => {
      const { waId, payload, incomingMessageText } = job.data;
      await withConversationLock(pool, waId, async () => {
        await processInboundTurn({
          pool,
          app: runtimeApp,
          payload,
          incomingMessageText,
          waId,
        });
      });
    },
    { concurrency: Number(process.env.BULLMQ_INBOUND_CONCURRENCY || 4) }
  );

  registerWorker(
    queueNames.OPENAI_INTERPRET,
    async (job) => interpretMessage(job.data),
    { concurrency: Number(process.env.BULLMQ_OPENAI_CONCURRENCY || 2) }
  );

  registerWorker(
    queueNames.WHATSAPP_OUTBOUND,
    async (job) => {
      const { to, text } = job.data;
      await sendMessage(to, text);
    },
    { concurrency: Number(process.env.BULLMQ_WHATSAPP_CONCURRENCY || 6) }
  );

  registerWorker(
    queueNames.WHATSAPP_TEMPLATE,
    async (job) => {
      const { to, template } = job.data;
      const { sendTemplateMessage } = require('../services/whatsappService');
      await sendTemplateMessage(to, template);
    },
    { concurrency: Number(process.env.BULLMQ_WHATSAPP_CONCURRENCY || 4) }
  );

  registerWorker(
    queueNames.POSTGRES_SYNC,
    async (job) => {
      const { operation } = job.data;
      if (operation === 'conversation_state.persist') {
        await stateManager.persistState(pool, job.data.conversationId, job.data.patch);
        return;
      }
      if (operation === 'customer_profile.refresh') {
        await refreshProfileFromSources(pool, job.data.waId);
      }
    },
    { concurrency: Number(process.env.BULLMQ_POSTGRES_CONCURRENCY || 4) }
  );

  registerWorker(
    queueNames.COMMERCIAL_RECOVERY,
    async () => processRecoveryBatch(pool, runtimeApp),
    { concurrency: 1 }
  );

  registerWorker(
    queueNames.COMMERCIAL_FOLLOWUP,
    async () => processFollowUpBatch(pool, runtimeApp),
    { concurrency: 1 }
  );

  console.log(`[queueWorkers] ${workers.length} workers BullMQ iniciados.`);
  return { started: true, workers };
}

async function stopQueueWorkers() {
  await Promise.all(workers.map((worker) => worker.close()));
  workers.length = 0;
}

module.exports = {
  startQueueWorkers,
  stopQueueWorkers,
};
