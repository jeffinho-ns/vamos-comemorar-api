'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  BI_PAGE_KEYS,
  sanitizeBiMenuAccess,
  hasBiJustinoAccess,
  unionBiMenuAccess,
  resolveStoredBiMenuAccess,
} = require('../../tenancy/biMenuAccess');

test('sanitizeBiMenuAccess aceita só a whitelist e remove duplicatas', () => {
  const out = sanitizeBiMenuAccess([
    'master',
    'Marketing',
    'nope',
    'reservas',
    'master',
    '  cmv  ',
  ]);
  assert.deepEqual(out, ['master', 'marketing', 'reservas', 'cmv']);
  assert.equal(BI_PAGE_KEYS.includes('master'), true);
  assert.equal(sanitizeBiMenuAccess(null).length, 0);
  assert.equal(sanitizeBiMenuAccess('["operacao","financeiro"]').includes('operacao'), true);
});

test('hasBiJustinoAccess exige bi-justino no menu e ao menos uma página', () => {
  assert.equal(hasBiJustinoAccess(['bi-justino'], ['marketing']), true);
  assert.equal(hasBiJustinoAccess(['logs'], ['marketing']), false);
  assert.equal(hasBiJustinoAccess(['bi-justino'], []), false);
  assert.equal(hasBiJustinoAccess(['bi-justino'], ['nope']), false);
});

test('unionBiMenuAccess só une páginas de linhas com bi-justino', () => {
  const out = unionBiMenuAccess([
    { menu_access: ['bi-justino'], bi_menu_access: ['marketing', 'eventos'] },
    { menu_access: ['logs'], bi_menu_access: ['master'] },
    { menu_access: ['bi-justino'], bi_menu_access: ['eventos', 'reservas'] },
  ]);
  assert.deepEqual(out, ['marketing', 'eventos', 'reservas']);
});

test('resolveStoredBiMenuAccess zera páginas se o menu não tem bi-justino', () => {
  assert.deepEqual(resolveStoredBiMenuAccess(['logs'], ['master']), []);
  assert.deepEqual(resolveStoredBiMenuAccess(['bi-justino'], ['master', 'x']), ['master']);
  assert.equal(resolveStoredBiMenuAccess(['bi-justino'], undefined), undefined);
});
