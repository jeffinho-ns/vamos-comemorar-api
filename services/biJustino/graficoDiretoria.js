const { addDays } = require('./zigSummary');

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const BASE = {
  traffic: 4500,
  marketingOther: 6439,
  attractions: 48114,
  rent: 51613,
  disposable: 7113,
  security: 7979,
  coreHr: 104744,
  extras: 26447,
  adminFixed: 27671,
  financeOther: 3208,
};

function addMonths(monthKey, delta) {
  const [year, month] = monthKey.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function hojeIso(now) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

function valorEvento(evento) {
  if (!evento || evento.status !== 'realizado' || !evento.data) return 0;
  const contrato = /assinado/i.test(evento.statusContrato || '');
  const pagamento = String(evento.statusPagamento || '').toLowerCase();
  const pago = pagamento
    && !/n[ãa]o|pendente|aguardando|falta|parcial/.test(pagamento)
    && /pago|confirmado|quitado|recebid|liquidad|\bok\b/.test(pagamento);
  if (!contrato && !pago) return 0;
  const viaContrato = (Number(evento.valorContrato) || 0) + (Number(evento.valorExcedente) || 0);
  return viaContrato > 0 ? viaContrato : (Number(evento.valorTotal) || 0);
}

function indexarZig(docs) {
  const porDia = {};
  for (const doc of docs || []) {
    const date = String(doc && doc.date ? doc.date : '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    porDia[date] = Number(doc.revenue) || 0;
  }
  return porDia;
}

function indexarEventos(eventos) {
  const porDia = {};
  for (const evento of eventos || []) {
    const valor = valorEvento(evento);
    if (!valor) continue;
    porDia[evento.data] = (porDia[evento.data] || 0) + valor;
  }
  return porDia;
}

function serieDoMes(porZig, porEvento, hoje) {
  const monthKey = hoje.slice(0, 7);
  const serie = [];
  let cursor = `${monthKey}-01`;
  while (cursor <= hoje && cursor.slice(0, 7) === monthKey) {
    serie.push({
      dia: cursor,
      rotulo: cursor.slice(8),
      zig: porZig[cursor] || 0,
      eventos: porEvento[cursor] || 0,
    });
    cursor = addDays(cursor, 1);
  }
  return serie;
}

function serieDoAno(porZig, porEvento, hoje) {
  const monthKey = hoje.slice(0, 7);
  const zigMes = {};
  const eventoMes = {};
  Object.keys(porZig).forEach((dia) => {
    const mes = dia.slice(0, 7);
    zigMes[mes] = (zigMes[mes] || 0) + porZig[dia];
  });
  Object.keys(porEvento).forEach((dia) => {
    const mes = dia.slice(0, 7);
    eventoMes[mes] = (eventoMes[mes] || 0) + porEvento[dia];
  });
  const serie = [];
  for (let i = 11; i >= 0; i -= 1) {
    const mes = addMonths(monthKey, -i);
    serie.push({
      mes,
      rotulo: MESES[Number(mes.slice(5, 7)) - 1],
      zig: zigMes[mes] || 0,
      eventos: eventoMes[mes] || 0,
    });
  }
  return serie;
}

function campo(valores, nome, reserva) {
  if (!valores || valores[nome] == null || valores[nome] === '') return reserva;
  return Number(valores[nome]) || 0;
}

function ultimoEnvio(payload) {
  const docs = payload && Array.isArray(payload.docs) ? payload.docs : [];
  return (docs[0] && docs[0].values) || {};
}

function custoFreelancer(itens, monthKey) {
  return (itens || []).reduce((total, item) => {
    if (item.status !== 'aprovado' || item.attendance === 'faltou') return total;
    if (String(item.date || '').slice(0, 7) !== monthKey) return total;
    return total + (Number(item.totalCost) || 0);
  }, 0);
}

function custosPorArea({ entradas, freelancers, faturamento, monthKey }) {
  const mk = ultimoEnvio(entradas.marketing);
  const fn = ultimoEnvio(entradas.financeiro);
  const rh = ultimoEnvio(entradas.rh);
  const op = ultimoEnvio(entradas.operacao);
  const cmv = ultimoEnvio(entradas.cmv);
  const mix = campo(cmv, 'cmvFoodMix', 30);
  const comida = campo(cmv, 'cmvFoodReal', 25.14);
  const bebida = campo(cmv, 'cmvBevReal', 21.24);
  const cmvReal = (comida * mix) / 100 + (bebida * (100 - mix)) / 100;
  return [
    {
      label: 'Marketing',
      valor: campo(mk, 'mkTraffic', BASE.traffic) + campo(mk, 'mkOther', BASE.marketingOther) + campo(mk, 'mkAttractions', BASE.attractions),
    },
    {
      label: 'Financeiro',
      valor: campo(fn, 'fnRent', BASE.rent) + campo(fn, 'fnEnergy', 10000) + campo(fn, 'fnWater', 6000) + campo(fn, 'fnGas', 3337)
        + campo(fn, 'fnDisposable', BASE.disposable) + campo(fn, 'fnSecurity', BASE.security)
        + campo(fn, 'fnAdminFixed', BASE.adminFixed) + campo(fn, 'fnFinanceOther', BASE.financeOther),
    },
    {
      label: 'RH',
      valor: campo(rh, 'rhCore', BASE.coreHr) + campo(rh, 'rhExtras', BASE.extras) + custoFreelancer(freelancers, monthKey),
    },
    {
      label: 'Operação',
      valor: campo(op, 'opLoss', 0) + campo(op, 'opMaintenance', 0),
    },
    {
      label: 'CMV',
      valor: (Number(faturamento) || 0) * cmvReal / 100,
    },
  ];
}

function montarGrafico({ docs, eventos, entradas, freelancers, now }) {
  const hoje = hojeIso(now || new Date());
  const porZig = indexarZig(docs);
  const porEvento = indexarEventos(eventos);
  const serieMes = serieDoMes(porZig, porEvento, hoje);
  const faturamento = serieMes.reduce((total, ponto) => total + ponto.zig + ponto.eventos, 0);
  return {
    serieMes,
    serieAno: serieDoAno(porZig, porEvento, hoje),
    custos: custosPorArea({
      entradas: entradas || {},
      freelancers: freelancers || [],
      faturamento,
      monthKey: hoje.slice(0, 7),
    }),
  };
}

module.exports = { montarGrafico, valorEvento, custoFreelancer };
