'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { isBiJustinoEmail } = require('../../services/biJustino/access');

test('Renato, Paula, Luis Felipe e Menda leem o BI', () => {
  assert.equal(isBiJustinoEmail('renatocury@ideiaum.com.br'), true);
  assert.equal(isBiJustinoEmail(' Renato@SeuJustino.com.br '), true);
  assert.equal(isBiJustinoEmail('coordenadora.reservas@ideiaum.com.br'), true);
  assert.equal(isBiJustinoEmail('luisfelipe@ideiaum.com.br'), true);
  assert.equal(isBiJustinoEmail('gabrielmenda@ideiaum.com.br'), true);
});

test('promoter e cliente com nome parecido ficam de fora', () => {
  assert.equal(isBiJustinoEmail('renato@ideiaum.com.br'), false);
  assert.equal(isBiJustinoEmail('garciabrangi@gmail.com'), false);
  assert.equal(isBiJustinoEmail('paula@reservas.com.br'), false);
  assert.equal(isBiJustinoEmail(''), false);
});
