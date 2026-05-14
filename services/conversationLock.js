const { createHash } = require('crypto');

const sessionChains = new Map();

function hashSessionKey(sessionKey) {
  const digest = createHash('sha256').update(String(sessionKey)).digest();
  return digest.readInt32BE(0);
}

function enqueueSessionTask(sessionKey, task) {
  const key = String(sessionKey || '').trim();
  if (!key) {
    return task();
  }

  const previous = sessionChains.get(key) || Promise.resolve();
  const current = previous
    .catch(() => undefined)
    .then(() => task());

  sessionChains.set(key, current);

  return current.finally(() => {
    if (sessionChains.get(key) === current) {
      sessionChains.delete(key);
    }
  });
}

/**
 * Serializa processamento por sessão (wa_id) no mesmo processo Node
 * e usa pg_advisory_lock entre instâncias que compartilham o PostgreSQL.
 */
async function withConversationLock(pool, sessionKey, task) {
  const key = String(sessionKey || '').trim();
  if (!key) {
    return task();
  }

  return enqueueSessionTask(key, async () => {
    const client = await pool.connect();
    const lockKey = hashSessionKey(key);

    try {
      await client.query('SELECT pg_advisory_lock($1)', [lockKey]);
      return await task(client);
    } finally {
      try {
        await client.query('SELECT pg_advisory_unlock($1)', [lockKey]);
      } catch (unlockError) {
        console.warn('[conversationLock] falha ao liberar advisory lock:', unlockError.message);
      }
      client.release();
    }
  });
}

module.exports = {
  withConversationLock,
};
