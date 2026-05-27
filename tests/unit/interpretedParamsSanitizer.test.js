const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  sanitizeInterpretedParams,
  looksLikeRealHumanName,
  looksLikePlausibleBirthDate,
} = require('../../services/conversationEngine/interpretedParamsSanitizer');

test('looksLikeRealHumanName: rejeita perguntas/frases do cliente', () => {
  assert.equal(looksLikeRealHumanName('Gostaria de saber os valores'), false);
  assert.equal(looksLikeRealHumanName('Mais para frente entro em contato'), false);
  assert.equal(looksLikeRealHumanName('Quero fazer uma reserva'), false);
  assert.equal(looksLikeRealHumanName('Como funciona aniversario?'), false);
});

test('looksLikeRealHumanName: aceita nomes reais', () => {
  assert.equal(looksLikeRealHumanName('Luan Campos Costa'), true);
  assert.equal(looksLikeRealHumanName('Amalia Benedetti'), true);
  assert.equal(looksLikeRealHumanName('Giovanna Cardoso'), true);
  assert.equal(looksLikeRealHumanName('João da Silva'), true);
});

test('looksLikeRealHumanName: rejeita nome único', () => {
  assert.equal(looksLikeRealHumanName('Maria'), false);
  assert.equal(looksLikeRealHumanName(''), false);
  assert.equal(looksLikeRealHumanName(null), false);
});

test('looksLikePlausibleBirthDate: rejeita datas alucinadas pelo LLM', () => {
  assert.equal(looksLikePlausibleBirthDate('2026-05-30'), false); // futuro / mesmo ano
  assert.equal(looksLikePlausibleBirthDate('2020-05-30'), false); // 6 anos (LLM confundiu "20h" com ano)
  assert.equal(looksLikePlausibleBirthDate('2024-06-13'), false);
});

test('looksLikePlausibleBirthDate: aceita datas plausíveis', () => {
  assert.equal(looksLikePlausibleBirthDate('1997-07-17'), true); // ~29 anos
  assert.equal(looksLikePlausibleBirthDate('2001-06-13'), true); // ~25 anos
  assert.equal(looksLikePlausibleBirthDate('1985-01-01'), true); // ~41 anos
});

test('sanitizeInterpretedParams: descarta data_nascimento alucinada de "30/05 20h"', () => {
  const result = sanitizeInterpretedParams(
    {
      reservation_date: '2026-05-30',
      reservation_time: '20:00',
      data_nascimento: '2020-05-30',
    },
    { userMessage: '30/05\n20h', lockedEstablishmentId: 7 }
  );
  assert.equal(result.cleaned.data_nascimento, undefined);
  assert.equal(result.cleaned.reservation_date, '2026-05-30');
  assert.ok(result.dropped.some((d) => d.field === 'data_nascimento'));
});

test('sanitizeInterpretedParams: descarta client_name de pergunta do cliente', () => {
  const result = sanitizeInterpretedParams(
    { client_name: 'Gostaria De Saber Os Valores' },
    { userMessage: 'Gostaria de saber os valores' }
  );
  assert.equal(result.cleaned.client_name, undefined);
  assert.ok(result.dropped.some((d) => d.field === 'client_name'));
});

test('sanitizeInterpretedParams: bloqueia troca silenciosa de establishment_id', () => {
  const result = sanitizeInterpretedParams(
    { establishment_id: 9, area_id: 'Rooftop' },
    {
      userMessage: 'Rooftop',
      lockedEstablishmentId: 7,
      establishmentMentionedInMessage: false,
    }
  );
  assert.equal(result.cleaned.establishment_id, 7);
  assert.ok(result.dropped.some((d) => d.field === 'establishment_id'));
});

test('sanitizeInterpretedParams: permite troca quando cliente menciona casa explicitamente', () => {
  const result = sanitizeInterpretedParams(
    { establishment_id: 8 },
    {
      userMessage: 'quero reservar na Pracinha do Seu Justino',
      lockedEstablishmentId: 7,
      establishmentMentionedInMessage: true,
    }
  );
  assert.equal(result.cleaned.establishment_id, 8);
});

test('sanitizeInterpretedParams: aceita data_nascimento real quando msg tem ano', () => {
  const result = sanitizeInterpretedParams(
    { data_nascimento: '1997-07-17' },
    { userMessage: '17/07/1997', lockedEstablishmentId: 7 }
  );
  assert.equal(result.cleaned.data_nascimento, '1997-07-17');
});
