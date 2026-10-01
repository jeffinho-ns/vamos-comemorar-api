'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  operationalEstablishmentIdFromRow,
  loadUserScope,
  canAccessEstablishment,
} = require('../../tenancy/tenantScope');

test('operationalEstablishmentIdFromRow prioriza legacy_place_id', () => {
  assert.equal(
    operationalEstablishmentIdFromRow({
      establishment_id: 99,
      legacy_place_id: 7,
      legacy_bar_id: 3,
    }),
    7,
  );
});

test('operationalEstablishmentIdFromRow usa legacy_bar_id sem place', () => {
  assert.equal(
    operationalEstablishmentIdFromRow({
      establishment_id: 99,
      legacy_place_id: null,
      legacy_bar_id: 5,
    }),
    5,
  );
});

test('loadUserScope memberships traduz ids canonicos para operacionais', async () => {
  const pool = {
    async query(sql, params) {
      if (/memberships/i.test(sql)) {
        return {
          rows: [
            {
              organization_id: 1,
              establishment_id: 10,
              legacy_place_id: 7,
              legacy_bar_id: 3,
            },
          ],
        };
      }
      throw new Error('query inesperada');
    },
  };

  const scope = await loadUserScope(pool, { id: 42, email: 'g@test.com', role: 'gerente' });
  assert.deepEqual(scope.establishmentIds, [7]);
  assert.deepEqual(scope.organizationIds, [1]);
});

test('loadUserScope membership org-wide inclui todas as casas da org', async () => {
  const pool = {
    async query(sql) {
      if (/memberships/i.test(sql)) {
        return {
          rows: [{ organization_id: 1, establishment_id: null, legacy_place_id: null, legacy_bar_id: null }],
        };
      }
      if (/FROM meu_backup_db.establishments/i.test(sql)) {
        return {
          rows: [
            { legacy_place_id: 7, legacy_bar_id: 3 },
            { legacy_place_id: 9, legacy_bar_id: 5 },
          ],
        };
      }
      throw new Error(`query inesperada: ${sql}`);
    },
  };

  const scope = await loadUserScope(pool, { id: 1, email: 'a@test.com', role: 'gerente' });
  assert.deepEqual(scope.establishmentIds.sort(), [7, 9]);
});

test('loadUserScope une UEP ao membership para não perder casa legada', async () => {
  const pool = {
    async query(sql) {
      if (/memberships/i.test(sql)) {
        return {
          rows: [
            {
              organization_id: 1,
              establishment_id: 10,
              legacy_place_id: 7,
              legacy_bar_id: 3,
            },
          ],
        };
      }
      if (/user_establishment_permissions/i.test(sql)) {
        return { rows: [{ establishment_id: 9 }] };
      }
      throw new Error(`query inesperada: ${sql}`);
    },
  };

  const scope = await loadUserScope(pool, { id: 73, email: 'outra@casa.com', role: 'recepcao' });
  assert.deepEqual(scope.establishmentIds.sort((a, b) => a - b), [7, 9]);
});

test('loadUserScope bar do Rooftop (5) também libera o place 9', async () => {
  const pool = {
    async query(sql) {
      if (/memberships/i.test(sql)) {
        return {
          rows: [
            {
              organization_id: 1,
              establishment_id: 10,
              legacy_place_id: null,
              legacy_bar_id: 5,
            },
          ],
        };
      }
      if (/user_establishment_permissions/i.test(sql)) return { rows: [] };
      throw new Error(`query inesperada: ${sql}`);
    },
  };

  const scope = await loadUserScope(pool, { id: 4, email: 'recepcao@reservarooftop.com.br', role: 'recepcao' });
  assert.ok(scope.establishmentIds.includes(5));
  assert.ok(scope.establishmentIds.includes(9));
  assert.equal(canAccessEstablishment(scope, 9), true);
});

test('coordenadora.reservas entra no Reserva Rooftop mesmo sem vínculo no banco', async () => {
  const pool = {
    async query() {
      return { rows: [] };
    },
  };

  const scope = await loadUserScope(pool, {
    id: 73,
    email: 'coordenadora.reservas@ideiaum.com.br',
    role: 'recepcao',
  });
  assert.deepEqual(scope.establishmentIds.sort((a, b) => a - b), [1, 7, 8, 9, 21]);
  assert.equal(canAccessEstablishment(scope, 1), true);
  assert.equal(canAccessEstablishment(scope, 7), true);
  assert.equal(canAccessEstablishment(scope, 8), true);
  assert.equal(canAccessEstablishment(scope, 9), true);
  assert.equal(canAccessEstablishment(scope, 21), true);
  assert.equal(canAccessEstablishment(scope, 18), true);
  assert.equal(canAccessEstablishment(scope, 4), false);
});

test('coordenadora sem e-mail no token ainda entra no Reserva Rooftop', async () => {
  const pool = {
    async query(sql) {
      if (/SELECT email FROM users/i.test(sql)) {
        return { rows: [{ email: 'coordenadora.reservas@ideiaum.com.br' }] };
      }
      return { rows: [] };
    },
  };

  const scope = await loadUserScope(pool, { id: 73, role: 'recepcao' });
  assert.deepEqual(scope.establishmentIds.sort((a, b) => a - b), [1, 7, 8, 9, 21]);
  assert.equal(canAccessEstablishment(scope, 21), true);
  assert.equal(canAccessEstablishment(scope, 8), true);
});

test('coordenadora inclui o Apê do Pracinha quando o cadastro existe', async () => {
  const pool = {
    async query(sql) {
      if (/FROM places/i.test(sql) && /ape%pracinha/i.test(sql)) {
        return { rows: [{ id: 22, name: 'Apê do Pracinha' }] };
      }
      return { rows: [] };
    },
  };

  const scope = await loadUserScope(pool, {
    id: 73,
    email: 'coordenadora.reservas@ideiaum.com.br',
    role: 'recepcao',
  });
  assert.deepEqual(scope.establishmentIds.sort((a, b) => a - b), [1, 7, 8, 9, 21, 22]);
});

test('canAccessEstablishment trata place 9 e bar 5 como a mesma casa', () => {
  assert.equal(canAccessEstablishment({ isAdmin: false, establishmentIds: [9] }, 5), true);
  assert.equal(canAccessEstablishment({ isAdmin: false, establishmentIds: [5] }, 9), true);
  assert.equal(canAccessEstablishment({ isAdmin: false, establishmentIds: [7] }, 9), false);
});
