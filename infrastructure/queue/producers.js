const { getQueue, queueNames } = require('./queueRegistry');

function buildInboundJobId(waId, wamid) {
  const suffix = wamid ? String(wamid) : `${Date.now()}`;
  return `inbound:${waId}:${suffix}`;
}

async function enqueueInboundTurn(jobData, options = {}) {
  const queue = getQueue(queueNames.INBOUND_TURN);
  if (!queue) return { enqueued: false, reason: 'queue_unavailable' };

  const job = await queue.add(
    'process',
    jobData,
    {
      jobId: options.jobId || buildInboundJobId(jobData.waId, jobData.wamid),
      attempts: Number(process.env.BULLMQ_INBOUND_ATTEMPTS || 3),
      backoff: { type: 'exponential', delay: 1500 },
    }
  );

  return { enqueued: true, jobId: job.id };
}

async function enqueueOpenAiInterpret(jobData, options = {}) {
  const queue = getQueue(queueNames.OPENAI_INTERPRET);
  if (!queue) return { enqueued: false, reason: 'queue_unavailable' };

  const job = await queue.add('interpret', jobData, {
    jobId: options.jobId,
    attempts: Number(process.env.BULLMQ_OPENAI_ATTEMPTS || 2),
    backoff: { type: 'exponential', delay: 2000 },
  });

  return { enqueued: true, jobId: job.id };
}

async function enqueueWhatsAppOutbound(jobData, options = {}) {
  const queue = getQueue(queueNames.WHATSAPP_OUTBOUND);
  if (!queue) return { enqueued: false, reason: 'queue_unavailable' };

  const job = await queue.add('send-text', jobData, {
    jobId: options.jobId,
    attempts: Number(process.env.BULLMQ_WHATSAPP_ATTEMPTS || 4),
    backoff: { type: 'exponential', delay: 1000 },
  });

  return { enqueued: true, jobId: job.id };
}

async function enqueueWhatsAppTemplate(jobData, options = {}) {
  const queue = getQueue(queueNames.WHATSAPP_TEMPLATE);
  if (!queue) return { enqueued: false, reason: 'queue_unavailable' };

  const job = await queue.add('send-template', jobData, {
    jobId: options.jobId,
    attempts: Number(process.env.BULLMQ_WHATSAPP_ATTEMPTS || 4),
    backoff: { type: 'exponential', delay: 1000 },
  });

  return { enqueued: true, jobId: job.id };
}

async function enqueuePostgresSync(jobData, options = {}) {
  const queue = getQueue(queueNames.POSTGRES_SYNC);
  if (!queue) return { enqueued: false, reason: 'queue_unavailable' };

  const job = await queue.add(jobData.operation || 'sync', jobData, {
    jobId: options.jobId,
    attempts: Number(process.env.BULLMQ_POSTGRES_ATTEMPTS || 5),
    backoff: { type: 'exponential', delay: 800 },
  });

  return { enqueued: true, jobId: job.id };
}

async function enqueueCommercialRecovery(jobData = {}) {
  const queue = getQueue(queueNames.COMMERCIAL_RECOVERY);
  if (!queue) return { enqueued: false, reason: 'queue_unavailable' };

  const job = await queue.add('batch', jobData, {
    jobId: `recovery:${Date.now()}`,
    attempts: 2,
  });

  return { enqueued: true, jobId: job.id };
}

async function enqueueCommercialFollowUp(jobData = {}) {
  const queue = getQueue(queueNames.COMMERCIAL_FOLLOWUP);
  if (!queue) return { enqueued: false, reason: 'queue_unavailable' };

  const job = await queue.add('batch', jobData, {
    jobId: `followup:${Date.now()}`,
    attempts: 2,
  });

  return { enqueued: true, jobId: job.id };
}

module.exports = {
  enqueueInboundTurn,
  enqueueOpenAiInterpret,
  enqueueWhatsAppOutbound,
  enqueueWhatsAppTemplate,
  enqueuePostgresSync,
  enqueueCommercialRecovery,
  enqueueCommercialFollowUp,
};
