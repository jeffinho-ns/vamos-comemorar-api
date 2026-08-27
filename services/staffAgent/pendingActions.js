'use strict';

/**
 * Tokens de confirmação para tools de escrita (preview → apply).
 * Memória local com TTL — suficiente para Fase 1 single-instance.
 */

const crypto = require('crypto');

const TTL_MS = Number(process.env.STAFF_AGENT_CONFIRM_TTL_MS || 5 * 60 * 1000);
/** @type {Map<string, { expiresAt: number, payload: object }>} */
const store = new Map();

function sweep() {
  const now = Date.now();
  for (const [k, v] of store.entries()) {
    if (v.expiresAt <= now) store.delete(k);
  }
}

function createPendingAction(payload) {
  sweep();
  const id = crypto.randomUUID();
  store.set(id, { expiresAt: Date.now() + TTL_MS, payload });
  return id;
}

function consumePendingAction(id, userId) {
  sweep();
  const key = String(id || '');
  const entry = store.get(key);
  if (!entry) return null;
  store.delete(key);
  if (entry.expiresAt <= Date.now()) return null;
  if (Number(entry.payload.userId) !== Number(userId)) return null;
  return entry.payload;
}

/** Lê sem consumir — usado quando o colaborador complementa a ação em vez de confirmar. */
function peekPendingAction(id, userId) {
  sweep();
  const entry = store.get(String(id || ''));
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) return null;
  if (Number(entry.payload.userId) !== Number(userId)) return null;
  return entry.payload;
}

function dropPendingAction(id) {
  store.delete(String(id || ''));
}

module.exports = {
  createPendingAction,
  consumePendingAction,
  peekPendingAction,
  dropPendingAction,
  TTL_MS,
};
