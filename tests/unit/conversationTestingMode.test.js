const test = require('node:test');
const assert = require('node:assert/strict');

test('modo teste desativa bloqueios por padrão', () => {
  const previous = process.env.WHATSAPP_AI_TESTING_MODE;
  delete process.env.WHATSAPP_AI_TESTING_MODE;
  delete require.cache[require.resolve('../../services/conversationTestingMode')];
  const { isConversationTestingModeEnabled, isConversationSafetyBlockEnabled } = require(
    '../../services/conversationTestingMode'
  );
  assert.equal(isConversationTestingModeEnabled(), true);
  assert.equal(isConversationSafetyBlockEnabled(), false);
  process.env.WHATSAPP_AI_TESTING_MODE = previous;
});

test('WHATSAPP_AI_TESTING_MODE=false reativa bloqueios', () => {
  const previous = process.env.WHATSAPP_AI_TESTING_MODE;
  process.env.WHATSAPP_AI_TESTING_MODE = 'false';
  delete require.cache[require.resolve('../../services/conversationTestingMode')];
  const { isConversationTestingModeEnabled, isConversationSafetyBlockEnabled } = require(
    '../../services/conversationTestingMode'
  );
  assert.equal(isConversationTestingModeEnabled(), false);
  assert.equal(isConversationSafetyBlockEnabled(), true);
  process.env.WHATSAPP_AI_TESTING_MODE = previous;
});
