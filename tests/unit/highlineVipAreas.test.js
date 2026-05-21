const test = require('node:test');
const assert = require('node:assert/strict');
const { clientAskedPaidVipAreas } = require('../../services/agent/highlineReservationAreas');

test('clientAskedPaidVipAreas detecta camarote', () => {
  assert.equal(clientAskedPaidVipAreas('Quero reservar um camarote'), true);
  assert.equal(clientAskedPaidVipAreas('mesa no deck'), false);
});
