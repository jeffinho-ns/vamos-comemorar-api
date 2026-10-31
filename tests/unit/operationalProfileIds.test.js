'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  pickProfileOperationalIds,
  pickCatalogAliases,
  isAncillaryVenueName,
} = require('../../tenancy/operationalProfileIds');
const { getDefaultWindowsForEstablishmentId } = require('../../services/operationalHours/defaultWeeklySchedule');

test('Apê do Pracinha não substitui o id operacional do Pracinha', () => {
  const map = pickProfileOperationalIds([
    {
      id: 4,
      name: 'Pracinha do Seu Justino',
      legacy_place_id: 8,
      legacy_bar_id: 4,
      profile: 'pracinha',
    },
    {
      id: 16,
      name: 'Apê do Pracinha',
      legacy_place_id: 17,
      legacy_bar_id: 14,
      profile: 'pracinha',
    },
    {
      id: 1,
      name: 'Seu Justino',
      legacy_place_id: 1,
      profile: 'seu_justino',
    },
  ]);

  assert.equal(map.pracinha, 8);
  assert.equal(map.seu_justino, 1);
});

test('Apê nunca entra no catálogo de alias operacional do Pracinha', () => {
  assert.equal(isAncillaryVenueName('Apê do Pracinha'), true);
  assert.equal(isAncillaryVenueName('Pracinha do Seu Justino'), false);
  const aliases = pickCatalogAliases([
    {
      name: 'Pracinha do Seu Justino',
      legacy_place_id: 8,
      profile: 'pracinha',
    },
    {
      name: 'Apê do Pracinha',
      legacy_place_id: 17,
      profile: 'pracinha',
    },
  ]);
  assert.deepEqual(aliases.map((item) => item.id), [8]);
  assert.ok(!aliases.some((item) => Number(item.id) === 17));
});

test('horário padrão do Pracinha na sexta aceita 19h e 20h', () => {
  const friday = getDefaultWindowsForEstablishmentId(8, '2026-10-30');
  assert.deepEqual(friday, ['17:00-03:30']);
  const tuesday = getDefaultWindowsForEstablishmentId(8, '2026-10-27');
  assert.deepEqual(tuesday, []);
  const sunday = getDefaultWindowsForEstablishmentId(8, '2026-11-01');
  assert.deepEqual(sunday, ['14:00-00:00']);
});
