'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { formatVenueAddress } = require('../../services/venueAddress');

test('formatVenueAddress monta o endereço do Reserva Pinheiros', () => {
  const address = formatVenueAddress({
    endereco: 'Rua Fidalga',
    numero: '360',
    bairro: 'Pinheiros',
    cidade: 'São Paulo',
    estado: 'SP',
    cep: '05432-070',
  });

  assert.equal(address.street, 'Rua Fidalga');
  assert.equal(address.numberInt, 360);
  assert.equal(
    address.formatted,
    'Rua Fidalga, 360 - Pinheiros, São Paulo - SP - 05432-070',
  );
});
