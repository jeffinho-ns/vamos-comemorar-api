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

const HEALTHY = {
  trafficRate: 0.00855,
  marketingOther: 4500,
  attractionRate: 0.08,
  securityRate: 0.015,
  extrasRate: 0.04,
  coreHrRate: 0.15,
  adminFixed: 25000,
  financeOther: 3000,
  lossRate: 0.006,
  disposableRate: 0.015,
  cmvPct: 22,
};

const AREAS = [
  { chave: 'mk', envio: 'marketing', label: 'Marketing' },
  { chave: 'fn', envio: 'financeiro', label: 'Financeiro' },
  { chave: 'rh', envio: 'rh', label: 'RH' },
  { chave: 'op', envio: 'operacao', label: 'Gerente Operador' },
  { chave: 'cmv', envio: 'cmv', label: 'CMV' },
];

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

function hojeIso(agora) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(agora || new Date());
}

function dataBr(iso) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '—';
  const [ano, mes, dia] = iso.split('-');
  return `${dia}/${mes}/${ano}`;
}

function statusCusto(real, meta) {
  if (real <= meta) return { nivel: 'g', status: 'SAUDÁVEL' };
  if (real <= meta * 1.15) return { nivel: 'y', status: 'ATENÇÃO' };
  return { nivel: 'r', status: 'CRÍTICO' };
}

function bonusGate(margem) {
  if (margem < 8) return 0;
  if (margem < 10) return 25;
  if (margem < 12) return 60;
  if (margem < 15) return 100;
  return 125;
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
  const cmvFoodReal = numeroOu(cmvV, 'cmvFoodReal', 25.14);
  const cmvBevReal = numeroOu(cmvV, 'cmvBevReal', 21.24);
  const cmvFoodTheo = numeroOu(cmvV, 'cmvFoodTheo', 25.14);
  const cmvBevTheo = numeroOu(cmvV, 'cmvBevTheo', 21.24);
  const cmvReal = (cmvFoodReal * mix) / 100 + (cmvBevReal * (100 - mix)) / 100;
  const cmvTheo = (cmvFoodTheo * mix) / 100 + (cmvBevTheo * (100 - mix)) / 100;
  const cmvDev = cmvReal - cmvTheo;
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
    mk: Math.max(4500, r * HEALTHY.trafficRate) + HEALTHY.marketingOther + r * HEALTHY.attractionRate,
    fn: numeroOu(finV, 'fnRent', BASE.rent) + Math.max(18000, r * 0.03) + r * HEALTHY.disposableRate + r * HEALTHY.securityRate + HEALTHY.adminFixed + HEALTHY.financeOther,
    rh: r * (HEALTHY.coreHrRate + HEALTHY.extrasRate),
    op: r * HEALTHY.lossRate + Math.max(0, numeroOu(opV, 'opMaintenance', 0)),
    cmv: r * HEALTHY.cmvPct / 100,
  };
  const real = { mk: mkSpend, fn: financeAbs, rh: rhCost, op: opCost, cmv: cmvCost };
  const envios = {
    financeiro: dataEnvio(fin),
    marketing: dataEnvio(mk),
    rh: dataEnvio(rh),
    operacao: dataEnvio(op),
    cmv: dataEnvio(cmv),
  };
  const hoje = hojeIso(fonte.agora);
  const areas = AREAS.map((area) => {
    const meta = saudavel[area.chave];
    const atual = real[area.chave];
    const economia = meta - atual;
    const faixa = statusCusto(atual, meta);
    const envio = envios[area.envio];
    return {
      chave: area.chave,
      label: area.label,
      meta,
      real: atual,
      economia,
      status: faixa.status,
      nivel: faixa.nivel,
      envio,
      usandoReferencia: !envio,
      envioHoje: Boolean(envio && envio === hoje),
    };
  });
  const alertas = [];
  AREAS.forEach((area) => {
    const envio = envios[area.envio];
    if (!envio) {
      alertas.push({
        nivel: 'y',
        titulo: `${area.label} nunca enviou um registro`,
        valor: '—',
        detalhe: null,
        selo: 'ATENÇÃO',
      });
    } else if (envio !== hoje) {
      alertas.push({
        nivel: 'y',
        titulo: `${area.label} sem envio hoje`,
        valor: `Último envio: ${dataBr(envio)}`,
        detalhe: null,
        selo: 'ATENÇÃO',
      });
    }
  });
  if (margem < 8) {
    alertas.push({
      nivel: 'r',
      titulo: 'Margem abaixo do gatilho de bônus',
      valor: `${margem.toFixed(1).replace('.', ',')}%`,
      detalhe: 'Nenhum bônus é destravado abaixo de 8%.',
      selo: 'REVISAR',
    });
  }
  if (cmvDev >= 2) {
    alertas.push({
      nivel: 'r',
      titulo: 'Desvio CMV teórico × real',
      valor: `${cmvDev.toFixed(1).replace('.', ',')}%`,
      detalhe: 'Revisar estoque, ficha, porcionamento e perdas.',
      selo: 'CRÍTICO',
    });
  }
  const util = numeroOu(finV, 'fnEnergy', 10000) + numeroOu(finV, 'fnWater', 6000) + numeroOu(finV, 'fnGas', 3337);
  if (r && util > r * 0.04) {
    alertas.push({
      nivel: 'y',
      titulo: 'Utilidades acima da referência',
      valor: util,
      detalhe: 'Acima de 4% da receita.',
      selo: 'ATENÇÃO',
      tipo: 'money',
    });
  }
  if (!alertas.length) {
    alertas.push({
      nivel: 'g',
      titulo: 'Consolidado dentro das faixas principais',
      valor: 'Sem alerta crítico',
      detalhe: null,
      selo: 'SAUDÁVEL',
    });
  }
  const economia = Object.keys(real).reduce((soma, chave) => soma + (saudavel[chave] - real[chave]), 0);
  return {
    faturamentoBruto: r,
    cmvReal,
    controlaveis: mkSpend + financeAbs + rhCost + opCost + cmvCost,
    estruturais: pctCosts + otherOps,
    margem,
    economia,
    bonusDestravado: bonusGate(margem),
    envios,
    areas,
    alertas,
  };
}

module.exports = { projecaoConsolidada };
