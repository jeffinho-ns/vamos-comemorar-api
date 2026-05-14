const { Queue } = require('bullmq');
const queueNames = require('./queueNames');
const { getRedisConnection, isQueueEnabled } = require('./redisConnection');

const queues = new Map();

const DEFAULT_JOB_OPTIONS = {
  removeOnComplete: { age: 24 * 3600, count: 5000 },
  removeOnFail: { age: 7 * 24 * 3600, count: 2000 },
};

function getQueue(name) {
  if (!isQueueEnabled()) return null;
  if (queues.has(name)) return queues.get(name);

  const connection = getRedisConnection();
  if (!connection) return null;

  const queue = new Queue(name, {
    connection,
    defaultJobOptions: DEFAULT_JOB_OPTIONS,
  });
  queues.set(name, queue);
  return queue;
}

function getAllQueueNames() {
  return Object.values(queueNames);
}

module.exports = {
  getQueue,
  getAllQueueNames,
  queueNames,
  DEFAULT_JOB_OPTIONS,
};
