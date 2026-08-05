/**
 * Circuit breaker in-memory para falhas estruturais da OpenAI (quota/auth).
 * Enquanto aberto, o atendimento usa FAQ offline + handoff humano (sem chamar a API).
 */

let openUntil = 0;
let tripReason = null;
let loggedOpenKey = null;

function defaultTtlMs() {
  const n = Number(process.env.OPENAI_CIRCUIT_TTL_MS || 30 * 60 * 1000);
  return Number.isFinite(n) && n > 0 ? n : 30 * 60 * 1000;
}

function tripOpenAiCircuit(reason = 'quota', ttlMs) {
  const ttl = Number.isFinite(Number(ttlMs)) && Number(ttlMs) > 0 ? Number(ttlMs) : defaultTtlMs();
  const until = Date.now() + ttl;
  openUntil = until;
  tripReason = String(reason || 'quota');
  const key = `${tripReason}:${until}`;
  if (loggedOpenKey !== key) {
    loggedOpenKey = key;
    console.warn(
      `[openaiCircuit] OPEN reason=${tripReason} until=${new Date(until).toISOString()} ttlMs=${ttl}`
    );
  }
}

function isOpenAiCircuitOpen(now = Date.now()) {
  if (!openUntil) return false;
  if (now < openUntil) return true;
  openUntil = 0;
  tripReason = null;
  loggedOpenKey = null;
  return false;
}

function getOpenAiCircuitState(now = Date.now()) {
  const open = isOpenAiCircuitOpen(now);
  return {
    open,
    reason: open ? tripReason : null,
    openUntil: open ? openUntil : null,
  };
}

function resetOpenAiCircuit() {
  openUntil = 0;
  tripReason = null;
  loggedOpenKey = null;
}

module.exports = {
  tripOpenAiCircuit,
  isOpenAiCircuitOpen,
  getOpenAiCircuitState,
  resetOpenAiCircuit,
};
