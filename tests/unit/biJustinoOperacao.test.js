const test = require('node:test');
const assert = require('node:assert/strict');
const v = require('../../services/biJustino/operacao/validacao');
const freelancers = require('../../services/biJustino/operacao/freelancers');
const registro = require('../../services/biJustino/operacao/registroDia');
const reservas = require('../../services/biJustino/operacao/reservas');
const auditoriaOp = require('../../services/biJustino/operacao/auditoriaOp');
const { ESCRITAS, chavesDe } = require('../../services/biJustino/operacao/escritas');
const { encontrarLeitura } = require('../../services/biJustino/espelho/catalogo');
const { BLOQUEADAS } = require('../../services/biJustino/espelho/escrita');

test('helpers de validação normalizam data, hora, dinheiro e e-mail', () => {
  assert.equal(v.dataIso('2026-10-30T12:00'), '2026-10-30');
  assert.equal(v.dataIso('30/10/2026'), '');
  assert.equal(v.hora('9:5'), '');
  assert.equal(v.hora('9:30'), '09:30');
  assert.equal(v.hora('25:00'), '');
  assert.equal(v.dinheiro('1.234,56'), 1234.56);
  assert.equal(v.dinheiro('abc'), 0);
  assert.equal(v.inteiro('3,7', 1, 10), 4);
  assert.equal(v.email('  Fulano@Email.com '), 'fulano@email.com');
  assert.equal(v.email('sem-arroba'), null);
  assert.equal(v.email(''), '');
  assert.equal(v.id('abc-123_X'), 'abc-123_X');
  assert.equal(v.id('x y'), '');
});

test('solicitação avulsa de freelancer exige data, setor e turno da tabela', () => {
  assert.equal(freelancers.validarSolicitacao({}).erro, 'data_invalida');
  assert.equal(freelancers.validarSolicitacao({ date: '2026-10-30', sector: 'piscina' }).erro, 'setor_invalido');
  assert.equal(freelancers.validarSolicitacao({ date: '2026-10-30', sector: 'bar', shiftHours: 7 }).erro, 'turno_invalido');
  assert.equal(freelancers.validarSolicitacao({ date: '2026-10-30', sector: 'bar', shiftHours: 8, qty: 0 }).erro, 'quantidade_invalida');
  const ok = freelancers.validarSolicitacao({ date: '2026-10-30', sector: 'bar', shiftHours: '10', qty: '2', reason: 'x', note: ' reforço ' });
  assert.deepEqual(ok.payload, { date: '2026-10-30', sector: 'bar', reason: 'demanda', shiftHours: 10, qty: 2, note: 'reforço' });
});

test('lote semanal descarta quantidade zero e recusa lote vazio', () => {
  assert.equal(freelancers.validarLote({ items: [] }).erro, 'lote_vazio');
  assert.equal(freelancers.validarLote({ items: [{ date: '2026-10-30', sector: 'bar', shiftHours: 8, qty: 0 }] }).erro, 'lote_vazio');
  const ok = freelancers.validarLote({ items: [
    { date: '2026-10-30', sector: 'bar', shiftHours: 8, qty: 1, freelancerNames: 'João', horaEntrada: '18:00', horaSaida: '02:00' },
    { date: '2026-10-30', sector: 'salao', shiftHours: 9, qty: 0 },
  ] });
  assert.equal(ok.payload.items.length, 1);
  assert.equal(ok.payload.items[0].horaEntrada, '18:00');
});

test('presença de freelancer só grava quando vem decisão ou observação', () => {
  assert.equal(freelancers.validarPresenca({ id: 'a1' }).erro, 'nada_para_gravar');
  assert.deepEqual(freelancers.validarPresenca({ id: 'a1', attended: false }).payload, { id: 'a1', attended: false });
  assert.deepEqual(freelancers.validarPresenca({ id: 'a1', note: 'chegou tarde' }).payload, { id: 'a1', note: 'chegou tarde' });
  assert.deepEqual(freelancers.validarDecisaoLote({ ids: ['a', 'b c', 'd'], approve: 'true' }).payload, { ids: ['a', 'd'], approve: true, note: '' });
});

test('fechar mês, dúvidas e público ZigPay validam entrada', () => {
  assert.equal(registro.validarFecharMes({ area: 'financeiro', monthKey: '2026-09' }).erro, 'area_invalida');
  assert.deepEqual(registro.validarFecharMes({ area: 'reservas', monthKey: '2026-09' }).payload, { area: 'reservas', monthKey: '2026-09' });
  assert.equal(registro.validarDuvida({ area: 'gestores', question: 'ab' }).erro, 'pergunta_obrigatoria');
  assert.equal(registro.validarDuvida({ area: 'ti', question: 'abc' }).erro, 'area_invalida');
  assert.equal(registro.validarResposta({ id: 'x', answer: '' }).erro, 'resposta_obrigatoria');
  const agora = () => new Date('2026-10-30T15:00:00-03:00');
  assert.equal(registro.validarZigPublico({ date: '2026-11-01', publico: 10 }, agora()).erro, 'data_futura');
  assert.equal(registro.validarZigPublico({ date: '2026-10-29', publico: -1 }, agora()).erro, 'publico_invalido');
  assert.equal(registro.validarZigPublico({ date: '2026-10-29', publico: '1.250' }, agora()).payload.publico, 1250);
});

test('reserva nova normaliza pax, tipo, origem, hora e lista de convidados', () => {
  assert.equal(reservas.validarNova({}).erro, 'data_invalida');
  assert.equal(reservas.validarNova({ date: '2026-10-30', email: 'x' }).erro, 'email_invalido');
  const ok = reservas.validarNova({ date: '2026-10-30', pax: 0, tipo: 'vip', origem: 'whatsapp', ativacaoId: 'a', hora: '20:30', convidados: ' b \n\n a ', clientRequestId: 'req1' });
  assert.equal(ok.payload.pax, 1);
  assert.equal(ok.payload.tipo, 'normal');
  assert.equal(ok.payload.ativacaoId, '');
  assert.equal(ok.payload.hora, '20:30');
  assert.equal(ok.payload.convidados, 'b\na');
  assert.equal(ok.payload.clientRequestId, 'req1');
  assert.equal(reservas.validarEdicao({ date: '2026-10-30' }).erro, 'id_invalido');
  assert.equal(reservas.validarLote({ items: [{ date: 'x' }] }).erro, 'data_invalida');
  assert.equal(reservas.validarCrmConfig({ config: { a: 1 } }).erro, 'config_vazia');
});

test('item de auditoria operacional nasce aguardando aprovação quando marcado', () => {
  assert.equal(auditoriaOp.validarItem({}).erro, 'descricao_obrigatoria');
  const novo = auditoriaOp.validarItem({ descricaoProblema: 'fiação exposta', necessitaAprovacao: '1', status: 'aberto', valorEstimado: '1.500,00', setor: 'areaExterna' });
  assert.equal(novo.payload.status, 'aguardandoAprovacao');
  assert.equal(novo.payload.valorEstimado, 1500);
  assert.equal(novo.payload.setor, 'areaExterna');
  const editado = auditoriaOp.validarItem({ id: 'it1', descricaoProblema: 'x', necessitaAprovacao: true, status: 'andamento' });
  assert.equal(editado.payload.status, 'andamento');
  assert.equal(editado.payload.id, 'it1');
});

test('indicadores da auditoria operacional seguem a conta do painel', () => {
  const itens = [
    { status: 'aberto', prazo: '2026-10-01', valorEstimado: 100, tipoServico: 'manutencao' },
    { status: 'andamento', prazo: '2026-12-01', valorEstimado: 50, tipoServico: 'obra' },
    { status: 'concluido', prazo: '2026-01-01', valorEstimado: 999, tipoServico: 'manutencao' },
    { status: 'aguardandoAprovacao', prazo: '', valorEstimado: 25, tipoServico: 'manutencao' },
  ];
  const k = auditoriaOp.indicadores(itens, '2026-10-30');
  assert.deepEqual(k, { aberto: 1, andamento: 1, aguardando: 1, concluido: 1, atrasado: 1, valorAberto: 175, manutencaoAberta: 125 });
});

test('tabela de escritas só usa ações de gravação permitidas e chaves do catálogo', () => {
  const caminhos = ESCRITAS.map((e) => e.caminho);
  assert.equal(new Set(caminhos).size, caminhos.length);
  ESCRITAS.forEach((e) => {
    assert.ok(!/^get/.test(e.action), e.action);
    assert.ok(!BLOQUEADAS.has(e.action), e.action);
    assert.equal(typeof e.validar, 'function');
    const chaves = chavesDe(e, { area: 'eventos' });
    chaves.forEach((chave) => assert.ok(encontrarLeitura(chave), `${e.caminho} → ${chave}`));
  });
  assert.deepEqual(chavesDe(ESCRITAS.find((e) => e.action === 'closeMonth'), { area: 'auditoriaop' }), ['getMonthClosures:auditoriaop']);
  assert.ok(ESCRITAS.filter((e) => e.aprovacao).map((e) => e.action).includes('decideEventoCotacao'));
});
