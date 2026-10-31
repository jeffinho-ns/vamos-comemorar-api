const test = require('node:test');
const assert = require('node:assert/strict');
const {
  shouldOfferIceBreakers,
  appendIceBreakers,
} = require('../../services/agent/iceBreakerService');

const settings = {
  ice_breakers_enabled: true,
  ice_breakers_channels: ['whatsapp'],
};

test('shouldOfferIceBreakers só no primeiro oi, sem intenção de reserva', () => {
  assert.equal(
    shouldOfferIceBreakers({
      settings,
      userText: 'Oi, boa noite!',
      messageHistory: [{ role: 'user', content: 'Oi, boa noite!' }],
    }),
    true
  );
  assert.equal(
    shouldOfferIceBreakers({
      settings,
      userText: 'Quero reservar mesa para 4 pessoas',
      messageHistory: [{ role: 'user', content: 'Quero reservar mesa para 4 pessoas' }],
    }),
    false
  );
});

test('appendIceBreakers junta no máximo duas perguntas sem repetir', () => {
  const text = appendIceBreakers('Oi! Tudo bem?', [
    { question: 'Você já conhece a casa?' },
    { question: 'Vem comemorar alguma data especial?' },
    { question: 'Terceira não entra' },
  ]);
  assert.match(text, /Oi! Tudo bem\? Você já conhece a casa\?/);
  assert.match(text, /data especial/);
  assert.doesNotMatch(text, /Terceira/);
});
