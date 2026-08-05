const test = require('node:test');
const assert = require('node:assert/strict');

const {
  tripOpenAiCircuit,
  isOpenAiCircuitOpen,
  getOpenAiCircuitState,
  resetOpenAiCircuit,
} = require('../../services/agent/openaiCircuitBreaker');

test('tripOpenAiCircuit abre o circuito com TTL padrão', () => {
  resetOpenAiCircuit();

  try {
    tripOpenAiCircuit('quota', 60_000);
    assert.equal(isOpenAiCircuitOpen(), true);
    const state = getOpenAiCircuitState();
    assert.equal(state.open, true);
    assert.equal(state.reason, 'quota');
    assert.ok(state.openUntil > Date.now());
  } finally {
    resetOpenAiCircuit();
  }
});

test('circuito expira após TTL', () => {
  resetOpenAiCircuit();

  try {
    const base = Date.now();
    tripOpenAiCircuit('quota', 30_000);
    const state = getOpenAiCircuitState(base);
    assert.equal(state.open, true);
    assert.ok(state.openUntil >= base + 30_000);

    assert.equal(isOpenAiCircuitOpen(base + 29_999), true);
    assert.equal(isOpenAiCircuitOpen(base + 30_001), false);
    assert.equal(getOpenAiCircuitState(base + 30_001).open, false);
  } finally {
    resetOpenAiCircuit();
  }
});

test('resetOpenAiCircuit fecha o circuito', () => {
  tripOpenAiCircuit('quota', 60_000);
  assert.equal(isOpenAiCircuitOpen(), true);

  resetOpenAiCircuit();
  assert.equal(isOpenAiCircuitOpen(), false);
  assert.deepEqual(getOpenAiCircuitState(), { open: false, reason: null, openUntil: null });
});
