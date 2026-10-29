'use strict';

const { custoFreelancer } = require('./graficoDiretoria');

const HEALTHY = {
  trafficRate: 0.00855,
  attractionRate: 0.08,
  securityRate: 0.015,
  extrasRate: 0.04,
  coreHrRate: 0.15,
  cmvPct: 22,
};

function n(v, reserva) {
  if (v == null || v === '') return reserva;
  const num = Number(v);
  return Number.isFinite(num) ? num : reserva;
}

function ultimo(payload) {
  const docs = payload && Array.isArray(payload.docs) ? payload.docs : [];
  return docs[0] || null;
}

function vals(payload) {
  const doc = ultimo(payload);
  return (doc && doc.values) || {};
}

function faixa(real, ok, warn) {
  if (real <= ok) return { nivel: 'g', selo: 'SAUDÁVEL' };
  if (real <= warn) return { nivel: 'y', selo: 'ATENÇÃO' };
  return { nivel: 'r', selo: 'CRÍTICO' };
}

function alerta(titulo, valor, faixaAtual, detalhe, tipo) {
  return {
    nivel: faixaAtual.nivel,
    titulo,
    valor,
    detalhe: detalhe || null,
    selo: faixaAtual.selo,
    tipo: tipo || null,
  };
}

function mesKey(agora) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
  }).format(agora || new Date());
}

function marketing(mkV, r) {
  const traffic = n(mkV.mkTraffic, 0);
  const attractions = n(mkV.mkAttractions, 0);
  const other = n(mkV.mkOther, 0);
  const spend = traffic + attractions + other;
  const receita = n(mkV.mkRevenue, 0);
  const show = n(mkV.mkShow, n(mkV.mkAttendance, 0));
  const reservas = n(mkV.mkReservations, 0);
  const roas = spend > 0 ? receita / spend : 0;
  const teto = Math.max(4500, r * HEALTHY.trafficRate) + 4500 + r * HEALTHY.attractionRate;
  const alertas = [
    alerta('Tráfego pago', traffic, faixa(traffic, Math.max(4500, r * HEALTHY.trafficRate), Math.max(5500, r * 0.012)), null, 'money'),
    alerta('Atrações (bandas/DJs/cantores)', attractions, faixa(attractions, r * HEALTHY.attractionRate, r * HEALTHY.attractionRate * 1.15), null, 'money'),
  ];
  if (reservas) {
    alertas.push({
      nivel: 'y',
      titulo: 'Comparecimento',
      valor: `${show} pessoa(s) de reserva`,
      detalhe: null,
      selo: 'ATENÇÃO',
    });
  } else {
    alertas.push({
      nivel: 'y',
      titulo: 'Comparecimento',
      valor: `${show} pessoa(s) de reserva`,
      detalhe: null,
      selo: 'SEM Nº DE RESERVAS PRA COMPARAR',
    });
  }
  if (roas < 15) {
    alertas.push({
      nivel: 'y',
      titulo: 'ROAS atribuído',
      valor: `${roas.toFixed(1)}x`,
      detalhe: 'A base histórica estimada é muito alta; valide atribuição antes de escalar mídia.',
      selo: 'ATENÇÃO',
    });
  }
  return {
    alertas,
    kpis: {
      gasto: spend,
      receita,
      roas: spend ? roas : null,
      impacto: teto - spend,
    },
  };
}

function financeiro(dre, r) {
  const cardPct = r && dre.card != null
    ? (dre.card < 30 ? dre.card : (dre.card / r) * 100)
    : 0;
  const util = n(dre.energy, 0) + n(dre.water, 0) + n(dre.gas, 0);
  const disposable = n(dre.disposable, 0);
  const admin = n(dre.adminFixed, 0);
  const custos = n(dre.rent, 0) + util + disposable + n(dre.security, 0) + admin + n(dre.financeOther, 0);
  const meta = n(dre.rent, 0)
    + Math.max(18000, r * 0.03)
    + r * 0.015
    + r * HEALTHY.securityRate
    + 25000
    + 3000;
  return {
    alertas: [
      alerta('Cartões', `${cardPct.toFixed(1).replace('.', ',')}%`, faixa(cardPct, 2.1, 2.4)),
      alerta('Utilidades', util, faixa(util, Math.max(18000, r * 0.03), Math.max(22000, r * 0.04)), null, 'money'),
      alerta('Descartáveis', disposable, faixa(disposable, r * 0.015, r * 0.02), null, 'money'),
      alerta('Administrativo fixo', admin, faixa(admin, 25000, 30000), null, 'money'),
    ],
    kpis: {
      custos,
      utilidades: util,
      cartoes: cardPct,
      economia: meta - custos,
    },
  };
}

function rh(rhV, r, servico, freelancer) {
  const core = n(rhV.rhCore, 0);
  const extras = n(rhV.rhExtras, 0) + (freelancer || 0);
  const base = Math.max(0, r - (servico || 0));
  const cmo = base ? (core + extras) / base * 100 : 0;
  const meta = base * (HEALTHY.coreHrRate + HEALTHY.extrasRate);
  let cmoFaixa = { nivel: 'g', selo: 'SAUDÁVEL' };
  if (cmo > 23) cmoFaixa = { nivel: 'r', selo: 'CRÍTICO' };
  else if (cmo > 19) cmoFaixa = { nivel: 'y', selo: 'ATENÇÃO' };
  return {
    alertas: [
      alerta('RH estrutural', core, faixa(core, r * HEALTHY.coreHrRate, r * 0.18), null, 'money'),
      alerta('Extras', extras, faixa(extras, r * HEALTHY.extrasRate, r * 0.05), null, 'money'),
    ],
    kpis: {
      estrutural: core,
      extras,
      cmo,
      cmoNivel: cmoFaixa.nivel,
      economia: meta - (core + extras),
    },
  };
}

function cmvBlend(doc) {
  if (!doc) return { theo: null, cover: null, food: null, bev: null };
  const food = doc.cmvComida;
  const bev = doc.cmvBebida;
  const cover = doc.cobertura;
  const vFood = n(doc.vendaComida, 0);
  const vBev = n(doc.vendaBebida, 0);
  let theo = null;
  if (food != null && bev != null && vFood + vBev > 0) theo = (food * vFood + bev * vBev) / (vFood + vBev);
  else if (food != null && bev != null) theo = (food + bev) / 2;
  else theo = food ?? bev;
  return { theo, cover, food, bev };
}

function operacao(opV, dre, r, cmvDoc, cmo) {
  const loss = n(opV.opLoss, 0);
  const disposable = n(dre.disposable, 0);
  const util = n(dre.energy, 0) + n(dre.water, 0) + n(dre.gas, 0);
  const security = n(dre.security, 0);
  const blend = cmvBlend(cmvDoc);
  const alertas = [
    alerta('Perdas / desperdícios', loss, faixa(loss, r * 0.006, r * 0.01), null, 'money'),
    alerta('Descartáveis', disposable, faixa(disposable, r * 0.015, r * 0.02), 'Valor somente leitura; revisar consumo/solicitação.', 'money'),
    alerta('Utilidades (energia+água+gás)', util, faixa(util, Math.max(18000, r * 0.03), Math.max(22000, r * 0.04)), 'Valor somente leitura, lançado pelo Financeiro.', 'money'),
    alerta('Segurança', security, faixa(security, r * HEALTHY.securityRate, r * HEALTHY.securityRate * 1.3), 'Custo validado pelo Financeiro; quantidade solicitada é sua.', 'money'),
  ];
  if (blend.theo != null) {
    alertas.push(alerta('CMV teórico (parcial)', `${blend.theo.toFixed(1).replace('.', ',')}%`, faixa(blend.theo, HEALTHY.cmvPct, HEALTHY.cmvPct + 2)));
  }
  return {
    alertas,
    kpis: {
      perdas: loss,
      sensivel: util + disposable + security,
      cmvTeorico: blend.theo,
      cobertura: blend.cover,
      cmo,
    },
  };
}

function cmv(doc) {
  const blend = cmvBlend(doc);
  const foodCover = doc && doc.coberturaFood != null ? Number(doc.coberturaFood) : null;
  const bevCover = doc && doc.coberturaBev != null ? Number(doc.coberturaBev) : null;
  const alertasComida = [];
  const alertasBebida = [];
  if (!doc) {
    alertasComida.push({ nivel: 'y', titulo: 'Sem dado do robô ainda', valor: '—', detalhe: 'Nenhum CMV teórico parcial capturado.', selo: 'ATENÇÃO' });
    alertasBebida.push({ nivel: 'y', titulo: 'Sem dado do robô ainda', valor: '—', detalhe: 'Nenhum CMV teórico parcial capturado.', selo: 'ATENÇÃO' });
  } else {
    if (blend.food != null) alertasComida.push(alerta('CMV teórico (sobre o coberto)', `${blend.food.toFixed(1).replace('.', ',')}%`, faixa(blend.food, 25.1, 28)));
    if (foodCover != null) alertasComida.push(alerta('Cobertura de ficha técnica', `${Number(foodCover).toFixed(1).replace('.', ',')}%`, foodCover >= 50 ? { nivel: 'g', selo: 'SAUDÁVEL' } : foodCover >= 20 ? { nivel: 'y', selo: 'ATENÇÃO' } : { nivel: 'r', selo: 'CRÍTICO' }));
    if (blend.bev != null) alertasBebida.push(alerta('CMV teórico (sobre o coberto)', `${blend.bev.toFixed(1).replace('.', ',')}%`, faixa(blend.bev, 21.2, 24)));
    if (bevCover != null) alertasBebida.push(alerta('Cobertura de ficha técnica', `${Number(bevCover).toFixed(1).replace('.', ',')}%`, bevCover >= 50 ? { nivel: 'g', selo: 'SAUDÁVEL' } : bevCover >= 20 ? { nivel: 'y', selo: 'ATENÇÃO' } : { nivel: 'r', selo: 'CRÍTICO' }));
  }
  return {
    alertasComida,
    alertasBebida,
    kpis: {
      comida: blend.food,
      bebida: blend.bev,
      cobertura: blend.cover,
    },
  };
}

function quadrosArea(entrada) {
  const fonte = entrada || {};
  const r = n(fonte.faturamento, 0);
  const servico = n(fonte.servico, 0);
  const dre = (fonte.dre && fonte.dre.valores) || fonte.dre || {};
  const mkV = vals(fonte.marketing);
  const rhV = vals(fonte.rh);
  const opV = vals(fonte.operacao);
  const freelancer = custoFreelancer(fonte.freelancers, mesKey(fonte.agora));
  const mk = marketing(mkV, r);
  const fn = financeiro(dre, r);
  const quadroRh = rh(rhV, r, servico, freelancer);
  const cmvDoc = Array.isArray(fonte.cmvZig) ? fonte.cmvZig[0] : fonte.cmvZig;
  const op = operacao(opV, dre, r, cmvDoc, quadroRh.kpis.cmo);
  const quadroCmv = cmv(cmvDoc);
  return {
    marketing: mk,
    financeiro: fn,
    rh: quadroRh,
    operacao: op,
    cmv: quadroCmv,
  };
}

module.exports = { quadrosArea };
