'use strict';

/**
 * Matriz de decisão do gate Ideia RH (Fase 0).
 * Sem banco: pool falso devolve org/UEP conforme o cenário.
 *
 * Rodar: node --test tests/rhIdeiaGate.test.js
 */
const {
  rhIdeiaOrgGate,
  requireManage,
  requireValidate,
  resolveRhIdeiaPermissions,
  GRUPO_IDEIA_ORG_SLUG,
} = require('../routes/rhIdeia/middleware');

let failures = 0;

function check(label, condition) {
  if (condition) {
    console.log(`  ok   ${label}`);
  } else {
    failures += 1;
    console.error(`  FAIL ${label}`);
  }
}

function fakePool({
  orgId = 1,
  orgSlug = GRUPO_IDEIA_ORG_SLUG,
  uepRow = null,
  establishmentIds = [10],
  onQuery = null,
} = {}) {
  return {
    async query(sql, params) {
      if (onQuery) onQuery(sql, params);
      if (sql.includes("slug = 'grupo-ideia-um'")) {
        return { rows: [{ id: orgId }] };
      }
      if (sql.includes('SELECT slug FROM organizations')) {
        return { rows: [{ slug: orgSlug }] };
      }
      if (sql.includes('BOOL_OR(uep.can_access_rh_ideia)')) {
        if (uepRow === null) return { rows: [] };
        return { rows: [uepRow] };
      }
      if (sql.includes('DISTINCT uep.establishment_id')) {
        return { rows: establishmentIds.map((id) => ({ establishment_id: id })) };
      }
      return { rows: [] };
    },
  };
}

function fakeRes() {
  return {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

function runGate(pool, user, query = {}) {
  const req = { user, query, body: {}, params: {}, method: 'GET', originalUrl: '/api/rh-ideia/x' };
  const res = fakeRes();
  let nextCalled = false;
  return rhIdeiaOrgGate(pool)(req, res, () => {
    nextCalled = true;
  }).then(() => ({ req, res, nextCalled }));
}

async function main() {
  console.log('1) Isolamento por organização');
  {
    const pool = fakePool({ orgSlug: 'outra-org' });
    const { res, nextCalled } = await runGate(pool, { id: 9, role: 'colaborador', organization_id: 1 });
    check('org fora do grupo recebe 403', res.statusCode === 403 && !nextCalled);
  }
  {
    const uep = { can_access_rh_ideia: true, can_manage_rh_ideia: false, can_validate_rh_ideia: false };
    const { nextCalled, req } = await runGate(fakePool({ uepRow: uep }), {
      id: 9,
      role: 'colaborador',
      organization_id: 1,
    });
    check('colaborador Grupo Ideia com UEP passa', nextCalled === true);
    check('organization_id populado no req', req.iriOrganizationId === 1);
  }
  {
    const { nextCalled } = await runGate(fakePool(), { id: 1, role: 'admin', organization_id: 1 });
    check('admin passa sem UEP', nextCalled === true);
  }
  {
    const { nextCalled } = await runGate(fakePool({ orgSlug: 'outra-org' }), {
      id: 1,
      role: 'promoter',
      is_super_admin: true,
      organization_id: 99,
    });
    check('super admin passa mesmo fora do slug', nextCalled === true);
  }

  console.log('2) Papéis sem UEP');
  {
    const { res, nextCalled } = await runGate(fakePool({ uepRow: null }), {
      id: 9,
      role: 'gerente',
      organization_id: 1,
    });
    check('gerente sem UEP recebe 403', res.statusCode === 403 && !nextCalled);
  }
  {
    const { res } = await runGate(fakePool({ uepRow: null }), null);
    check('requisição sem usuário recebe 403', res.statusCode === 403);
  }

  console.log('3) Escalonamento de privilégio');
  {
    const uep = { can_access_rh_ideia: true, can_manage_rh_ideia: false, can_validate_rh_ideia: false };
    const { req } = await runGate(fakePool({ uepRow: uep }), {
      id: 9,
      role: 'colaborador',
      organization_id: 1,
    });
    check('equipe não recebe gestão', req.iriCanManage === false);

    const res = fakeRes();
    let passed = false;
    requireManage(req, res, () => { passed = true; });
    check('requireManage bloqueia equipe (403)', res.statusCode === 403 && !passed);
  }
  {
    const uep = {
      can_access_rh_ideia: false,
      can_manage_rh_ideia: false,
      can_validate_rh_ideia: false,
    };
    const { req, nextCalled } = await runGate(fakePool({ uepRow: uep }), {
      id: 9,
      role: 'gerente',
      organization_id: 1,
    });
    check('gerente com UEP vazia mas papel gestor administra', nextCalled === true && req.iriCanManage === true);
  }
  {
    const uep = { can_access_rh_ideia: false, can_manage_rh_ideia: true, can_validate_rh_ideia: false };
    const { req } = await runGate(fakePool({ uepRow: uep }), {
      id: 9,
      role: 'colaborador',
      organization_id: 1,
    });
    check('flag de gestão implica acesso', req.iriCanManage === true && req.iriCanValidate === true);
  }

  console.log('4) UEP agregada na org');
  {
    let sqlSeen = '';
    const uep = { can_access_rh_ideia: true, can_manage_rh_ideia: false, can_validate_rh_ideia: false };
    const pool = fakePool({
      uepRow: uep,
      onQuery: (sql) => { sqlSeen = sql; },
    });
    await resolveRhIdeiaPermissions(pool, { id: 5, role: 'colaborador' }, 1);
    check('query UEP filtra por organization_id', sqlSeen.includes('e.organization_id = $1'));
  }

  console.log('5) Falha do banco não libera acesso');
  {
    const brokenPool = { async query() { throw new Error('conexão perdida'); } };
    const { res, nextCalled } = await runGate(brokenPool, {
      id: 9,
      role: 'colaborador',
      organization_id: 1,
    });
    check('erro de banco vira 500', res.statusCode === 500 && !nextCalled);
  }

  if (failures > 0) {
    console.error(`\nrhIdeiaGate: ${failures} falha(s)`);
    process.exit(1);
  }
  console.log('\nrhIdeiaGate: ok');
}

main().catch((err) => {
  console.error('rhIdeiaGate: erro inesperado', err);
  process.exit(1);
});
