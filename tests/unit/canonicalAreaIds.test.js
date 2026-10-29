const test = require('node:test');
const assert = require('node:assert/strict');

const {
  getCanonicalAreaIdsForRules,
  buildCanonicalAreasSql,
  buildAreasNameFilterSql,
  areaAllowedForRules,
  areaAllowedForEstablishment,
  previewMergedRules,
} = require('../../services/establishmentRules');

test('Highline e Seu Justino têm area_ids canônicos do modal', () => {
  const highline = previewMergedRules({ profile: 'highline' }, 'HighLine', 7);
  const justino = previewMergedRules({ profile: 'seu_justino' }, 'Seu Justino', 1);
  const pracinha = previewMergedRules({ profile: 'pracinha' }, 'Pracinha', 8);

  assert.deepEqual(getCanonicalAreaIdsForRules(highline).sort((a, b) => a - b), [
    2, 5, 7001,
  ]);
  assert.deepEqual(getCanonicalAreaIdsForRules(justino).sort((a, b) => a - b), [1, 2]);
  assert.deepEqual(getCanonicalAreaIdsForRules(pracinha), []);
});

test('buildCanonicalAreasSql gera ANY seguro', () => {
  const justino = previewMergedRules({ profile: 'seu_justino' }, 'Seu Justino', 1);
  const sql = buildCanonicalAreasSql(justino, { idColumn: 'ra.id' });
  assert.match(sql, /ra\.id = ANY\(ARRAY\[1,2\]::int\[\]\)/);
});

test('Pracinha só aceita Balcão e Praça', () => {
  const pracinha = previewMergedRules({ profile: 'pracinha' }, 'Pracinha do Seu Justino', 8);
  const sql = buildAreasNameFilterSql(pracinha, 'ra.name');
  assert.match(sql, /Balcão/);
  assert.match(sql, /Praça/);
  assert.equal(sql.includes('NOT ILIKE'), false);
  assert.equal(areaAllowedForRules(pracinha, 'Balcão'), true);
  assert.equal(areaAllowedForRules(pracinha, 'Praça'), true);
  assert.equal(areaAllowedForRules(pracinha, 'Terraço'), false);
  assert.equal(areaAllowedForRules(pracinha, 'Área Coberta'), false);
  assert.equal(
    areaAllowedForEstablishment(
      pracinha,
      { id: 39, name: 'Terraço', establishment_id: 8 },
      8,
    ),
    false,
  );
  assert.equal(
    areaAllowedForEstablishment(
      pracinha,
      { id: 42, name: 'Praça', establishment_id: 8 },
      8,
    ),
    true,
  );
});

test('areaAllowedForEstablishment aceita área canônica mesmo com outro dono', () => {
  const justino = previewMergedRules({ profile: 'seu_justino' }, 'Seu Justino', 1);
  // Área 2 ficou com establishment_id=7 (Highline) após o fix de ownership.
  assert.equal(
    areaAllowedForEstablishment(
      justino,
      { id: 2, name: 'Área Descoberta', establishment_id: 7 },
      1
    ),
    true
  );
  assert.equal(
    areaAllowedForEstablishment(
      justino,
      { id: 99, name: 'Outra', establishment_id: 7 },
      1
    ),
    false
  );
});
