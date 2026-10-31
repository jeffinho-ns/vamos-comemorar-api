const test = require('node:test');
const assert = require('node:assert/strict');
const {
  isInstagramPayload,
  isInstagramComment,
  extractInstagramInbound,
} = require('../../services/instagram/instagramWebhookParse');

test('webhook Instagram Direct vira waId ig: e texto', () => {
  const payload = {
    object: 'instagram',
    entry: [
      {
        messaging: [
          {
            sender: { id: '17841400000000', username: 'ana.so' },
            message: { mid: 'mid.1', text: 'Quero reservar mesa' },
          },
        ],
      },
    ],
  };
  assert.equal(isInstagramPayload(payload), true);
  assert.equal(isInstagramComment(payload), false);
  const inbound = extractInstagramInbound(payload);
  assert.equal(inbound.kind, 'direct');
  assert.equal(inbound.waId, 'ig:17841400000000');
  assert.equal(inbound.text, 'Quero reservar mesa');
  assert.equal(inbound.contactName, 'ana.so');
});

test('comentário Instagram não entra como Direct', () => {
  const payload = {
    object: 'instagram',
    entry: [
      {
        changes: [
          {
            field: 'comments',
            value: { from: { id: '99', username: 'joao' }, text: 'quero mesa', id: 'c1' },
          },
        ],
      },
    ],
  };
  assert.equal(isInstagramComment(payload), true);
  const inbound = extractInstagramInbound(payload);
  assert.equal(inbound.kind, 'comment');
  assert.equal(inbound.waId, 'ig:99');
});
