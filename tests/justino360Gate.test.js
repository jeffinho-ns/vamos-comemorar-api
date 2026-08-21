'use strict';

/**
 * Matriz de decisão do gate do Justino360 (Fase 0).
 * Sem banco: pool falso devolve a UEP que o cenário descreve.
 *
 * Rodar: node tests/justino360Gate.test.js
 */
const {
  justinoGate,
  requireManage,
  requireValidate,
  resolveJustinoPermissions,
} = require('../routes/justino360/middleware');
const { SEU_JUSTINO_ESTABLISHMENT_ID } = require('../validators/justino360Validator');

let failures = 0;

function check(label, condition) {
  if (condition) {
    console.log(`  ok   ${label}`);
  } else {
    failures += 1;
    console.error(`  FAIL ${label}`);
  }
}

/** Pool que só responde a UEP do establishment informado. */
function fakePool(uepRow, { onQuery } = {}) {
  return {
    async query(_sql, params) {
      if (onQuery) onQuery(params);
      return { rows: uepRow ? [uepRow] : [] };
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
  const req = { user, query, body: {}, params: {}, method: 'GET', originalUrl: '/api/justino360/x' };
  const res = fakeRes();
  let nextCalled = false;
  return justinoGate(pool)(req, res, () => {
    nextCalled = true;
  }).then(() => ({ req, res, nextCalled }));
}

async function main() {
  console.log('1) Isolamento de estabelecimento');
  {
    const uep = { can_access_justino360: true, can_manage_justino360: true, can_validate_justino360: true };
    const { res, nextCalled } = await runGate(fakePool(uep), { id: 9, role: 'gerente' }, { establishment_id: '7' });
    check('Highline (id 7) recebe 403', res.statusCode === 403 && !nextCalled);
  }
  {
    const { res, nextCalled } = await runGate(fakePool(null), { id: 9, role: 'gerente' }, { establishment_id: '99' });
    check('estabelecimento desconhecido recebe 403', res.statusCode === 403 && !nextCalled);
  }
  {
    const uep = { can_access_justino360: true, can_manage_justino360: false, can_validate_justino360: false };
    let seenEstablishment = null;
    const pool = fakePool(uep, { onQuery: (p) => { seenEstablishment = p[0]; } });
    const { nextCalled } = await runGate(pool, { id: 9, role: 'colaborador' });
    check('sem establishment_id assume Seu Justino', seenEstablishment === SEU_JUSTINO_ESTABLISHMENT_ID);
    check('colaborador com flag de acesso passa', nextCalled === true);
  }

  console.log('2) Papéis sem UEP no Seu Justino');
  {
    const { res, nextCalled } = await runGate(fakePool(null), { id: 9, role: 'gerente' });
    check('gerente sem UEP recebe 403', res.statusCode === 403 && !nextCalled);
  }
  {
    const { res } = await runGate(fakePool(null), { id: 9, role: 'colaborador' });
    check('colaborador sem UEP recebe 403', res.statusCode === 403);
  }
  {
    const { res } = await runGate(fakePool(null), null);
    check('requisição sem usuário recebe 403', res.statusCode === 403);
  }
  {
    const { nextCalled } = await runGate(fakePool(null), { id: 1, role: 'admin' });
    check('admin passa sem UEP', nextCalled === true);
  }
  {
    const { nextCalled } = await runGate(fakePool(null), { id: 1, role: 'promoter', is_super_admin: true });
    check('super admin passa sem UEP', nextCalled === true);
  }

  console.log('3) Escalonamento de privilégio');
  {
    const uep = { can_access_justino360: true, can_manage_justino360: false, can_validate_justino360: false };
    const { req } = await runGate(fakePool(uep), { id: 9, role: 'colaborador' });
    check('equipe não recebe gestão', req.j360CanManage === false);
    check('equipe não recebe validação', req.j360CanValidate === false);

    const res = fakeRes();
    let passed = false;
    requireManage(req, res, () => { passed = true; });
    check('requireManage bloqueia equipe (403)', res.statusCode === 403 && !passed);

    const res2 = fakeRes();
    let passed2 = false;
    requireValidate(req, res2, () => { passed2 = true; });
    check('requireValidate bloqueia equipe (403)', res2.statusCode === 403 && !passed2);
  }
  {
    const uep = { can_access_justino360: false, can_manage_justino360: false, can_validate_justino360: true };
    const { req, nextCalled } = await runGate(fakePool(uep), { id: 9, role: 'atendente' });
    check('flag de validação sozinha não dá acesso ao módulo', nextCalled === false);
    check('acesso negado não popula gestão', req.j360CanManage === undefined);
  }
  {
    const uep = { can_access_justino360: false, can_manage_justino360: false, can_validate_justino360: false };
    const { req, nextCalled } = await runGate(fakePool(uep), { id: 9, role: 'gerente' });
    check('gerente com UEP no Justino administra o módulo', nextCalled === true && req.j360CanManage === true);
    check('gerente também valida', req.j360CanValidate === true);
  }
  {
    const uep = { can_access_justino360: false, can_manage_justino360: true, can_validate_justino360: false };
    const { req } = await runGate(fakePool(uep), { id: 9, role: 'colaborador' });
    check('flag de gestão implica acesso e validação', req.j360CanManage === true && req.j360CanValidate === true);
  }

  console.log('4) Identidade do ator');
  {
    const perms = await resolveJustinoPermissions(fakePool(null), { role: 'colaborador' }, 1);
    check('usuário sem id e sem email é negado', perms.access === false);
  }
  {
    let params = null;
    const uep = { can_access_justino360: true, can_manage_justino360: false, can_validate_justino360: false };
    const pool = fakePool(uep, { onQuery: (p) => { params = p; } });
    await resolveJustinoPermissions(pool, { userEmail: 'Alguem@Justino.com', role: 'colaborador' }, 1);
    check('resolve por email quando não há id', params[1] === null && params[2] === 'Alguem@Justino.com');
  }

  console.log('5) Falha do banco não libera acesso');
  {
    const brokenPool = { async query() { throw new Error('conexão perdida'); } };
    const { res, nextCalled } = await runGate(brokenPool, { id: 9, role: 'colaborador' });
    check('erro de banco vira 500 e não passa', res.statusCode === 500 && !nextCalled);
  }

  if (failures > 0) {
    console.error(`\njustino360Gate: ${failures} falha(s)`);
    process.exit(1);
  }
  console.log('\njustino360Gate: ok');
}

main().catch((err) => {
  console.error('justino360Gate: erro inesperado', err);
  process.exit(1);
});
