'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  isSaturdayIsoDate,
  buildSaturdaySeatingConfirmationNotice,
} = require('../../services/agent/saturdaySeatingNotice');
const {
  synthesizeReplyFromToolTrace,
  sanitizeAssistantReply,
} = require('../../services/agent/agentService');
const { detectFaqTopicsFromUserText } = require('../../services/agent/faqTopicCanonical');
const { SEU_JUSTINO_FAQS } = require('../../services/agent/seuJustinoFaqCatalog');
const { PRACINHA_FAQS } = require('../../services/agent/pracinhaFaqCatalog');
const { HOUSE_RULES_BY_ESTABLISHMENT } = require('../../services/agent/houseRulesCatalog');

// 2026-11-28 é sábado; 2026-11-27 é sexta-feira
const SATURDAY_ISO = '2026-11-28';
const FRIDAY_ISO = '2026-11-27';

test('isSaturdayIsoDate identifica sábado com precisão', () => {
  assert.equal(isSaturdayIsoDate(SATURDAY_ISO), true);
  assert.equal(isSaturdayIsoDate(FRIDAY_ISO), false);
});

test('Seu Justino (id=1): sábado das 14h às 17h avisa mesa com 8 assentos e dois bistrôs de suporte', () => {
  for (const time of ['14:00', '15:30', '17:00']) {
    const notice = buildSaturdaySeatingConfirmationNotice({
      establishmentId: 1,
      reservationDate: SATURDAY_ISO,
      reservationTime: time,
    });
    assert.match(notice, /mesa com 8 assentos e dois bistrôs de suporte/);
    assert.match(notice, /Conforme os convidados forem chegando/);
  }
});

test('Pracinha (id=8): sábado das 14h às 17h avisa mesa com 10 assentos e dois bistrôs de suporte', () => {
  for (const time of ['14:00', '16:00', '17:00']) {
    const notice = buildSaturdaySeatingConfirmationNotice({
      establishmentId: 8,
      reservationDate: SATURDAY_ISO,
      reservationTime: time,
    });
    assert.match(notice, /mesa com 10 assentos e dois bistrôs de suporte/);
    assert.match(notice, /Conforme os convidados forem chegando/);
  }
});

test('Seu Justino e Pracinha: sábado após as 17h avisa mesa com 6 assentos e bistrô até ficar pronta', () => {
  for (const establishmentId of [1, 8]) {
    for (const time of ['17:01', '17:30', '19:00', '21:30']) {
      const notice = buildSaturdaySeatingConfirmationNotice({
        establishmentId,
        reservationDate: SATURDAY_ISO,
        reservationTime: time,
      });
      assert.match(notice, /reserva de mesa com 6 assentos/);
      assert.match(notice, /disponibilizar uma mesa bistrô até que sua mesa fique pronta/);
    }
  }
});

test('outros dias da semana ou outras casas não recebem o aviso específico de sábado', () => {
  assert.equal(
    buildSaturdaySeatingConfirmationNotice({
      establishmentId: 1,
      reservationDate: FRIDAY_ISO,
      reservationTime: '19:00',
    }),
    null
  );
  assert.equal(
    buildSaturdaySeatingConfirmationNotice({
      establishmentId: 7,
      reservationDate: SATURDAY_ISO,
      reservationTime: '18:00',
    }),
    null
  );
});

test('synthesizeReplyFromToolTrace e sanitizeAssistantReply incluem o aviso ao fechar reserva de sábado', () => {
  const traceJustinoAfternoon = [
    {
      name: 'criar_pre_reserva',
      result: {
        ok: true,
        pre_reserva: {
          establishment_id: 1,
          reservation_id: 501,
          reservation_date: SATURDAY_ISO,
          reservation_time: '15:00',
          area_label: 'área descoberta',
          mesas_combinadas: { mesas_count: 2 },
        },
      },
    },
  ];
  const replyJustino = synthesizeReplyFromToolTrace(traceJustinoAfternoon);
  assert.match(replyJustino, /^Fechado! Sua reserva ficou pra 28\/11\/2026 às 15:00 na área descoberta\./);
  assert.doesNotMatch(replyJustino, /🎉|—/); // Justino não usa emoji nem travessão
  assert.doesNotMatch(replyJustino, /mesas juntas/);
  assert.match(replyJustino, /mesa com 8 assentos e dois bistrôs de suporte/);

  const tracePracinhaNight = [
    {
      name: 'criar_pre_reserva',
      result: {
        ok: true,
        pre_reserva: {
          establishment_id: 8,
          reservation_id: 502,
          reservation_date: SATURDAY_ISO,
          reservation_time: '19:30',
          area_label: 'Praça',
        },
      },
    },
  ];
  const sanitized = sanitizeAssistantReply('Pronto, reserva confirmada!', {
    toolTrace: tracePracinhaNight,
    establishmentId: 8,
  });
  assert.match(sanitized.text, /28\/11\/2026 às 19:30 na Praça/);
  assert.match(sanitized.text, /reserva de mesa com 6 assentos/);
  assert.match(sanitized.text, /mesa bistrô até que sua mesa fique pronta/);
});

test('Regras da Casa e Informações adicionais de Justino e Pracinha cobrem sábado e insistência', () => {
  assert.ok(
    HOUSE_RULES_BY_ESTABLISHMENT[1].custom_rules.some((r) => /8 assentos e dois bistrôs/.test(r))
  );
  assert.ok(
    HOUSE_RULES_BY_ESTABLISHMENT[1].custom_rules.some((r) => /bar-balada.*100% sentado/.test(r))
  );
  assert.ok(
    HOUSE_RULES_BY_ESTABLISHMENT[8].custom_rules.some((r) => /10 assentos e dois bistrôs/.test(r))
  );
  assert.ok(
    HOUSE_RULES_BY_ESTABLISHMENT[8].custom_rules.some((r) => /bar-balada.*100% sentado/.test(r))
  );

  const justinoSab = SEU_JUSTINO_FAQS.find((f) => f.topic === 'reservas_assentos_sabado');
  const pracinhaSab = PRACINHA_FAQS.find((f) => f.topic === 'reservas_assentos_sabado');
  assert.match(justinoSab.answer, /8 assentos/);
  assert.match(justinoSab.answer, /6 assentos/);
  assert.match(pracinhaSab.answer, /10 assentos/);
  assert.match(pracinhaSab.answer, /6 assentos/);

  assert.ok(
    detectFaqTopicsFromUserText('como funciona reserva sábado?', { establishmentId: 1 }).includes(
      'reservas_assentos_sabado'
    )
  );
  assert.ok(
    detectFaqTopicsFromUserText('como funciona reserva sábado?', { establishmentId: 8 }).includes(
      'reservas_assentos_sabado'
    )
  );
});
