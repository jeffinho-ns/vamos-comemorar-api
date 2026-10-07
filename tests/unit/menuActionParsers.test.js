const test = require('node:test');
const assert = require('node:assert');
const {
  parseClockTime,
  parseUntilFromText,
  pauseUntilFromClock,
  parseMenuPrice,
  normalizeSealList,
  parseNameList,
} = require('../../services/staffAgent/menuActionParsers');

test('entende horário de pausa até as 23h', () => {
  assert.equal(parseClockTime('23h'), '23:00');
  assert.equal(parseClockTime('18:30'), '18:30');
  assert.equal(parseUntilFromText('Pausa a caipirinha até as 23h'), '23:00');
  assert.equal(parseUntilFromText('tira o burger ate 18:30'), '18:30');
});

test('horário que já passou vai para o dia seguinte', () => {
  const morning = new Date('2026-10-07T12:00:00-03:00');
  assert.equal(pauseUntilFromClock('23:00', morning), '2026-10-07T23:00:00-03:00');
  const night = new Date('2026-10-07T23:30:00-03:00');
  assert.equal(pauseUntilFromClock('23:00', night), '2026-10-08T23:00:00-03:00');
});

test('preço e selo aceitam o jeito que o colaborador fala', () => {
  assert.equal(parseMenuPrice('R$ 32,90'), 32.9);
  assert.equal(parseMenuPrice('sob consulta'), -1);
  assert.deepEqual(normalizeSealList('vegetariano, sem álcool').ids, ['vegetariano', 'sem-alcool']);
  assert.deepEqual(parseNameList('Gin, Vodka e Rum'), ['Gin', 'Vodka', 'Rum']);
});
