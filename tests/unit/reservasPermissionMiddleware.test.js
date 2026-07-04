'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const reservasPermissionMiddleware = require('../../tenancy/reservasPermissionMiddleware');

describe('reservasPermissionMiddleware', () => {
  it('exporta middleware função', () => {
    assert.equal(typeof reservasPermissionMiddleware, 'function');
  });

  it('permissionForMethod mapeia verbos HTTP', () => {
    const { permissionForMethod } = reservasPermissionMiddleware;
    assert.equal(permissionForMethod('GET'), 'reservas:read');
    assert.equal(permissionForMethod('POST'), 'reservas:create');
    assert.equal(permissionForMethod('PATCH'), 'reservas:update');
    assert.equal(permissionForMethod('DELETE'), 'reservas:delete');
  });
});
