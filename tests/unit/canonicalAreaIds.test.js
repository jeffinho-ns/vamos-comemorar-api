const test = require('node:test');
const assert = require('node:assert/strict');

const {
  getCanonicalAreaIdsForRules,
  buildCanonicalAreasSql,
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
