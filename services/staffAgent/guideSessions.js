'use strict';

/**
 * Sessões de guia (modo playbook) — memória local com TTL.
 * Chave: userId + establishmentId. Single-instance (mesmo padrão de pendingActions).
 */

const TTL_MS = Number(process.env.STAFF_AGENT_GUIDE_TTL_MS || 30 * 60 * 1000);

/** @type {Map<string, { expiresAt: number, payload: object }>} */
const store = new Map();

function keyFor(userId, establishmentId) {
  return `${Number(userId)}:${Number(establishmentId)}`;
}

function sweep() {
  const now = Date.now();
  for (const [k, v] of store.entries()) {
    if (v.expiresAt <= now) store.delete(k);
  }
}

/**
 * @param {{ userId: number, establishmentId: number, playbookId: string, stepIndex?: number, lastReply?: string }} payload
 */
function upsertGuideSession(payload) {
  sweep();
  const key = keyFor(payload.userId, payload.establishmentId);
  store.set(key, {
    expiresAt: Date.now() + TTL_MS,
    payload: {
      playbookId: payload.playbookId,
      stepIndex: Number(payload.stepIndex) || 0,
      lastReply: payload.lastReply || '',
      updatedAt: Date.now(),
    },
  });
  return store.get(key).payload;
}

function getGuideSession(userId, establishmentId) {
  sweep();
  const entry = store.get(keyFor(userId, establishmentId));
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    store.delete(keyFor(userId, establishmentId));
    return null;
  }
  return entry.payload;
}

function clearGuideSession(userId, establishmentId) {
  store.delete(keyFor(userId, establishmentId));
}

function isGuideContinueText(text) {
  const t = String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
  if (!t) return false;
  if (
    /^(sim|ok|certo|pronto|feito|ja fiz|já fiz|proximo|próximo|continua|continue|e agora|next)\b/.test(
      t
    )
  ) {
    return true;
  }
  if (/\b(parei|trav(ei|ou)|nao consegui|não consegui|onde (estou|paro)|voltei)\b/.test(t)) {
    return true;
  }
  if (t.length < 80 && /\b(passo|etapa|depois|agora)\b/.test(t)) return true;
  return false;
}

function isGuideCancelText(text) {
  const t = String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  return /\b(cancelar guia|parar guia|sair do guia|deixa pra la|deixa pra lá|nao quero mais|não quero mais)\b/.test(
    t
  );
}

/**
 * Heurística leve: se a resposta cita "passo N", avança o índice.
 * @param {string} reply
 * @param {number} current
 * @param {number} maxStep
 */
function inferNextStepIndex(reply, current, maxStep) {
  const m = String(reply || '').match(/\bpasso\s*(\d+)\b/i);
  if (m) {
    const n = Number(m[1]) - 1;
    if (Number.isFinite(n) && n >= 0 && n <= maxStep) return n;
  }
  if (/\b(pronto|conclu|finaliz|tudo certo|ja esta|já está)\b/i.test(reply || '')) {
    return maxStep;
  }
  return Math.min(current + 1, maxStep);
}

module.exports = {
  upsertGuideSession,
  getGuideSession,
  clearGuideSession,
  isGuideContinueText,
  isGuideCancelText,
  inferNextStepIndex,
  TTL_MS,
};
