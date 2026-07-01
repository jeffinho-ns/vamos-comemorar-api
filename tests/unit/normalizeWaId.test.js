'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeWaId } = require('../../services/whatsappInboxRepository');

test('normalizeWaId: celular BR sem DDI', () => {
  assert.equal(normalizeWaId('11999998888'), '5511999998888');
});

test('normalizeWaId: já com 55', () => {
  assert.equal(normalizeWaId('5511999998888'), '5511999998888');
});

test('normalizeWaId: remove caracteres', () => {
  assert.equal(normalizeWaId('+55 (11) 99999-8888'), '5511999998888');
});

test('normalizeWaId: inválido', () => {
  assert.equal(normalizeWaId('123'), null);
  assert.equal(normalizeWaId(''), null);
});
