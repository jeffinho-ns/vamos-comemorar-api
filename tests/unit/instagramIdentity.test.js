const test = require('node:test');
const assert = require('node:assert/strict');
const {
  isInstagramWaId,
  toInstagramWaId,
  instagramSenderId,
  channelFromWaId,
  normalizeBrPhone,
  parseBrPhoneFromText,
  resolveReservationPhone,
} = require('../../services/instagram/instagramIdentity');

test('identidade Instagram usa prefixo ig: e nunca vira telefone', () => {
  assert.equal(toInstagramWaId('17841400000000'), 'ig:17841400000000');
  assert.equal(isInstagramWaId('ig:17841400000000'), true);
  assert.equal(isInstagramWaId('5511999999999'), false);
  assert.equal(instagramSenderId('ig:17841400000000'), '17841400000000');
  assert.equal(channelFromWaId('ig:1'), 'instagram');
  assert.equal(channelFromWaId('5511999999999'), 'whatsapp');
});

test('resolveReservationPhone ignora IGSID e aceita WhatsApp BR', () => {
  assert.equal(
    resolveReservationPhone({ waId: 'ig:17841400000000', clientPhone: '11 98765-4321' }),
    '5511987654321'
  );
  assert.equal(resolveReservationPhone({ waId: 'ig:17841400000000' }), null);
  assert.equal(resolveReservationPhone({ waId: '5511987654321' }), '5511987654321');
  assert.equal(parseBrPhoneFromText('Meu zap é (11) 98765-4321'), '5511987654321');
  assert.equal(normalizeBrPhone('11987654321'), '5511987654321');
});
