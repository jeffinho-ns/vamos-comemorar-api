'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  resolveConversationHouseId,
} = require('../../services/conversationEngine/whatsappEstablishmentContext');

test('resolveConversationHouseId: menção vence conversa e ignora last_establishment do contato', () => {
  assert.equal(
    resolveConversationHouseId({
      conversationEstablishmentId: 7,
      contactLastEstablishmentId: 8,
      mentionedId: 1,
    }),
    1
  );
});

test('resolveConversationHouseId: conversa atual vence contato quando não há menção', () => {
  assert.equal(
    resolveConversationHouseId({
      conversationEstablishmentId: 7,
      contactLastEstablishmentId: 8,
      mentionedId: null,
    }),
    7
  );
});

test('resolveConversationHouseId: número central sem casa na conversa não herda o contato', () => {
  assert.equal(
    resolveConversationHouseId({
      conversationEstablishmentId: null,
      contactLastEstablishmentId: 7,
      mentionedId: null,
    }),
    null
  );
  assert.equal(
    resolveConversationHouseId({
      conversationEstablishmentId: undefined,
      contactLastEstablishmentId: 8,
      mentionedId: 0,
    }),
    null
  );
});
