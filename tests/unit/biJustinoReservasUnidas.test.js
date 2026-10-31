'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  chaveDuplicata,
  deAgilizai,
  entradasDeDionisio,
  unir,
  docsPorDia,
  extrasDionisio,
  somarFaixa,
  somarNoQuadro,
  aplicarExtrasNoLive,
} = require('../../services/biJustino/reservasUnidas');

test('chaveDuplicata junta telefone pelo final e, sem telefone, o nome na data', () => {
  assert.equal(
    chaveDuplicata('2026-10-30', '(11) 98888-1234', 'Ana'),
    chaveDuplicata('2026-10-30', '11988881234', 'Outra'),
  );
  assert.equal(
    chaveDuplicata('2026-10-30', '', 'José da Silva'),
    chaveDuplicata('2026-10-30', null, 'Jose da Silva'),
  );
  assert.equal(chaveDuplicata('30/10/2026', '11988881234', 'Ana'), '');
});

test('unir conta reserva duplicada nas duas plataformas como uma só e marca fonte ambos', () => {
  const dionisio = entradasDeDionisio({
    items: [
      {
        id: 'dio-1',
        date: '2026-10-30',
        pax: 4,
        tipo: 'aniversario',
        nomeCliente: 'Ana Souza',
        telefone: '11988881234',
        email: 'ana@dionisio.com',
        observacao: 'bolo',
        submittedByName: 'Renato',
        submittedAt: '2026-10-29T12:00:00.000Z',
        convidados: 'Bia\nCaio',
        origem: 'instagram',
        ativacaoId: 'ig-1',
        hora: '20:00',
      },
      {
        id: 'dio-2',
        date: '2026-10-31',
        pax: 2,
        tipo: 'normal',
        nomeCliente: 'Só Dionísio',
        telefone: '11977770000',
        email: '',
        observacao: '',
        submittedByName: 'Renato',
        submittedAt: '2026-10-30T12:00:00.000Z',
        convidados: '',
        origem: 'whatsapp',
        ativacaoId: '',
        hora: '21:00',
      },
    ],
  });
  const agilizai = [
    deAgilizai({
      id: 88,
      date: '2026-10-30',
      pax: 5,
      hora: '20:30',
      client_name: 'Ana Souza',
      client_phone: '11 98888-1234',
      client_email: 'ana@agilizai.com',
      origin: 'instagram',
      notes: 'mesa 12',
      created_at: '2026-10-28T18:00:00.000Z',
      created_by_name: 'Jefferson',
      event_type: 'aniversario',
    }),
    deAgilizai({
      id: 89,
      date: '2026-11-01',
      pax: 3,
      hora: '19:00',
      client_name: 'Só Agilizai',
      client_phone: '11966660000',
      client_email: '',
      origin: 'site',
      notes: '',
      created_at: '2026-10-29T18:00:00.000Z',
      created_by_name: 'Sistema',
      event_type: null,
    }),
  ];

  const items = unir(dionisio, agilizai);
  assert.equal(items.length, 3);

  const ana = items.find((item) => item.nomeCliente === 'Ana Souza');
  assert.equal(ana.fonte, 'ambos');
  assert.equal(ana.id, 'dio-1');
  assert.equal(ana.idAgilizai, 88);
  assert.equal(ana.pax, 5);
  assert.equal(ana.tipo, 'aniversario');
  assert.equal(ana.convidados, 'Bia\nCaio');
  assert.equal(ana.hora, '20:30');
  assert.equal(ana.email, 'ana@agilizai.com');

  assert.equal(items.find((item) => item.nomeCliente === 'Só Dionísio').fonte, 'dionisio');
  assert.equal(items.find((item) => item.nomeCliente === 'Só Agilizai').fonte, 'agilizai');
  assert.equal(items.find((item) => item.nomeCliente === 'Só Agilizai').id, 'agilizai:89');
});

test('docsPorDia soma pax uma vez só quando a reserva veio das duas fontes', () => {
  const docs = docsPorDia(unir(
    entradasDeDionisio({
      items: [
        { id: 'a', date: '2026-10-30', pax: 4, tipo: 'happyHour', nomeCliente: 'Ana', telefone: '11988881234', hora: '18:00', submittedAt: '2026-10-29T12:00:00.000Z' },
        { id: 'b', date: '2026-10-30', pax: 2, tipo: 'normal', nomeCliente: 'Beto', telefone: '11911110000', hora: '', submittedAt: '2026-10-29T13:00:00.000Z' },
      ],
    }),
    [deAgilizai({
      id: 1, date: '2026-10-30', pax: 4, hora: '18:30', client_name: 'Ana', client_phone: '988881234', origin: '', notes: '', created_at: '', created_by_name: '', event_type: '',
    })],
  ));
  assert.equal(docs.length, 1);
  assert.equal(docs[0].pax, 6);
  assert.equal(docs[0].happyHour, 1);
});

test('extrasDionisio ignora o que já existe no Agilizaiapp e somarFaixa/quadro só conta o restante', () => {
  const dionisio = [
    { date: '2026-10-30', pax: 4, telefone: '11988881234', nomeCliente: 'Ana', tipo: 'aniversario' },
    { date: '2026-10-30', pax: 2, telefone: '11977770000', nomeCliente: 'Beto', tipo: 'normal' },
  ];
  const extras = extrasDionisio(dionisio, new Set([chaveDuplicata('2026-10-30', '11988881234', 'Ana')]));
  assert.equal(extras.length, 1);
  assert.equal(extras[0].nomeCliente, 'Beto');

  const soma = somarFaixa(extras, '2026-10-30', '2026-10-31');
  assert.deepEqual(soma, { reservas: 1, pessoas: 2 });

  const quadro = somarNoQuadro({
    indicadores: { reservas: [0, 0, 0, 0, 1, 0, 0], pessoas: [0, 0, 0, 0, 4, 0, 0], checkins: [0, 0, 0, 0, 1, 0, 0] },
    dias: [{ data: '2026-10-30', dow: 5, reservas: 1, pessoas: 4, checkins: 1, aniversario: 0, despedida: 0, listaSexta: 0 }],
  }, extras);
  assert.equal(quadro.dias[0].reservas, 2);
  assert.equal(quadro.dias[0].pessoas, 6);
  assert.equal(quadro.indicadores.reservas[4], 2);
  assert.equal(quadro.indicadores.checkins[4], 1);
});

test('aplicarExtrasNoLive soma só o que ainda não está no Agilizaiapp', () => {
  const live = aplicarExtrasNoLive({
    hoje: { reservas: 3, pessoas: 10, checkins: 2, convidados: 1 },
    agenda: { reservas: 5, pessoas: 20 },
    mes: { reservas: 8, pessoas: 40 },
    quadroSemana: {
      indicadores: { reservas: [0, 0, 0, 0, 3, 0, 0], pessoas: [0, 0, 0, 0, 10, 0, 0], checkins: [0, 0, 0, 0, 2, 0, 0] },
      dias: [{ data: '2026-10-30', dow: 5, reservas: 3, pessoas: 10, checkins: 2, aniversario: 0, despedida: 0, listaSexta: 0 }],
    },
  }, [{ date: '2026-10-30', pax: 2, tipo: 'normal' }], '2026-10-30');
  assert.equal(live.hoje.reservas, 4);
  assert.equal(live.hoje.pessoas, 12);
  assert.equal(live.hoje.checkins, 2);
  assert.equal(live.agenda.reservas, 6);
  assert.equal(live.mes.reservas, 9);
  assert.equal(live.quadroSemana.dias[0].reservas, 4);
});
