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

const COMPLETE_IDENTITY = {
  client_name: 'Maria Silva',
  client_email: 'maria@example.com',
  data_nascimento: '1990-01-15',
};

test('buildCreatePreReservaArgs não cria no Pracinha com área vazia, padrão ou Deck genérico', () => {
  const base = {
    establishment_id: 8,
    reservation_date: '2026-10-30',
    reservation_time: '19:00',
    quantidade_convidados: 4,
    ...COMPLETE_IDENTITY,
  };

  assert.equal(buildCreatePreReservaArgs({ ...base, area_label: 'padrão' }, {}), null);
  assert.equal(buildCreatePreReservaArgs({ ...base, area_label: 'Deck - Mesas' }, {}), null);
  assert.equal(buildCreatePreReservaArgs({ ...base, area_label: '' }, {}), null);

  const ok = buildCreatePreReservaArgs({ ...base, area_label: 'Balcão' }, {});
  assert.ok(ok);
  assert.equal(ok.area, 'Balcão');

  const praca = buildCreatePreReservaArgs({ ...base, area_label: 'Praça' }, {});
  assert.ok(praca);
  assert.equal(praca.area, 'Praça');
});

test('buildCreatePreReservaArgs não cria no Justino sem coberta ou descoberta', () => {
  const base = {
    establishment_id: 1,
    reservation_date: '2026-10-30',
    reservation_time: '20:00',
    quantidade_convidados: 4,
    ...COMPLETE_IDENTITY,
  };

  assert.equal(buildCreatePreReservaArgs({ ...base, area_label: 'padrão' }, {}), null);
  assert.equal(buildCreatePreReservaArgs({ ...base, area_label: 'Deck - Mesas' }, {}), null);
  assert.equal(buildCreatePreReservaArgs({ ...base, area_label: 'qualquer' }, {}), null);

  const coberta = buildCreatePreReservaArgs({ ...base, area_label: 'área coberta' }, {});
  assert.ok(coberta);
  assert.match(coberta.area, /coberta/i);

  const descoberta = buildCreatePreReservaArgs({ ...base, area_label: 'área descoberta' }, {});
  assert.ok(descoberta);
  assert.match(descoberta.area, /descoberta/i);
});

test('resolveAreaLabelForCreate no Pracinha e no Justino pede escolha se a área não é válida', async () => {
  const { resolveAreaLabelForCreate } = require('../../services/agent/deterministicReservationClose');

  const pracinhaVazio = await resolveAreaLabelForCreate(
    null,
    { establishment_id: 8, area_label: 'padrão' },
    {},
    'quero reservar'
  );
  assert.equal(pracinhaVazio.needsChoice, true);
  assert.equal(pracinhaVazio.label, '');

  const pracinhaOk = await resolveAreaLabelForCreate(
    null,
    { establishment_id: 8 },
    {},
    'quero o Balcão'
  );
  assert.equal(pracinhaOk.needsChoice, undefined);
  assert.equal(pracinhaOk.label, 'Balcão');

  const justinoVazio = await resolveAreaLabelForCreate(
    null,
    { establishment_id: 1, area_label: 'Deck - Mesas' },
    {},
    'sexta às 20h'
  );
  assert.equal(justinoVazio.needsChoice, true);

  const justinoQualquer = await resolveAreaLabelForCreate(
    null,
    { establishment_id: 1 },
    {},
    'tanto faz'
  );
  assert.equal(justinoQualquer.needsChoice, true);

  const justinoOk = await resolveAreaLabelForCreate(
    null,
    { establishment_id: 1 },
    {},
    'prefiro a coberta'
  );
  assert.equal(justinoOk.needsChoice, undefined);
  assert.match(justinoOk.label, /coberta/i);
});

test('snapshot da criação só confirma vaga com a mesma regra do criar', () => {
  const {
    snapshotConfirmsVacancyForCreate,
    buildConfirmedVacancyMessage,
    resolveLabelFromHighlineSnapshot,
  } = require('../../services/agent/deterministicReservationClose');

  assert.equal(snapshotConfirmsVacancyForCreate(null), false);
  assert.equal(snapshotConfirmsVacancyForCreate({ ok: false }), false);
  assert.equal(snapshotConfirmsVacancyForCreate({ ok: true, todas_areas_cheias: true }), false);
  assert.equal(
    snapshotConfirmsVacancyForCreate({
      ok: true,
      todas_areas_cheias: false,
      area_recomendada: null,
      areas_com_vaga_labels: [],
    }),
    false
  );
  assert.equal(buildConfirmedVacancyMessage({ ok: true, todas_areas_cheias: true }), null);
  assert.equal(buildConfirmedVacancyMessage({ ok: false }), null);

  const withVacancy = {
    ok: true,
    todas_areas_cheias: false,
    area_recomendada: { label: 'Deck - Mesas' },
    areas_com_vaga_labels: ['Deck - Mesas'],
  };
  assert.equal(snapshotConfirmsVacancyForCreate(withVacancy), true);
  const phrase = buildConfirmedVacancyMessage(withVacancy);
  assert.match(phrase, /vaga/i);
  assert.doesNotMatch(phrase, /não tem|sem mesa|fechad/i);

  const full = resolveLabelFromHighlineSnapshot(
    { ok: true, todas_areas_cheias: true, area_recomendada: null },
    'Deck - Mesas'
  );
  assert.equal(full.todasCheias, true);
  assert.equal(full.label, '');

  const broken = resolveLabelFromHighlineSnapshot({ ok: false }, 'Deck - Mesas');
  assert.equal(broken.todasCheias || broken.semMesa, true);
  assert.notEqual(broken.label, 'Deck - Mesas');
});

test('shouldRefuseSecondCreate e tryDeterministicReservationClose não criam de novo', async () => {
  const {
    shouldRefuseSecondCreate,
    secondCreateRefuseReply,
    tryDeterministicReservationClose,
  } = require('../../services/agent/deterministicReservationClose');

  assert.equal(shouldRefuseSecondCreate({}, 'passa para 8 pessoas'), false);
  assert.equal(
    shouldRefuseSecondCreate({ reservation_created: true }, 'passa para 8 pessoas'),
    true
  );
  assert.equal(
    shouldRefuseSecondCreate({ reservation_id: 99 }, 'muda o horário para 22h'),
    true
  );
  assert.equal(
    shouldRefuseSecondCreate({ reservation_created: true }, 'obrigada'),
    false
  );

  const reply = secondCreateRefuseReply('passa para 8 pessoas');
  assert.match(reply, /Sua reserva já está feita/i);
  assert.match(reply, /chame a equipe/i);
  assert.match(reply, /8 pessoas/);

  const created = {
    establishment_id: 7,
    reservation_date: '2026-08-08',
    reservation_time: '20:00',
    quantidade_convidados: 4,
    area_label: 'Deck - Mesas',
    reservation_created: true,
    reservation_id: 55,
    ...COMPLETE_IDENTITY,
  };

  const skippedCreated = await tryDeterministicReservationClose({
    pool: {},
    workingState: created,
    userText: 'passa para 8 pessoas',
  });
  assert.equal(skippedCreated, null);

  const skippedById = await tryDeterministicReservationClose({
    pool: {},
    workingState: { ...created, reservation_created: false, reservation_id: 88 },
    userText: 'passa para 8 pessoas',
  });
  assert.equal(skippedById, null);
});
