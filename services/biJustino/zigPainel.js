const { readActions } = require('./appsScriptClient');
const { summarizeZig } = require('./zigSummary');
const { montarGrafico, valorEvento } = require('./graficoDiretoria');

const DIAS_HORARIO = ['Geral', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];
const NOME_DOW = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

const CACHE_MS = 5 * 60 * 1000;
const RETRY_MS = 60 * 1000;

let state = { value: null, erro: null, carregando: false, at: 0 };

function horaSaoPaulo(start) {
  const date = new Date(start);
  if (Number.isNaN(date.getTime())) return String(start || '').slice(0, 5) || '—';
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(date);
}

function nomeDoDia(iso) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const [year, month, day] = iso.split('-').map(Number);
  return NOME_DOW[new Date(Date.UTC(year, month - 1, day)).getUTCDay()] || null;
}

function pontosDeMapa(mapa) {
  return [...mapa.entries()]
    .map(([hora, valor]) => ({ hora, valor: valor.n ? valor.soma / valor.n : 0 }))
    .sort((a, b) => a.hora.localeCompare(b.hora));
}

function compactHorario(payload) {
  const items = payload && Array.isArray(payload.items) ? payload.items : [];
  if (!items.length) return null;
  const porDia = {};
  DIAS_HORARIO.forEach((nome) => {
    porDia[nome] = new Map();
  });
  const dias = new Set();
  for (const item of items) {
    if (item.date) dias.add(item.date);
    const hora = horaSaoPaulo(item.start);
    const valor = (Number(item.value) || 0) / 100;
    const somar = (mapa) => {
      const atual = mapa.get(hora) || { soma: 0, n: 0 };
      mapa.set(hora, { soma: atual.soma + valor, n: atual.n + 1 });
    };
    somar(porDia.Geral);
    const nome = nomeDoDia(item.date);
    if (nome && porDia[nome]) somar(porDia[nome]);
  }
  const pontos = pontosDeMapa(porDia.Geral);
  const porDiaLista = {};
  DIAS_HORARIO.forEach((nome) => {
    porDiaLista[nome] = pontosDeMapa(porDia[nome]);
  });
  return { dias: dias.size, pontos, porDia: porDiaLista };
}

function resumirEventos(payload) {
  const items = payload && Array.isArray(payload.items) ? payload.items : [];
  if (!items.length) return null;
  const mes = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
  }).format(new Date());
  const ano = mes.slice(0, 4);
  let cotacoesAndamento = 0;
  let cotacoesFechadas = 0;
  let realizados = 0;
  let faturamentoMes = 0;
  let faturamentoAno = 0;
  const lista = [];
  for (const evento of items) {
    const status = String(evento.status || '').toLowerCase();
    const data = String(evento.data || '').slice(0, 10);
    if (/cota|or[cç]amento|andamento|negoci/.test(status)) cotacoesAndamento += 1;
    if (/fechad|assinad|confirm/.test(status)) cotacoesFechadas += 1;
    const valor = valorEvento(evento);
    if (status === 'realizado' || /realiz/.test(status)) {
      realizados += 1;
      if (data.slice(0, 7) === mes) faturamentoMes += valor;
      if (data.slice(0, 4) === ano) faturamentoAno += valor;
    }
    lista.push({
      data,
      cliente: String(evento.cliente || evento.nome || '').slice(0, 80),
      tipo: String(evento.tipo || '').slice(0, 40),
      pax: Number(evento.pax) || 0,
      contrato: Number(evento.valorContrato) || 0,
      sinal: Number(evento.valorSinal) || 0,
      status: String(evento.status || '').slice(0, 40),
    });
  }
  return {
    cotacoesAndamento,
    cotacoesFechadas,
    realizados,
    faturamentoMes,
    faturamentoAno,
    lista: lista.slice(0, 20),
  };
}

function extrasDoPainel({
  hourly,
  bilheteria,
  ranking,
  cmv,
  eventos,
  marketing,
  financeiro,
  rh,
  operacao,
  cmvArea,
}) {
  return {
    horario: compactHorario(hourly),
    bilheteria: compactBilheteria(bilheteria),
    ranking: compactRanking(ranking),
    cmv: compactCmv(cmv),
    eventosResumo: resumirEventos(eventos),
    lancamentos: {
      marketing: linhasEnvio(marketing, ['mkTraffic', 'mkOther', 'mkAttractions', 'mkReservas', 'mkAttendance', 'mkRevenue']),
      financeiro: linhasEnvio(financeiro, ['fnRevenueInput', 'fnTax', 'fnCard', 'fnRent', 'fnEnergy', 'fnWater', 'fnGas', 'fnDisposable', 'fnSecurity']),
      rh: linhasEnvio(rh, ['rhCore', 'rhExtras', 'rhHeadcount', 'rhActive']),
      operacao: linhasEnvio(operacao, ['opPublico', 'opLoss', 'opMaintenance']),
      cmv: linhasEnvio(cmvArea, ['cmvFoodReal', 'cmvBevReal', 'cmvFoodMix', 'cmvFoodCover', 'cmvBevCover']),
    },
  };
}

function linhasEnvio(payload, chaves) {
  const docs = payload && Array.isArray(payload.docs) ? payload.docs : [];
  return docs.slice(0, 8).map((doc) => {
    const values = doc && doc.values && typeof doc.values === 'object' ? doc.values : {};
    const linha = { date: String(doc.date || '').slice(0, 10) };
    chaves.forEach((chave) => {
      const n = Number(values[chave]);
      linha[chave] = Number.isFinite(n) ? n : null;
    });
    return linha;
  });
}

function itemCurto(item) {
  return {
    nome: item.nome,
    quantidade: item.quantidade,
    valorTotal: item.valorTotal,
    cmvPct: item.cmvPct == null ? null : item.cmvPct,
  };
}

function compactRanking(payload) {
  if (!payload) return null;
  const curva = Array.isArray(payload.curvaAbc) ? payload.curvaAbc.slice(0, 12) : [];
  return {
    dias: payload.days || 30,
    bebida: (payload.top6BebidaVenda || []).map(itemCurto),
    comida: (payload.top6ComidaVenda || []).map(itemCurto),
    bebidaCmv: (payload.top6BebidaCmv || []).map(itemCurto),
    comidaCmv: (payload.top6ComidaCmv || []).map(itemCurto),
    curvaAbc: curva.map((item) => ({
      nome: item.nome,
      valorTotal: item.valorTotal,
      pctAcumulado: item.pctAcumulado,
      classe: item.classe,
    })),
    semFicha: (payload.semFicha || []).slice(0, 10).map((item) => ({
      nome: item.nome,
      categoria: item.categoria,
      tipo: item.tipo,
      quantidade: item.quantidade,
      valorTotal: item.valorTotal,
    })),
  };
}

function compactCmv(payload) {
  const docs = payload && Array.isArray(payload.docs) ? payload.docs : [];
  return docs.filter((doc) => !doc.suspeito).slice(0, 8).map((doc) => ({
    date: doc.date,
    cmvComida: doc.cmvFoodPctSobreCobertura == null ? null : Number(doc.cmvFoodPctSobreCobertura),
    cmvBebida: doc.cmvBevPctSobreCobertura == null ? null : Number(doc.cmvBevPctSobreCobertura),
    cobertura: doc.coberturaTotalPct == null ? null : Number(doc.coberturaTotalPct),
    coberturaFood: doc.coberturaFoodPct == null ? null : Number(doc.coberturaFoodPct),
    coberturaBev: doc.coberturaBevPct == null ? null : Number(doc.coberturaBevPct),
    vendaComida: Number(doc.valorTotalFood) || 0,
    vendaBebida: Number(doc.valorTotalBev) || 0,
  }));
}

function compactBilheteria(payload) {
  const docs = payload && Array.isArray(payload.docs) ? payload.docs : [];
  return docs.map((doc) => ({
    mes: doc.mes,
    receita: Number(doc.receita) || 0,
    entradasQtd: Number(doc.entradasQtd) || 0,
    publicoMes: Number(doc.publicoMes) || 0,
    pctClientesEntradas: doc.pctClientesEntradas == null ? null : Number(doc.pctClientesEntradas),
  }));
}

async function buscarZigPainel(env, fetchImpl) {
  const [revenue, hourly, bilheteria, ranking, cmv, eventos, marketing, financeiro, rh, operacao, cmvArea, freelas] = await readActions([
    { action: 'getZigRevenue', payload: { limit: 2000 } },
    { action: 'getZigHourly', payload: { days: 14 } },
    { action: 'getZigBilheteria', payload: { limit: 13 } },
    { action: 'getZigItemSalesRanking', payload: { days: 30 } },
    { action: 'getCmvTeoricoParcial', payload: { limit: 8 } },
    { action: 'getEventos' },
    { action: 'getEntries', payload: { area: 'marketing', limit: 1 } },
    { action: 'getEntries', payload: { area: 'financeiro', limit: 1 } },
    { action: 'getEntries', payload: { area: 'rh', limit: 1 } },
    { action: 'getEntries', payload: { area: 'operacao', limit: 1 } },
    { action: 'getEntries', payload: { area: 'cmv', limit: 1 } },
    { action: 'getFreelancerRequests' },
  ], env, fetchImpl);

  if (!revenue || !Array.isArray(revenue.docs)) {
    const error = new Error('leitura_recusada');
    error.code = 'leitura_recusada';
    throw error;
  }

  const grafico = montarGrafico({
    docs: revenue.docs,
    eventos: eventos && Array.isArray(eventos.items) ? eventos.items : [],
    entradas: { marketing, financeiro, rh, operacao, cmv: cmvArea },
    freelancers: freelas && Array.isArray(freelas.items) ? freelas.items : [],
    now: new Date(),
  });

  return {
    ...summarizeZig(revenue.docs, new Date()),
    ...grafico,
    atualizadoEm: new Date().toISOString(),
    ...extrasDoPainel({
      hourly,
      bilheteria,
      ranking,
      cmv,
      eventos,
      marketing,
      financeiro,
      rh,
      operacao,
      cmvArea,
    }),
  };
}

function peekZigPainel() {
  return { value: state.value, erro: state.erro, carregando: state.carregando };
}

function warmZigPainel(env = process.env, fetchImpl) {
  const source = env || process.env;
  const email = String(source.BI_APPS_SCRIPT_EMAIL || '').trim();
  const password = String(source.BI_APPS_SCRIPT_PASSWORD || '');
  if (!email || !password) {
    state = { value: null, erro: 'credenciais_ausentes', carregando: false, at: Date.now() };
    return;
  }
  if (state.carregando) return;
  if (state.value && Date.now() - state.at < CACHE_MS) return;
  if (state.erro && Date.now() - state.at < RETRY_MS) return;

  state = { ...state, carregando: true };
  buscarZigPainel(source, fetchImpl)
    .then((value) => {
      state = { value, erro: null, carregando: false, at: Date.now() };
    })
    .catch((error) => {
      state = {
        value: state.value,
        erro: error && error.code ? error.code : 'falha_zig',
        carregando: false,
        at: Date.now(),
      };
    });
}

function resetZigPainel() {
  state = { value: null, erro: null, carregando: false, at: 0 };
}

function painelDeMapa(mapa) {
  const fonte = mapa || {};
  const revenue = fonte.getZigRevenue;
  const hourly = fonte.getZigHourly;
  const bilheteria = fonte.getZigBilheteria;
  const ranking = fonte.getZigItemSalesRanking;
  const cmv = fonte.getCmvTeoricoParcial;
  const eventos = fonte.getEventos;
  const freelas = fonte.getFreelancerRequests;
  const temRevenue = Boolean(revenue && Array.isArray(revenue.docs));
  const extras = extrasDoPainel({
    hourly,
    bilheteria,
    ranking,
    cmv,
    eventos,
    marketing: fonte['getEntries:marketing'],
    financeiro: fonte['getEntries:financeiro'],
    rh: fonte['getEntries:rh'],
    operacao: fonte['getEntries:operacao'],
    cmvArea: fonte['getEntries:cmv'],
  });
  const temExtra = Boolean(
    extras.horario
    || extras.bilheteria.length
    || extras.ranking
    || extras.cmv.length
    || extras.eventosResumo
  );
  if (!temRevenue && !temExtra) return null;
  const base = temRevenue ? {
    ...summarizeZig(revenue.docs, new Date()),
    ...montarGrafico({
      docs: revenue.docs,
      eventos: eventos && Array.isArray(eventos.items) ? eventos.items : [],
      entradas: {
        marketing: fonte['getEntries:marketing'],
        financeiro: fonte['getEntries:financeiro'],
        rh: fonte['getEntries:rh'],
        operacao: fonte['getEntries:operacao'],
        cmv: fonte['getEntries:cmv'],
      },
      freelancers: freelas && Array.isArray(freelas.items) ? freelas.items : [],
      now: new Date(),
    }),
  } : {};
  return { ...base, ...extras };
}

module.exports = {
  peekZigPainel,
  warmZigPainel,
  resetZigPainel,
  buscarZigPainel,
  painelDeMapa,
  compactHorario,
  compactRanking,
};
