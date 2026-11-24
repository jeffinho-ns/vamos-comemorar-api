const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  resolveReservaRooftopGuestZone,
  resolveReservaRooftopPublicAreaId,
  isCreatableRooftopAreaLabel,
  guestAreaPromptForClient,
} = require('../../services/agent/reservaRooftopReservationAreas');

test('Rooftop reconhece interna, externa e salão', () => {
  assert.deepEqual(resolveReservaRooftopGuestZone('área interna'), {
    key: 'interna',
    label: 'Área Interna',
  });
  assert.deepEqual(resolveReservaRooftopGuestZone('área descoberta'), {
    key: 'externa',
    label: 'Área Externa',
  });
  assert.deepEqual(resolveReservaRooftopGuestZone('salão'), {
    key: 'salao',
    label: 'Salão',
  });
  assert.equal(resolveReservaRooftopGuestZone('deck mesas'), null);
});

test('pergunta do Rooftop inclui as três opções do painel', () => {
  assert.match(guestAreaPromptForClient(), /interna/i);
  assert.match(guestAreaPromptForClient(), /externa/i);
  assert.match(guestAreaPromptForClient(), /sal[aã]o/i);
});

test('resolve area_id público do Rooftop pelo label do painel', () => {
  const areas = [
    { id: 7005, name: 'Reserva Rooftop - Área Externa' },
    { id: 7006, name: 'Reserva Rooftop - Área Interna' },
    { id: 7007, name: 'Reserva Rooftop - Salão' },
    { id: 7, name: 'Reserva Rooftop - LG 1' },
  ];
  assert.equal(resolveReservaRooftopPublicAreaId('Área Interna', areas), 7006);
  assert.equal(resolveReservaRooftopPublicAreaId('Área Externa', areas), 7005);
  assert.equal(resolveReservaRooftopPublicAreaId('Salão', areas), 7007);
  assert.equal(isCreatableRooftopAreaLabel('Deck - Mesas'), false);
  assert.equal(isCreatableRooftopAreaLabel('Salão'), true);
});
