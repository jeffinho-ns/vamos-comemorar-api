const test = require('node:test');
const assert = require('node:assert/strict');
const { summarizeZig } = require('../../services/biJustino/zigSummary');
const { peekZigPainel, warmZigPainel, resetZigPainel, buscarZigPainel } = require('../../services/biJustino/zigPainel');

const AGORA = new Date('2026-10-21T15:00:00-03:00');

test('faturamento do mês, semana e ticket saem só da ZigRevenue', () => {
  const resumo = summarizeZig([
    { date: '2026-10-01', revenue: 100, publico: 10, servico: 5 },
    { date: '2026-10-19', revenue: 200, publico: 20, servico: 8 },
    { date: '2026-10-20', revenue: 300, publico: '', servico: 0 },
    { date: '2026-09-02', revenue: 90, publico: 9 },
    { date: '2025-10-10', revenue: 40, publico: 4 },
    { date: '2025-10-25', revenue: 999, publico: 1 },
  ], AGORA);

  assert.equal(resumo.hoje, '2026-10-21');
  assert.equal(resumo.mes.faturamento, 600);
  assert.equal(resumo.mes.publico, 30);
  assert.equal(resumo.mes.servico, 13);
  assert.equal(resumo.mes.mesmoMesAnoAnterior, 40);
  assert.equal(resumo.mes.mediaMensal, 90);
  assert.equal(resumo.mes.mesesNaMedia, 1);
  assert.equal(resumo.semana.inicio, '2026-10-19');
  assert.equal(resumo.semana.fim, '2026-10-21');
  assert.equal(resumo.semana.anterior, false);
  assert.equal(resumo.semana.faturamento, 500);
  assert.equal(resumo.semana.faturamentoAnoAnterior, null);
  assert.equal(resumo.tickets.semana, 10);
  assert.equal(resumo.tickets.mes, 10);
  assert.equal(resumo.serieMes.length, 21);
  assert.equal(resumo.serieMes[0].valor, 100);
  assert.equal(resumo.serieMes[20].dia, '2026-10-21');
  assert.equal(resumo.serieAno.length, 12);
  assert.equal(resumo.serieAno[11].mes, '2026-10');
  assert.equal(resumo.serieAno[11].valor, 600);
  const quinta = resumo.porDiaSemana.find((dia) => dia.nome === 'Quinta');
  const segunda = resumo.porDiaSemana.find((dia) => dia.nome === 'Segunda');
  assert.ok(quinta);
  assert.equal(quinta.faturamento, 100);
  assert.equal(segunda.faturamento, 200);
  assert.ok(resumo.semanas.length >= 1);
});

test('semana sem faturamento usa a semana anterior completa', () => {
  const resumo = summarizeZig([
    { date: '2026-10-12', revenue: 80, publico: 8 },
    { date: '2026-10-18', revenue: 20, publico: 2 },
  ], AGORA);

  assert.equal(resumo.semana.anterior, true);
  assert.equal(resumo.semana.inicio, '2026-10-12');
  assert.equal(resumo.semana.fim, '2026-10-18');
  assert.equal(resumo.semana.faturamento, 100);
  assert.equal(resumo.tickets.semana, 10);
});

test('um login só pede o faturamento com limite de 2000 dias', async () => {
  const corpos = [];
  const fetchImpl = async (_url, options) => {
    const body = JSON.parse(options.body);
    corpos.push(body);
    if (body.action === 'login') {
      return { text: async () => JSON.stringify({ ok: true, token: 'tok' }) };
    }
    if (body.action === 'getZigRevenue') {
      return { text: async () => JSON.stringify({ ok: true, docs: [{ date: '2026-10-21', revenue: 10, publico: 2 }] }) };
    }
    return { text: async () => JSON.stringify({ ok: true, items: [], docs: [] }) };
  };

  const painel = await buscarZigPainel({
    BI_APPS_SCRIPT_EMAIL: 'painel@seujustino.com.br',
    BI_APPS_SCRIPT_PASSWORD: 'senha',
  }, fetchImpl);

  const logins = corpos.filter((body) => body.action === 'login');
  const faturamento = corpos.find((body) => body.action === 'getZigRevenue');
  assert.equal(logins.length, 1);
  assert.equal(faturamento.limit, 2000);
  assert.equal(faturamento.token, 'tok');
  assert.equal(painel.mes.faturamento, 10);
  assert.equal(JSON.stringify(painel).includes('senha'), false);
});

test('sem senha da planilha, a ZigPay não é consultada', () => {
  resetZigPainel();
  let chamou = false;
  warmZigPainel({ BI_APPS_SCRIPT_EMAIL: '', BI_APPS_SCRIPT_PASSWORD: '' }, async () => {
    chamou = true;
    return { ok: true, text: async () => '{}' };
  });
  const painel = peekZigPainel();
  assert.equal(painel.erro, 'credenciais_ausentes');
  assert.equal(painel.value, null);
  assert.equal(chamou, false);
  resetZigPainel();
});
