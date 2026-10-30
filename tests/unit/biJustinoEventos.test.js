const test = require('node:test');
const assert = require('node:assert/strict');
const ev = require('../../services/biJustino/eventos/validacao');
const ind = require('../../services/biJustino/eventos/indicadores');

test('evento exige data e cliente e só manda follow-up que veio no corpo', () => {
  assert.equal(ev.validarEvento({}).erro, 'data_invalida');
  assert.equal(ev.validarEvento({ data: '2026-10-30' }).erro, 'cliente_obrigatorio');
  const ok = ev.validarEvento({ data: '2026-10-30', nomeCliente: ' ACME ', tipoEvento: 'festa', valorContrato: '10.000,00', statusContrato: 'Assinado', valorExcedente: '1,5', pagamentoPendente: '1' });
  assert.equal(ok.payload.nomeCliente, 'ACME');
  assert.equal(ok.payload.tipoEvento, 'outro');
  assert.equal(ok.payload.valorContrato, 10000);
  assert.equal(ok.payload.statusContrato, 'Assinado');
  assert.equal(ok.payload.valorExcedente, 1.5);
  assert.equal(ok.payload.pagamentoPendente, true);
  assert.equal(ok.payload.statusPagamento, undefined);
  assert.equal(ev.validarEvento({ data: '2026-10-30', nomeCliente: 'A', id: 'id com espaço' }).erro, 'id_invalido');
});

test('tarefa, interação e cotação validam campos obrigatórios', () => {
  assert.equal(ev.validarTarefa({ eventoId: 'e1', titulo: 'x' }).erro, 'data_invalida');
  assert.equal(ev.validarTarefa({ eventoId: 'e1', titulo: 'x', dataVencimento: '2026-10-30', responsavelEmail: 'nope' }).erro, 'email_invalido');
  assert.deepEqual(ev.validarConcluirTarefa({ id: 't1' }).payload, { id: 't1', concluida: true });
  assert.deepEqual(ev.validarConcluirTarefa({ id: 't1', concluida: false }).payload, { id: 't1', concluida: false });
  assert.equal(ev.validarInteracao({ eventoId: 'e1', tipo: 'nota' }).erro, 'texto_obrigatorio');
  assert.equal(ev.validarInteracao({ eventoId: 'e1', tipo: 'fax', texto: 'oi' }).payload.tipo, 'nota');
  assert.equal(ev.validarCotacao({ nomeEmpresaCliente: 'X' }).erro, 'data_invalida');
  const cot = ev.validarCotacao({ nomeEmpresaCliente: 'X', dataEvento: '2026-12-01', valorTotal: '76.000,00', emailCliente: 'c@x.com', nomeEvento: 'Festa' });
  assert.equal(cot.payload.valorTotal, 76000);
  assert.equal(cot.payload.nomeEvento, 'Festa');
  assert.equal(cot.payload.formaPagamento, '');
  assert.equal(ev.validarEnvioContrato({ id: 'c1', assunto: '', corpo: 'x' }).erro, 'mensagem_obrigatoria');
});

test('valor de evento no sistema segue a regra de contrato assinado ou pagamento validado', () => {
  assert.equal(ind.valorSistema({ valorContrato: 100, statusContrato: 'Contrato assinado' }), 100);
  assert.equal(ind.valorSistema({ valorContrato: 100, statusPagamento: 'não pago' }), 0);
  assert.equal(ind.valorSistema({ valorContrato: 100, statusPagamento: 'pago parcialmente' }), 0);
  assert.equal(ind.valorSistema({ valorContrato: 100, statusPagamento: 'Pago' }), 100);
  assert.equal(ind.valorSistema({ valorContrato: 0, valorTotal: 80, statusPagamento: 'ok' }), 80);
  assert.equal(ind.valorBruto({ valorContrato: 100, valorExcedente: 20, valorTotal: 999 }), 120);
  assert.equal(ind.pagamentoDuvidoso({ statusPagamento: 'parcial' }), true);
  assert.equal(ind.pagamentoDuvidoso({ statusPagamento: 'parcial', statusContrato: 'assinado' }), false);
});

test('indicadores de eventos comparam mês e ano com o mesmo corte do painel', () => {
  const eventos = [
    { status: 'realizado', data: '2026-10-05', valorContrato: 1000, statusContrato: 'assinado' },
    { status: 'realizado', data: '2026-10-20', valorContrato: 500, statusPagamento: 'parcial' },
    { status: 'realizado', data: '2025-10-10', valorContrato: 300, statusContrato: 'assinado' },
    { status: 'realizado', data: '2025-11-10', valorContrato: 900, statusContrato: 'assinado' },
    { status: 'realizado', data: '2026-02-01', valorContrato: 200, statusPagamento: 'pago' },
    { status: 'confirmado', data: '2026-10-25', valorContrato: 5000, statusContrato: 'assinado' },
  ];
  const cotacoes = [
    { status: 'rascunho', valorTotal: 100 },
    { status: 'aprovado', valorTotal: 50 },
    { status: 'enviado', dataEvento: '2026-03-01' },
    { status: 'enviado', dataEvento: '2025-03-01' },
    { status: 'recusado', valorTotal: 10 },
  ];
  const d = ind.calcularIndicadores(eventos, cotacoes, '2026-10-30');
  assert.equal(d.emAndamentoCount, 2);
  assert.equal(d.emAndamentoValor, 150);
  assert.equal(d.realizadosMesCount, 2);
  assert.equal(d.realizadosMesValor, 1000);
  assert.equal(d.fatMesAnoAnterior, 300);
  assert.equal(d.fatAnoAtual, 1200);
  assert.equal(d.fatAnoAnterior, 300);
  assert.equal(d.cotEnviadasAnoAtual, 1);
  assert.equal(d.cotEnviadasAnoAnterior, 1);
  assert.equal(d.duvidosos.length, 1);
  assert.equal(d.duvidososValor, 500);
  const serie = ind.faturamentoPorMes(eventos, '2026-10-30');
  assert.equal(serie.length, 12);
  assert.equal(serie[0].mes, '2025-11');
  assert.equal(serie[0].valor, 900);
  assert.equal(serie[11].mes, '2026-10');
  assert.equal(serie[11].valor, 1000);
});
