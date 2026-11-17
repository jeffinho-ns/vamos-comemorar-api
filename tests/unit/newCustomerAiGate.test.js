'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  shouldReplyToCustomer,
  readNewCustomerPolicy,
} = require('../../services/whatsapp/newCustomerAiGate');

describe('newCustomerAiGate', () => {
  it('responde número novo e continua quem já entrou no funil', () => {
    assert.equal(
      shouldReplyToCustomer({ onlyNewCustomers: true, hadHistory: false, alreadyEngaged: false }),
      true
    );
    assert.equal(
      shouldReplyToCustomer({ onlyNewCustomers: true, hadHistory: true, alreadyEngaged: true }),
      true
    );
  });

  it('fica em silêncio quando o número já tinha conversa antes do corte', () => {
    assert.equal(
      shouldReplyToCustomer({ onlyNewCustomers: true, hadHistory: true, alreadyEngaged: false }),
      false
    );
  });

  it('lê o corte gravado ao ligar a IA', () => {
    const policy = readNewCustomerPolicy({
      behavior_config: {
        responder_apenas_numeros_novos: true,
        ai_reply_after: '2026-11-17T12:00:00.000Z',
      },
    });
    assert.equal(policy.onlyNewCustomers, true);
    assert.equal(policy.cutoff.toISOString(), '2026-11-17T12:00:00.000Z');
    assert.equal(readNewCustomerPolicy({ behavior_config: {} }).onlyNewCustomers, false);
  });
});
