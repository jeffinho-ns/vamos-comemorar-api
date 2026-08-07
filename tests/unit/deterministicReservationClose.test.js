const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildCreatePreReservaArgs,
  reservationFunnelIsComplete,
} = require('../../services/agent/deterministicReservationClose');
const { getReservationMissingFields } = require('../../services/agent/reservationFunnel');

test('buildCreatePreReservaArgs monta payload completo a partir do workingState', () => {
  const args = buildCreatePreReservaArgs(
    {
      establishment_id: 7,
      reservation_date: '2026-08-08',
      reservation_time: '20:00',
      quantidade_convidados: 4,
      client_name: 'Maria Silva',
      client_email: 'maria@example.com',
      data_nascimento: '1990-01-15',
      area_label: 'Deck - Mesas',
    },
    {}
  );

  assert.ok(args);
  assert.equal(args.estabelecimento_id, 7);
  assert.equal(args.data, '2026-08-08');
  assert.equal(args.horario, '20:00');
  assert.equal(args.quantidade_pessoas, 4);
  assert.equal(args.area, 'Deck - Mesas');
  assert.equal(args.cliente_dados.nome, 'Maria Silva');
  assert.equal(args.cliente_dados.email, 'maria@example.com');
  assert.equal(args.cliente_dados.data_nascimento, '1990-01-15');
});

test('buildCreatePreReservaArgs retorna null se faltar dado obrigatório', () => {
  const args = buildCreatePreReservaArgs(
    {
      establishment_id: 7,
      reservation_date: '2026-08-08',
      reservation_time: '20:00',
      quantidade_convidados: 4,
      client_name: 'Maria Silva',
      // sem email
      data_nascimento: '1990-01-15',
      area_label: 'Deck - Mesas',
    },
    {}
  );
  assert.equal(args, null);
});

test('reservationFunnelIsComplete alinha com getReservationMissingFields', () => {
  const incomplete = {
    establishment_id: 7,
    reservation_date: '2026-08-08',
    reservation_time: '20:00',
    quantidade_convidados: 4,
  };
  assert.equal(reservationFunnelIsComplete(incomplete), false);
  assert.ok(getReservationMissingFields(incomplete).length > 0);

  const complete = {
    ...incomplete,
    client_name: 'Maria Silva',
    client_email: 'maria@example.com',
    data_nascimento: '1990-01-15',
  };
  assert.equal(reservationFunnelIsComplete(complete), true);
  assert.equal(getReservationMissingFields(complete).length, 0);
});
