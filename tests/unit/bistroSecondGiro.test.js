const test = require('node:test');
const assert = require('node:assert/strict');

const {
  isSecondGiroBistro,
  shouldForceEsperaAntecipada,
  extractLinkedReservationId,
  withEsperaAntecipadaNotes,
  stripEsperaAntecipadaNotes,
} = require('../../services/bistroSecondGiro');

test('Pracinha domingo à noite é 2º giro, mas dia vazio não força espera', () => {
  assert.equal(
    isSecondGiroBistro({
      date: '2026-09-06',
      time: '19:00',
      profile: 'pracinha',
    }),
    true,
  );
  assert.equal(
    shouldForceEsperaAntecipada({ isSecondGiro: true, occupyingCount: 0 }),
    false,
  );
  assert.equal(
    shouldForceEsperaAntecipada({ isSecondGiro: true, occupyingCount: 1 }),
    true,
  );
});

test('Pracinha sábado às 19:00 não é 2º giro (casa abre às 18:00, sem almoço)', () => {
  assert.equal(
    isSecondGiroBistro({
      date: '2026-09-05',
      time: '19:00',
      profile: 'pracinha',
    }),
    false,
  );
  assert.equal(
    isSecondGiroBistro({
      date: '2026-09-05',
      time: '21:30',
      profile: 'pracinha',
    }),
    true,
  );
});

test('Seu Justino sábado às 19:00 continua 2º giro (almoço 12:00–15:00)', () => {
  assert.equal(
    isSecondGiroBistro({
      date: '2026-09-05',
      time: '19:00',
      profile: 'seu_justino',
    }),
    true,
  );
  assert.equal(
    isSecondGiroBistro({
      date: '2026-09-05',
      time: '13:00',
      profile: 'seu_justino',
    }),
    false,
  );
});

test('capacidade lotada também força espera no 2º giro', () => {
  assert.equal(
    shouldForceEsperaAntecipada({
      isSecondGiro: true,
      occupyingCount: 0,
      capacityFull: true,
    }),
    true,
  );
});

test('extrai e limpa notas de espera antecipada', () => {
  assert.equal(
    extractLinkedReservationId('Reserva de Espera Antecipada (ID: 23) - ESPERA ANTECIPADA (Bistrô)'),
    23,
  );
  assert.equal(
    withEsperaAntecipadaNotes('Aniversário'),
    'Aniversário | ESPERA ANTECIPADA (Bistrô)',
  );
  assert.equal(
    stripEsperaAntecipadaNotes('Aniversário | ESPERA ANTECIPADA (Bistrô)'),
    'Aniversário',
  );
});
