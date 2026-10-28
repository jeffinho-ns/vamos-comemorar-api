'use strict';

const { custoFreelancer } = require('./graficoDiretoria');

const BASE = {
  revenue: 526000,
  tax: 3.86,
  card: 2.11,
  fee: 7,
  incomeTax: 2.7,
  traffic: 4500,
  marketingOther: 6439,
  attractions: 48114,
  security: 7979,
  extras: 26447,
  rent: 51613,
  disposable: 7113,
  coreHr: 104744,
  adminFixed: 27671,
  financeOther: 3208,
  otherOps: 18577,
};

function numeroOu(valores, nome, reserva) {
  if (!valores || valores[nome] == null || valores[nome] === '') return reserva;
  const n = Number(valores[nome]);
  return Number.isFinite(n) ? n : reserva;
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
  const r = Number.isFinite(faturamento) ? faturamento : numeroOu(finV, 'fnRevenueInput', BASE.revenue);
  const mix = numeroOu(cmvV, 'cmvFoodMix', 30);
  const cmvReal = (numeroOu(cmvV, 'cmvFoodReal', 25.14) * mix) / 100
    + (numeroOu(cmvV, 'cmvBevReal', 21.24) * (100 - mix)) / 100;
  const pctCosts = r * (
    numeroOu(finV, 'fnTax', BASE.tax)
    + numeroOu(finV, 'fnCard', BASE.card)
    + numeroOu(finV, 'fnFee', BASE.fee)
    + numeroOu(finV, 'fnIncomeTax', BASE.incomeTax)
  ) / 100;
  const cmvCost = r * cmvReal / 100;
  const mkSpend = numeroOu(mkV, 'mkTraffic', BASE.traffic)
    + numeroOu(mkV, 'mkOther', BASE.marketingOther)
    + numeroOu(mkV, 'mkAttractions', BASE.attractions);
  const financeAbs = numeroOu(finV, 'fnRent', BASE.rent)
    + numeroOu(finV, 'fnEnergy', 10000)
    + numeroOu(finV, 'fnWater', 6000)
    + numeroOu(finV, 'fnGas', 3337)
    + numeroOu(finV, 'fnDisposable', BASE.disposable)
    + numeroOu(finV, 'fnSecurity', BASE.security)
    + numeroOu(finV, 'fnAdminFixed', BASE.adminFixed)
    + numeroOu(finV, 'fnFinanceOther', BASE.financeOther);
  const rhCost = numeroOu(rhV, 'rhCore', BASE.coreHr)
    + numeroOu(rhV, 'rhExtras', BASE.extras)
    + custoFreelancer(fonte.freelancers, mesAtual(fonte.agora));
  const opCost = numeroOu(opV, 'opLoss', 0) + numeroOu(opV, 'opMaintenance', 0);
  const otherOps = Math.max(BASE.otherOps, r * 0.027);
  const total = pctCosts + cmvCost + mkSpend + financeAbs + rhCost + opCost + otherOps;
  const margem = r ? ((r - total) / r) * 100 : 0;
  const saudavel = {
    mk: Math.max(4500, r * 0.00855) + 4500 + r * 0.08,
    fn: numeroOu(finV, 'fnRent', BASE.rent) + Math.max(18000, r * 0.03) + r * 0.03 + 28000,
    rh: r * 0.19,
    op: r * 0.006 + Math.max(0, numeroOu(opV, 'opMaintenance', 0)),
    cmv: r * 0.22,
  };
  const real = { mk: mkSpend, fn: financeAbs, rh: rhCost, op: opCost, cmv: cmvCost };
  const economia = Object.keys(real).reduce((soma, chave) => soma + (saudavel[chave] - real[chave]), 0);
  const bonusDestravado = margem < 8 ? 0 : margem < 10 ? 25 : margem < 12 ? 60 : margem < 15 ? 100 : 125;
  return {
    faturamentoBruto: r,
    cmvReal,
    controlaveis: mkSpend + financeAbs + rhCost + opCost + cmvCost,
    estruturais: pctCosts + otherOps,
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
