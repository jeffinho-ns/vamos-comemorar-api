const test = require('node:test');
const assert = require('node:assert/strict');
const sistema = require('../../services/biJustino/sistema/validacao');
const { lerSobDemanda, fonteDe } = require('../../services/biJustino/sistema/sobDemanda');
const { obterPdf } = require('../../services/biJustino/sistema/pdfPlanilha');
const { podeAprovarBiJustino } = require('../../services/biJustino/sistema/aprovacao');

const ENV = { BI_APPS_SCRIPT_EMAIL: 'robo@x.com', BI_APPS_SCRIPT_PASSWORD: 'segredo' };

function storeFalso(ultimo) {
  const gravados = [];
  return {
    gravados,
    ensureTable: async () => undefined,
    latestPayload: async () => ultimo || null,
    saveSnapshot: async (_pool, item) => { gravados.push(item); return { id: 1, captured_at: '2026-10-30T18:00:00.000Z' }; },
  };
}

test('documentação, contato e decisão de contato validam entrada', () => {
  assert.equal(sistema.validarDocumentacao({}).erro, 'nome_obrigatorio');
  const doc = sistema.validarDocumentacao({ nome: 'Alvará 2026', tipo: 'x', dataValidade: '2027-01-31' });
  assert.equal(doc.payload.tipo, 'outro');
  assert.equal(doc.payload.dataValidade, '2027-01-31');
  assert.equal(sistema.validarContato({ nome: 'Flávio' }).erro, 'nome_e_telefone_obrigatorios');
  assert.equal(sistema.validarContato({ nome: 'Flávio', telefone: 'abc' }).erro, 'telefone_invalido');
  const c = sistema.validarContato({ nome: 'Flávio', telefone: '+55 11 90000-0000', ativo: '0' });
  assert.equal(c.payload.ativo, false);
  assert.equal(sistema.validarContato({ nome: 'F', telefone: '11 9999-9999' }).payload.ativo, true);
  assert.deepEqual(sistema.validarDecisaoContato({ id: 's1', approve: false, nota: 'x' }).payload, { id: 's1', approve: false, nota: 'x' });
});

test('situação do documento segue os 30 dias de alerta do painel', () => {
  assert.equal(sistema.situacaoDocumento('', '2026-10-30').texto, 'sem vencimento');
  assert.deepEqual(sistema.situacaoDocumento('2026-10-20', '2026-10-30'), { nivel: 'r', texto: 'venceu há 10d', dias: -10 });
  assert.deepEqual(sistema.situacaoDocumento('2026-11-29', '2026-10-30'), { nivel: 'y', texto: 'vence em 30d', dias: 30 });
  assert.equal(sistema.situacaoDocumento('2026-11-30', '2026-10-30').nivel, 'g');
});

test('leitura sob demanda usa o banco quando a cópia é recente e a planilha quando não é', async () => {
  const recente = { payload: { ok: true, items: [1] }, captured_at: new Date(Date.now() - 60000).toISOString() };
  let chamadas = 0;
  const readAction = async (action, _env, _f, payload) => { chamadas += 1; return { ok: true, items: [action, payload] }; };
  const a = await lerSobDemanda({}, ENV, { action: 'getEventoInteracoes', campoId: 'eventoId', id: 'ev1' }, { store: storeFalso(recente), readAction });
  assert.equal(a.origem, 'banco');
  assert.equal(chamadas, 0);
  const velha = { payload: { ok: true, items: [] }, captured_at: new Date(Date.now() - 10 * 60000).toISOString() };
  const store = storeFalso(velha);
  const b = await lerSobDemanda({}, ENV, { action: 'getEventoInteracoes', campoId: 'eventoId', id: 'ev1' }, { store, readAction });
  assert.equal(b.origem, 'planilha');
  assert.deepEqual(b.payload.items, ['getEventoInteracoes', { eventoId: 'ev1' }]);
  assert.equal(store.gravados[0].source, fonteDe('getEventoInteracoes', 'ev1'));
  const c = await lerSobDemanda({}, ENV, { action: 'getSalaries', campoId: 'x', id: 'y' }, { store, readAction });
  assert.equal(c.erro, 'acao_invalida');
  const d = await lerSobDemanda({}, ENV, { action: 'getAuditoriaOpEvidencias', campoId: 'itemId', id: 'bad id' }, { store, readAction });
  assert.equal(d.erro, 'id_invalido');
  const falha = await lerSobDemanda({}, ENV, { action: 'getAuditoriaOpEvidencias', campoId: 'itemId', id: 'it1' }, {
    store: storeFalso(velha), readAction: async () => { throw Object.assign(new Error('x'), { code: 'timeout' }); },
  });
  assert.equal(falha.ok, true);
  assert.equal(falha.aviso, 'timeout');
});

test('PDF da planilha é montado em pedaços e reaproveitado quando o Drive não mudou', async () => {
  const conteudo = Buffer.from('%PDF-1.4 conteudo de teste do manual operacional');
  const info = { ok: true, totalBytes: conteudo.length, updatedAt: '2026-10-01T00:00:00.000Z' };
  const pedacos = [];
  const readAction = async (action, _env, _f, payload) => {
    if (action === 'getManualPdfInfo') return info;
    pedacos.push(payload.offset);
    const fatia = conteudo.subarray(payload.offset, payload.offset + payload.length);
    return { ok: true, base64: fatia.toString('base64'), offset: payload.offset, length: fatia.length, totalBytes: conteudo.length };
  };
  const store = storeFalso(null);
  const a = await obterPdf({}, ENV, 'manual', { store, readAction });
  assert.equal(a.ok, true);
  assert.equal(a.origem, 'planilha');
  assert.equal(a.bytes.toString(), conteudo.toString());
  assert.equal(store.gravados[0].source, 'planilha:getManualPdf');
  const guardado = { payload: store.gravados[0].payload, captured_at: new Date().toISOString() };
  const b = await obterPdf({}, ENV, 'manual', { store: storeFalso(guardado), readAction });
  assert.equal(b.origem, 'banco');
  assert.equal(b.bytes.toString(), conteudo.toString());
  const c = await obterPdf({}, ENV, 'outro', { store, readAction });
  assert.equal(c.erro, 'pdf_desconhecido');
});

test('aprovação de Diretoria só passa para super admin ou e-mails da Diretoria', async () => {
  assert.equal(await podeAprovarBiJustino(null, { id: 1, is_super_admin: true }), true);
  assert.equal(await podeAprovarBiJustino(null, { id: 1, email: 'renato@seujustino.com.br' }), true);
  const pool = { query: async () => ({ rows: [{ email: 'coordenadora.reservas@ideiaum.com.br', is_super_admin: false }] }) };
  assert.equal(await podeAprovarBiJustino(pool, { id: 2, email: 'coordenadora.reservas@ideiaum.com.br' }), false);
  const poolDir = { query: async () => ({ rows: [{ email: 'RenatoCury@ideiaum.com.br', is_super_admin: false }] }) };
  assert.equal(await podeAprovarBiJustino(poolDir, { id: 3, email: 'renatocury@ideiaum.com.br' }), true);
});
