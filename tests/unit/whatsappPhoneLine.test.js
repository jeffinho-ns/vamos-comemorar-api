const test = require('node:test');
const assert = require('node:assert/strict');
const {
  parseScopedWaId,
  scopeCustomerWaId,
} = require('../../services/whatsapp/whatsappPhoneLineService');

test('número legado permanece o telefone do cliente', () => {
  assert.equal(scopeCustomerWaId('5511999998888', '111', '111'), '5511999998888');
});

test('número de outra casa separa a conversa', () => {
  assert.equal(
    scopeCustomerWaId('5511999998888', '222', '111'),
    'waba:222:5511999998888',
  );
});

test('parse recupera o cliente e o ID da Meta', () => {
  assert.deepEqual(parseScopedWaId('waba:222:5511999998888'), {
    phoneNumberId: '222',
    customer: '5511999998888',
  });
  assert.equal(parseScopedWaId('5511999998888'), null);
});
