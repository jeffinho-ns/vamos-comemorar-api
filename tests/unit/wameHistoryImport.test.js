'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  messageBody,
  messageTimestamp,
  contactName,
  customerPhone,
} = require('../../services/wame/wameHistoryImport');

describe('wameHistoryImport', () => {
  it('lê o texto e ignora o número da própria casa', () => {
    assert.equal(messageBody({ text: { body: '  Oi  ' }, type: 'text' }), 'Oi');
    assert.equal(messageBody({ type: 'image' }), '[image]');
    assert.equal(customerPhone('5511943501097'), '5511943501097');
    assert.equal(customerPhone('551123050938'), null);
    assert.equal(customerPhone('551152003650'), null);
    assert.equal(customerPhone('551142803345'), null);
  });

  it('guarda o nome do contato e a data original', () => {
    assert.equal(contactName({ contact: { name: 'Jefferson' } }, '5511943501097'), 'Jefferson');
    assert.equal(contactName({ contact: { name: '+55 11 94350-1097' } }, '5511943501097'), null);
    assert.equal(messageTimestamp('1794838811').toISOString(), new Date(1794838811 * 1000).toISOString());
    assert.ok(messageTimestamp('2026-11-16T18:00:00.000Z') instanceof Date);
  });
});
