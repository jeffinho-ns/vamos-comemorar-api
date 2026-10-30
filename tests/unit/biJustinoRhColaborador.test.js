const test = require('node:test');
const assert = require('node:assert/strict');
const { validarColaborador, validarApagarColaborador, validarHorarioSemanal } = require('../../services/biJustino/rh/colaborador');
const { validarQuadroMinimo, validarDecisaoFreelancers } = require('../../services/biJustino/rh/quadroMinimo');

function fichaBase() {
  return {
    nome: ' Maria  Silva ',
    cargo: 'bar',
    funcaoCargo: 'chefeBar',
    nivel: 'senior',
    contratacao: 'CLT',
    mesReferencia: '2026-10',
    ativo: true,
    salario: '2.600,00',
    fgts: 208,
    inss: '216,13',
    valorTotal: 3024.13,
    dataAdmissao: '2025-03-01',
    horarioSemanal: [0, 1, 2, 3, 4, 5, 6].map((i) => ({ trabalha: i > 1, entrada: i > 1 ? '17:00' : '', saida: i > 1 ? '01:00' : '', almoco: '', jantar: '19:00-19:30' })),
  };
}

test('ficha válida é normalizada (nome, números brasileiros, horário)', () => {
  const r = validarColaborador(fichaBase());
  assert.equal(r.ok, true);
  assert.equal(r.payload.nome, 'Maria Silva');
  assert.equal(r.payload.salario, 2600);
  assert.equal(r.payload.inss, 216.13);
  assert.equal(r.payload.adSalarial, 0);
  assert.equal(r.payload.ativo, true);
  assert.equal('id' in r.payload, false);
  assert.equal(r.payload.horarioSemanal.length, 7);
  assert.equal(r.payload.horarioSemanal[2].entrada, '17:00');
  assert.equal(r.payload.tipoDesligamento, '');
});

test('ficha com id mantém o id e aceita desligamento completo', () => {
  const r = validarColaborador({ ...fichaBase(), id: 'abc-1', ativo: false, dataDesligamento: '2026-10-10', tipoDesligamento: 'acordo', valorRescisao: '1.500,00', desligamentoObs: 'ok' });
  assert.equal(r.ok, true);
  assert.equal(r.payload.id, 'abc-1');
  assert.equal(r.payload.ativo, false);
  assert.equal(r.payload.valorRescisao, 1500);
});

test('ficha recusa nome vazio, cargo/nível/contratação fora da lista e datas ruins', () => {
  assert.equal(validarColaborador({ ...fichaBase(), nome: '  ' }).error, 'nome_obrigatorio');
  assert.equal(validarColaborador({ ...fichaBase(), cargo: 'dj' }).error, 'cargo_invalido');
  assert.equal(validarColaborador({ ...fichaBase(), nivel: 'master' }).error, 'nivel_invalido');
  assert.equal(validarColaborador({ ...fichaBase(), contratacao: 'MEI' }).error, 'contratacao_invalida');
  assert.equal(validarColaborador({ ...fichaBase(), funcaoCargo: 'ceo' }).error, 'funcao_invalida');
  assert.equal(validarColaborador({ ...fichaBase(), mesReferencia: 'out/26' }).error, 'mes_invalido');
  assert.equal(validarColaborador({ ...fichaBase(), dataAdmissao: '01/03/2025' }).error, 'data_invalida:dataAdmissao');
  assert.equal(validarColaborador({ ...fichaBase(), salario: -1 }).error, 'valor_invalido:salario');
  assert.equal(validarColaborador({ ...fichaBase(), feriasInicio: '2026-10-20', feriasFim: '2026-10-10' }).error, 'ferias_invertidas');
  assert.equal(validarColaborador({ ...fichaBase(), feriasInicio: '2026-10-20' }).error, 'ferias_incompletas');
});

test('horário semanal cai no padrão quando ausente e recusa hora inválida', () => {
  const padrao = validarHorarioSemanal(undefined);
  assert.equal(padrao.length, 7);
  assert.deepEqual(padrao[0], { trabalha: false, entrada: '', saida: '', almoco: '', jantar: '' });
  const ruim = [0, 1, 2, 3, 4, 5, 6].map(() => ({ trabalha: true, entrada: '25:00', saida: '' }));
  assert.equal(validarHorarioSemanal(ruim), null);
  assert.equal(validarColaborador({ ...fichaBase(), horarioSemanal: ruim }).error, 'horario_invalido');
});

test('apagar colaborador exige id', () => {
  assert.equal(validarApagarColaborador({}).error, 'id_ausente');
  assert.deepEqual(validarApagarColaborador({ id: ' x1 ' }).payload, { id: 'x1' });
});

test('quadro mínimo aceita só setores conhecidos e aplica os mínimos do painel', () => {
  const r = validarQuadroMinimo({ rows: [
    { sector: 'salao', atendimentoPorPessoa: 0, brigadaPadrao: -2, limiteBrigada: '7.6' },
    { sector: 'cozinha', atendimentoPorPessoa: '60', brigadaPadrao: 4 },
  ] });
  assert.equal(r.ok, true);
  assert.deepEqual(r.payload.rows[0], { sector: 'salao', atendimentoPorPessoa: 1, brigadaPadrao: 0, limiteBrigada: 8 });
  assert.deepEqual(r.payload.rows[1], { sector: 'cozinha', atendimentoPorPessoa: 60, brigadaPadrao: 4, limiteBrigada: 0 });
  assert.equal(validarQuadroMinimo({ rows: [] }).error, 'linhas_ausentes');
  assert.equal(validarQuadroMinimo({ rows: [{ sector: 'dj' }] }).error, 'setor_invalido:dj');
  assert.equal(validarQuadroMinimo({ rows: [{ sector: 'bar', brigadaPadrao: 'x' }] }).error, 'valor_invalido:bar');
});

test('decisão de freelancers exige ids únicos e approve booleano', () => {
  assert.equal(validarDecisaoFreelancers({ ids: [], approve: true }).error, 'ids_ausentes');
  assert.equal(validarDecisaoFreelancers({ ids: ['a'], approve: 'sim' }).error, 'decisao_invalida');
  const r = validarDecisaoFreelancers({ ids: ['a', 'a', 'b'], approve: false, note: '  sem  verba ' });
  assert.deepEqual(r.payload, { ids: ['a', 'b'], approve: false, note: 'sem verba' });
  assert.equal(validarDecisaoFreelancers({ id: 'z', approve: true }).payload.ids[0], 'z');
});
