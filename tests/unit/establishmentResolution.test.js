const test = require('node:test');
const assert = require('node:assert/strict');
const {
  detectEstablishmentFromText,
  resolveEstablishmentForTurn,
  looksLikeFreshReservationStart,
} = require('../../services/conversationEngine/helpers');

const establishments = [
  { id: 1, name: 'Seu Justino' },
  { id: 4, name: 'Oh Fregues' },
  { id: 7, name: 'Highline' },
  { id: 8, name: 'Pracinha do Seu Justino' },
  { id: 9, name: 'Reserva Rooftop' },
];

test('detectEstablishmentFromText prioriza o nome mais específico', () => {
  assert.equal(
    detectEstablishmentFromText('Me ajude no Pracinha do Seu Justino no sábado', establishments),
    8
  );
  assert.equal(
    detectEstablishmentFromText('Eu quero uma nova reserva no estabelecimento Reserva Rooftop', establishments),
    9
  );
});

test('resolveEstablishmentForTurn usa o estabelecimento citado na mensagem atual', () => {
  assert.equal(
    resolveEstablishmentForTurn({
      messageText: 'Eu quero fazer uma nova reserva no Reserva Rooftop no dia 16/05/2026',
      messageHistory: [],
      establishments,
      lockedEstablishmentId: 4,
      conversationEstablishmentId: 4,
      collectedFields: { establishment_id: 4, reservation_date: '2026-05-16' },
    }),
    9
  );
});

// Regressão: bug do "rooftop" sozinho sequestrando conversa do Highline.
// Caso real reportado em produção: cliente pediu reserva no Highline e ao
// mencionar "rooftop" / "área rooftop" / "camarote rooftop" a IA trocou
// silenciosamente para Reserva Rooftop (id 9). Patch: o alias 'rooftop'
// solto foi removido — só 'reserva rooftop' (string completa) resolve para 9.
test('detectEstablishmentFromText NÃO confunde "rooftop" sozinho com Reserva Rooftop', () => {
  // "rooftop" sozinho, sem nome de outro estabelecimento na mensagem → null
  // (caller deve cair no fallback de lockedEstablishmentId).
  assert.equal(
    detectEstablishmentFromText('quero camarote rooftop pra sábado', establishments),
    null
  );
  assert.equal(
    detectEstablishmentFromText('a área rooftop tem visão da cidade?', establishments),
    null
  );
});

test('detectEstablishmentFromText mantém Highline quando mensagem cita Highline + rooftop', () => {
  // Caso direto do bug Julia Monteiro.
  assert.equal(
    detectEstablishmentFromText('quero reserva no Highline na área rooftop', establishments),
    7
  );
  assert.equal(
    detectEstablishmentFromText('camarote rooftop no Highline', establishments),
    7
  );
});

test('resolveEstablishmentForTurn preserva lock no Highline quando cliente menciona "rooftop" depois', () => {
  // Conversa começou no Highline (lock = 7), cliente mencionou "rooftop" no
  // turno atual — não deve trocar pra Reserva Rooftop (id 9).
  assert.equal(
    resolveEstablishmentForTurn({
      messageText: 'queria saber se a área rooftop tá disponível',
      messageHistory: [{ role: 'user', content: 'oi, quero reserva no Highline' }],
      establishments,
      lockedEstablishmentId: 7,
      conversationEstablishmentId: 7,
      collectedFields: { establishment_id: 7 },
    }),
    7
  );
});

test('looksLikeFreshReservationStart reconhece reinício de reserva', () => {
  assert.equal(
    looksLikeFreshReservationStart('Eu quero uma nova reserva no estabelecimento Reserva Rooftop'),
    true
  );
  assert.equal(looksLikeFreshReservationStart('17:00'), false);
});

const { normalizeCanonicalEstablishmentId } = require('../../services/whatsappReservationService');

test('normalizeCanonicalEstablishmentId mapeia o bar Reserva Rooftop para o place 9', () => {
  assert.equal(normalizeCanonicalEstablishmentId(5), 9);
  assert.equal(normalizeCanonicalEstablishmentId(9), 9);
});
