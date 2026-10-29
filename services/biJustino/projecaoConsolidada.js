'use strict';

const { custoFreelancer } = require('./graficoDiretoria');

function numero(valores, nome) {
  if (!valores || valores[nome] == null || valores[nome] === '') return null;
  const n = Number(valores[nome]);
  return Number.isFinite(n) ? n : null;
}

function zero(valores, nome) {
  return numero(valores, nome) ?? 0;
}

function ultimo(payload) {
  const docs = payload && Array.isArray(payload.docs) ? payload.docs : [];
  return docs[0] || null;
}

function dataEnvio(doc) {
  const data = doc && typeof doc.date === 'string' ? doc.date.slice(0, 10) : '';
  return /^\d{4}-\d{2}-\d{2}$/.test(data) ? data : null;
}

function mesAtual(agora) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
  }).format(agora || new Date());
}

function cmvDaArea(valores) {
  const food = numero(valores, 'cmvFoodReal');
  const bev = numero(valores, 'cmvBevReal');
  if (food == null && bev == null) return null;
  const mix = numero(valores, 'cmvFoodMix') ?? 0;
  return ((food || 0) * mix) / 100 + ((bev || 0) * (100 - mix)) / 100;
}

function projecaoConsolidada(entrada) {
  const fonte = entrada || {};
  const fin = ultimo(fonte.financeiro);
  const mk = ultimo(fonte.marketing);
  const rh = ultimo(fonte.rh);
  const op = ultimo(fonte.operacao);
  const cmv = ultimo(fonte.cmv);
  const finV = (fin && fin.values) || {};
  const mkV = (mk && mk.values) || {};
  const rhV = (rh && rh.values) || {};
  const opV = (op && op.values) || {};
  const cmvV = (cmv && cmv.values) || {};
  const faturamento = fonte.faturamento == null ? null : Number(fonte.faturamento);
  const r = Number.isFinite(faturamento) ? faturamento : numero(finV, 'fnRevenueInput');
  const cmvReal = cmvDaArea(cmvV);
  const pctCosts = r
    ? r * (zero(finV, 'fnTax') + zero(finV, 'fnCard') + zero(finV, 'fnFee') + zero(finV, 'fnIncomeTax')) / 100
    : 0;
  const cmvCost = r && cmvReal != null ? r * cmvReal / 100 : 0;
  const mkSpend = zero(mkV, 'mkTraffic') + zero(mkV, 'mkOther') + zero(mkV, 'mkAttractions');
  const financeAbs = zero(finV, 'fnRent')
    + zero(finV, 'fnEnergy')
    + zero(finV, 'fnWater')
    + zero(finV, 'fnGas')
    + zero(finV, 'fnDisposable')
    + zero(finV, 'fnSecurity')
    + zero(finV, 'fnAdminFixed')
    + zero(finV, 'fnFinanceOther');
  const rhCost = zero(rhV, 'rhCore') + zero(rhV, 'rhExtras') + custoFreelancer(fonte.freelancers, mesAtual(fonte.agora));
  const opCost = zero(opV, 'opLoss') + zero(opV, 'opMaintenance');
  const controlaveis = mkSpend + financeAbs + rhCost + opCost + cmvCost;
  const estruturais = pctCosts;
  const total = controlaveis + estruturais;
  const temCusto = total > 0;
  const margem = r && temCusto ? ((r - total) / r) * 100 : null;
  const saudavel = {
    mk: r ? Math.max(0, r * 0.00855) + r * 0.08 : 0,
    fn: zero(finV, 'fnRent') + (r ? Math.max(0, r * 0.03) + r * 0.03 : 0),
    rh: r ? r * 0.19 : 0,
    op: r ? r * 0.006 + Math.max(0, zero(opV, 'opMaintenance')) : 0,
    cmv: r ? r * 0.22 : 0,
  };
  const real = { mk: mkSpend, fn: financeAbs, rh: rhCost, op: opCost, cmv: cmvCost };
  const economia = temCusto
    ? Object.keys(real).reduce((soma, chave) => soma + (saudavel[chave] - real[chave]), 0)
    : null;
  const bonusDestravado = margem == null
    ? null
    : margem < 8 ? 0 : margem < 10 ? 25 : margem < 12 ? 60 : margem < 15 ? 100 : 125;
  return {
    faturamentoBruto: r == null ? null : r,
    cmvReal,
    controlaveis: temCusto ? controlaveis : null,
    estruturais: estruturais > 0 ? estruturais : null,
    margem,
    economia,
    bonusDestravado,
    envios: {
      financeiro: dataEnvio(fin),
      marketing: dataEnvio(mk),
      rh: dataEnvio(rh),
      operacao: dataEnvio(op),
      cmv: dataEnvio(cmv),
    },
  };
}

module.exports = { projecaoConsolidada };
