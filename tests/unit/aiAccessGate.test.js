const test = require('node:test');
const assert = require('node:assert/strict');

/**
 * Testes de regressão do contrato do gate (espelham a lógica usada em
 * processAgentInboundTurn + loadInboundAccessGate).
 */
function shouldAiReply({ aiGloballyEnabled, allowedNumbers, senderDigits }) {
  if (aiGloballyEnabled === false) return false;
  if (allowedNumbers instanceof Set && allowedNumbers.size > 0) {
    return allowedNumbers.has(senderDigits);
  }
  return true;
}

test('IA desligada não responde ninguém', () => {
  assert.equal(
    shouldAiReply({
      aiGloballyEnabled: false,
      allowedNumbers: new Set(['5511999999999']),
      senderDigits: '5511999999999',
    }),
    false
  );
  assert.equal(
    shouldAiReply({
      aiGloballyEnabled: false,
      allowedNumbers: new Set(),
      senderDigits: '5511888777666',
    }),
    false
  );
});

test('IA ligada sem allow-list responde a todos', () => {
  assert.equal(
    shouldAiReply({
      aiGloballyEnabled: true,
      allowedNumbers: new Set(),
      senderDigits: '5511888777666',
    }),
    true
  );
});

test('IA ligada com allow-list só responde números da lista', () => {
  const allowed = new Set(['5511999999999']);
  assert.equal(
    shouldAiReply({
      aiGloballyEnabled: true,
      allowedNumbers: allowed,
      senderDigits: '5511999999999',
    }),
    true
  );
  assert.equal(
    shouldAiReply({
      aiGloballyEnabled: true,
      allowedNumbers: allowed,
      senderDigits: '5511888777666',
    }),
    false
  );
});
