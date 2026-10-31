const test = require('node:test');
const assert = require('node:assert/strict');
const {
  resolveJustinoGuestZone,
  resolveJustinoSubarea,
  pickJustinoReservationSlot,
  guestZonePromptForClient,
  listJustinoAreaQuestion,
} = require('../../services/agent/seuJustinoReservationAreas');
const { sanitizeAssistantReply } = require('../../services/agent/agentService');

test('descoberta não é lida como coberta', () => {
  assert.equal(resolveJustinoGuestZone('quero a área descoberta'), 'descoberta');
  assert.equal(resolveJustinoGuestZone('prefiro a coberta'), 'coberta');
  assert.equal(resolveJustinoGuestZone('pode ser coberta ou descoberta'), null);
  assert.equal(resolveJustinoGuestZone('tanto faz'), 'qualquer');
});

test('área descoberta cai numa mesa livre do quintal', async () => {
  const pool = {
    async query() {
      return {
        rows: [
          { area_id: 2, table_number: '20', reservation_time: '20:00', status: 'CONFIRMADA' },
        ],
      };
    },
  };
  const slot = await pickJustinoReservationSlot(pool, {
    reservationDate: '2026-11-07',
    reservationTime: '21:00',
    partySize: 4,
    zone: 'descoberta',
  });
  assert.equal(slot.area_id, 2);
  assert.equal(slot.guestLabel, 'área descoberta');
  assert.match(slot.internalLabel, /Quintal/);
  assert.notEqual(slot.table_number, '20');
});

test('12 pessoas no Lateral Esquerdo juntam duas mesas', async () => {
  const pool = {
    async query() {
      return { rows: [] };
    },
  };
  const slot = await pickJustinoReservationSlot(pool, {
    reservationDate: '2026-10-30',
    reservationTime: '19:00',
    partySize: 12,
    subareaKey: 'quintal-lateral-esquerdo',
  });
  assert.equal(slot.area_id, 2);
  assert.equal(slot.guestLabel, 'Quintal Lateral Esquerdo');
  assert.equal(slot.table_number, '20,22');
  assert.equal(slot.combined.mesas_count, 2);
});
test('lounge sozinho é coberta e quintal sozinho é descoberta', () => {
  assert.equal(resolveJustinoGuestZone('lounge'), 'coberta');
  assert.equal(resolveJustinoGuestZone('quero lounge'), 'coberta');
  assert.equal(resolveJustinoGuestZone('quintal'), 'descoberta');

  const lounge = resolveJustinoSubarea('lounge');
  assert.ok(lounge);
  assert.equal(lounge.zone, 'coberta');
  assert.equal(lounge.area_id, 1);
  assert.equal(lounge.key == null, true);

  const quintal = resolveJustinoSubarea('quintal');
  assert.ok(quintal);
  assert.equal(quintal.zone, 'descoberta');
  assert.equal(quintal.area_id, 2);
  assert.equal(quintal.key == null, true);

  const palco = resolveJustinoSubarea('lounge palco');
  assert.equal(palco.key, 'lounge-palco');
  assert.equal(palco.zone, 'coberta');
});

test('pergunta ao cliente é só coberta ou descoberta, sem lista de lounge', () => {
  assert.equal(
    guestZonePromptForClient(),
    'Você prefere a área coberta ou a área descoberta?'
  );
  assert.equal(
    guestZonePromptForClient('coberta'),
    'Você prefere a área coberta ou a área descoberta?'
  );
  assert.doesNotMatch(guestZonePromptForClient(), /Lounge|Aquário|Palco|Spaten|Lateral/i);
  assert.doesNotMatch(listJustinoAreaQuestion('coberta'), /Lounge|Aquário|Palco|Spaten/i);
  assert.doesNotMatch(listJustinoAreaQuestion(), /Lounge|Quintal Lateral|Central Esquerdo/i);
});

test('Seu Justino pode dizer área coberta na conversa', () => {
  const blocked = sanitizeAssistantReply('Você prefere a área coberta ou a área descoberta?', {
    workingState: {},
  });
  assert.equal(blocked.blocked, true);

  const allowed = sanitizeAssistantReply('Você prefere a área coberta ou a área descoberta?', {
    workingState: { establishment_id: 1 },
  });
  assert.equal(allowed.blocked, false);
  assert.match(allowed.text, /área coberta/);
});
