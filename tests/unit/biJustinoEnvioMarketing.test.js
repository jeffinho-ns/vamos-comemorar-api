const test = require('node:test');
const assert = require('node:assert/strict');
const { validarEnvioMarketing, aplicarEnvioMarketing } = require('../../services/biJustino/envioMarketing');

test('o envio de marketing exige nome, data e algum valor', () => {
  const vazio = validarEnvioMarketing({
    date: '2026-10-30',
    submittedByName: 'Ana',
    mkTraffic: 0,
    mkAttractions: 0,
    mkOther: 0,
    mkReservations: 0,
    mkPeople: 0,
    mkShow: 0,
    mkTicket: 0,
    mkWalkins: 0,
  }, new Date('2026-10-30T15:00:00Z'));
  assert.equal(vazio.erro, 'registro_em_branco');
  const ok = validarEnvioMarketing({
    date: '2026-10-30',
    submittedByName: 'Ana',
    mkTraffic: '1.500,50',
    mkAttractions: 0,
    mkOther: 0,
    mkReservations: 10,
    mkPeople: 4,
    mkShow: 30,
    mkTicket: 130,
    mkWalkins: 5,
    mkNote: 'campanha de sexta',
  }, new Date('2026-10-30T15:00:00Z'));
  assert.equal(ok.doc.values.mkTraffic, 1500.5);
  assert.equal(ok.doc.values.mkRevenue, 35 * 130);
  assert.equal(ok.doc.values.mkReservas, 10);
});

test('o envio de marketing entra no lançamento e manda recalcular o quadro', () => {
  const payload = aplicarEnvioMarketing(
    { lancamentos: { marketing: [] }, quadros: { marketing: { kpis: {} } }, projecao: { areas: [] } },
    { docs: [{ date: '2026-10-30', submittedByName: 'Ana', values: { mkTraffic: 100, mkRevenue: 2000 }, notes: { mkNote: 'sexta' } }] },
  );
  assert.equal(payload.lancamentos.marketing[0].mkTraffic, 100);
  assert.equal(payload.lancamentos.marketing[0].submittedByName, 'Ana');
  assert.equal(payload.lancamentos.marketing[0].mkNote, 'sexta');
  assert.equal(payload.quadros, undefined);
  assert.equal(payload.projecao, undefined);
});
