const IORedis = require('ioredis');

let sharedConnection = null;

function isQueueEnabled() {
  if (process.env.ENABLE_BULLMQ === 'false') return false;
  return Boolean(process.env.REDIS_URL || process.env.REDIS_HOST);
}

function createRedisConnection() {
  if (process.env.REDIS_URL) {
    return new IORedis(process.env.REDIS_URL, {
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
    });
  }

  return new IORedis({
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: Number(process.env.REDIS_PORT || 6379),
    password: process.env.REDIS_PASSWORD || undefined,
    db: Number(process.env.REDIS_DB || 0),
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
  });
}

function getRedisConnection() {
  if (!isQueueEnabled()) return null;
  if (!sharedConnection) {
    sharedConnection = createRedisConnection();
    sharedConnection.on('error', (error) => {
      console.error('[queue] erro Redis:', error.message);
    });
  }
  return sharedConnection;
}

async function closeRedisConnection() {
  if (!sharedConnection) return;
  await sharedConnection.quit();
  sharedConnection = null;
}

module.exports = {
  isQueueEnabled,
  getRedisConnection,
  closeRedisConnection,
};
