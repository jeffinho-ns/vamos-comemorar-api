const test = require('node:test');
const assert = require('node:assert/strict');
const { resolvePracinhaGuestArea } = require('../../services/agent/pracinhaReservationAreas');

test('salão, interno e parte de cima viram Balcão no Pracinha', () => {
  assert.deepEqual(resolvePracinhaGuestArea('Quero o salão'), { label: 'Balcão', key: 'balcao' });
  assert.deepEqual(resolvePracinhaGuestArea('prefiro o interno'), { label: 'Balcão', key: 'balcao' });
  assert.deepEqual(resolvePracinhaGuestArea('a parte de cima'), { label: 'Balcão', key: 'balcao' });
  assert.deepEqual(resolvePracinhaGuestArea('lá em cima'), { label: 'Balcão', key: 'balcao' });
  assert.deepEqual(resolvePracinhaGuestArea('balcão'), { label: 'Balcão', key: 'balcao' });
});

test('praça, externo e parte de baixo viram Praça no Pracinha', () => {
  assert.deepEqual(resolvePracinhaGuestArea('quero a praça'), { label: 'Praça', key: 'praca' });
  assert.deepEqual(resolvePracinhaGuestArea('área externa'), { label: 'Praça', key: 'praca' });
  assert.deepEqual(resolvePracinhaGuestArea('a parte de baixo'), { label: 'Praça', key: 'praca' });
  assert.deepEqual(resolvePracinhaGuestArea('lado de fora'), { label: 'Praça', key: 'praca' });
  assert.deepEqual(resolvePracinhaGuestArea('do lado de fora'), { label: 'Praça', key: 'praca' });
});

test('Apê não vira área de mesa no Pracinha', () => {
  assert.equal(resolvePracinhaGuestArea('quero o apê'), null);
  assert.equal(resolvePracinhaGuestArea('reserva no ape'), null);
  assert.equal(resolvePracinhaGuestArea(''), null);
  assert.equal(resolvePracinhaGuestArea(null), null);
});
