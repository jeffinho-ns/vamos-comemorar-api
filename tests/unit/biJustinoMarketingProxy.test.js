const test = require('node:test');
const assert = require('node:assert/strict');
const { criarProxy } = require('../../services/biJustino/marketing/proxy');
const { ROTAS } = require('../../routes/biJustinoAreas/marketing');
const { listarLeituras } = require('../../services/biJustino/espelho/catalogo');

function resFalsa() {
  const saida = { status: 200, body: null };
  return {
    saida,
    status(codigo) { saida.status = codigo; return this; },
    json(corpo) { saida.body = corpo; return this; },
  };
}

function montar(config, deps) {
  return criarProxy({}, config, { env: {}, ...deps });
}

test('proxy nega acesso antes de validar ou gravar', async () => {
  let gravou = false;
  const handler = montar({ action: 'saveMkReuniao', validar: () => ({ payload: {} }), recoletar: [] }, {
    acesso: async () => false,
    gravar: async () => { gravou = true; return { ok: true, resposta: { ok: true } }; },
  });
  const res = resFalsa();
  await handler({ user: { id: 1 }, body: {} }, res);
  assert.equal(res.saida.status, 403);
  assert.equal(res.saida.body.error, 'acesso_negado');
  assert.equal(gravou, false);
});

test('proxy devolve 400 com o erro da validação', async () => {
  const handler = montar({ action: 'saveMkReuniao', validar: () => ({ erro: 'titulo_obrigatorio' }) }, {
    acesso: async () => true,
    gravar: async () => { throw new Error('não deveria gravar'); },
  });
  const res = resFalsa();
  await handler({ user: { id: 1 }, body: {} }, res);
  assert.equal(res.saida.status, 400);
  assert.equal(res.saida.body.error, 'titulo_obrigatorio');
});

test('proxy grava o payload validado, pede a recoleta certa e devolve o que extrair', async () => {
  const chamadas = [];
  const handler = montar({
    action: 'saveIgAtivacao',
    validar: (body) => ({ payload: { titulo: body.titulo.trim() } }),
    recoletar: ['getIgAtivacoes', 'getIgRetorno'],
    extrair: (r) => ({ id: r.id }),
  }, {
    acesso: async () => true,
    gravar: async (_pool, _env, entrada) => { chamadas.push(entrada); return { ok: true, resposta: { ok: true, id: 'novo-1' } }; },
  });
  const res = resFalsa();
  await handler({ user: { id: 7 }, body: { titulo: '  Reel  ' } }, res);
  assert.equal(res.saida.status, 200);
  assert.deepEqual(res.saida.body, { ok: true, id: 'novo-1' });
  assert.deepEqual(chamadas[0], { action: 'saveIgAtivacao', payload: { titulo: 'Reel' }, recoletar: ['getIgAtivacoes', 'getIgRetorno'] });
});

test('proxy traduz falha da planilha em 502 e recusa da planilha em 409', async () => {
  const indisponivel = montar({ action: 'deleteMkReuniao', validar: () => ({ payload: { id: 'x' } }) }, {
    acesso: async () => true,
    gravar: async () => ({ ok: false, erro: 'planilha_indisponivel' }),
  });
  const res1 = resFalsa();
  await indisponivel({ user: { id: 1 }, body: {} }, res1);
  assert.equal(res1.saida.status, 502);
  assert.equal(res1.saida.body.error, 'planilha_indisponivel');

  const recusada = montar({ action: 'deleteMkReuniao', validar: () => ({ payload: { id: 'x' } }) }, {
    acesso: async () => true,
    gravar: async () => ({ ok: true, resposta: { ok: false, error: 'not_found' } }),
  });
  const res2 = resFalsa();
  await recusada({ user: { id: 1 }, body: {} }, res2);
  assert.equal(res2.saida.status, 409);
  assert.equal(res2.saida.body.error, 'not_found');
});

test('todas as rotas do marketing recoletam só chaves que existem no catálogo e não usam ações get*', () => {
  const conhecidas = new Set(listarLeituras().map((l) => l.chave));
  for (const rota of ROTAS) {
    assert.ok(!/^get/.test(rota.action), `${rota.caminho} não pode usar ação de leitura`);
    for (const chave of rota.recoletar || []) {
      assert.ok(conhecidas.has(chave), `${rota.caminho} recoleta chave fora do catálogo: ${chave}`);
    }
  }
  const caminhos = ROTAS.map((r) => r.caminho);
  assert.equal(new Set(caminhos).size, caminhos.length, 'caminhos duplicados');
});
