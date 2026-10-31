'use strict';

const { missingCredentialNames, readAction } = require('./appsScriptClient');
const { buscarZigPainel } = require('./zigPainel');
const { emitBiLiveChanged } = require('../../utils/biLiveRealtime');
const snapshotStore = require('./snapshotStore');
const { erroRecente } = require('./erroRecente');
const { projecaoConsolidada } = require('./projecaoConsolidada');
const { quadrosArea } = require('./quadrosArea');
const { SOURCE: ENVIO_OPERACAO, aplicarEnvioOperacao } = require('./envioOperacao');
const { SOURCE: ENVIO_MARKETING, aplicarEnvioMarketing } = require('./envioMarketing');
const { SOURCE: MK_PLANS, aplicarProjecaoMarketing, compactMkPlans } = require('./projecaoMarketing');
const { montarEscala } = require('./escalaJustino');

const erroZig = erroRecente();

const SOURCE = 'faturamento_zig';
const ACTION = 'getRevenueOverview';
const FRESH_MS = 10 * 60 * 1000;
const TIMEOUT_MS = 25000;

let emAndamento = null;

function numero(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function texto(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function shapeZig(payload, capturedAt) {
  const origem = payload && typeof payload === 'object' ? payload : {};
  return {
    disponivel: true,
    motivo: null,
    capturedAt: capturedAt || null,
    mes: texto(origem.monthKey),
    faturamentoMes: numero(origem.monthRevenue),
    zigMes: numero(origem.monthRevenueZig),
    eventosMes: numero(origem.monthRevenueEventos),
    projetadoMes: numero(origem.monthProjected),
    mediaMensal: numero(origem.yearAvgMonthly),
    mesmoMesAnoAnterior: numero(origem.lastYearSameMonth),
    semanaFaturado: numero(origem.weekActual),
    semanaProjetado: numero(origem.weekProjected),
    semanaAnoAnterior: numero(origem.weekActualLastYear),
    semanaInicio: texto(origem.weekStart),
    semanaFim: texto(origem.weekEnd),
    semanaAnterior: Boolean(origem.weekIsPrevious),
    ticketSemana: numero(origem.ticketSemana),
    ticketMes: numero(origem.ticketMes),
    ticketAno: numero(origem.ticketAno),
  };
}

function ausente(motivo) {
  return {
    disponivel: false,
    motivo: motivo || 'falha_na_coleta',
    capturedAt: null,
  };
}

function fresco(row, agora, freshMs) {
  if (!row || !row.captured_at) return false;
  const idade = agora - new Date(row.captured_at).getTime();
  return idade >= 0 && idade < freshMs;
}

function estourar(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      const error = new Error('timeout');
      error.code = 'timeout';
      reject(error);
    }, ms);
    promise.then((value) => {
      clearTimeout(timer);
      resolve(value);
    }, (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

function projecaoPublica(valor) {
  if (!valor || typeof valor !== 'object') return null;
  const envios = valor.envios && typeof valor.envios === 'object' ? valor.envios : {};
  const areas = Array.isArray(valor.areas) ? valor.areas.map((area) => ({
    chave: texto(area && area.chave),
    label: texto(area && area.label),
    meta: numero(area && area.meta),
    real: numero(area && area.real),
    economia: numero(area && area.economia),
    status: texto(area && area.status),
    nivel: texto(area && area.nivel),
    envio: texto(area && area.envio),
    usandoReferencia: Boolean(area && area.usandoReferencia),
    envioHoje: Boolean(area && area.envioHoje),
  })) : [];
  const alertas = Array.isArray(valor.alertas) ? valor.alertas.map((alerta) => ({
    nivel: texto(alerta && alerta.nivel),
    titulo: texto(alerta && alerta.titulo),
    valor: alerta && typeof alerta.valor === 'number' ? alerta.valor : texto(alerta && alerta.valor),
    detalhe: texto(alerta && alerta.detalhe),
    selo: texto(alerta && alerta.selo),
    tipo: texto(alerta && alerta.tipo),
  })) : [];
  return {
    faturamentoBruto: numero(valor.faturamentoBruto),
    cmvReal: numero(valor.cmvReal),
    controlaveis: numero(valor.controlaveis),
    estruturais: numero(valor.estruturais),
    margem: numero(valor.margem),
    economia: numero(valor.economia),
    bonusDestravado: numero(valor.bonusDestravado),
    envios: {
      financeiro: texto(envios.financeiro),
      marketing: texto(envios.marketing),
      rh: texto(envios.rh),
      operacao: texto(envios.operacao),
      cmv: texto(envios.cmv),
    },
    areas,
    alertas,
  };
}

function docsDeLancamento(linhas) {
  return {
    docs: (Array.isArray(linhas) ? linhas : []).map((linha) => ({
      date: linha && linha.date,
      values: linha || {},
    })),
  };
}

function projecaoDoPayload(payload) {
  const atual = projecaoPublica(payload && payload.projecao);
  if (atual && Array.isArray(atual.areas) && atual.areas.length) return atual;
  const lanc = payload && payload.lancamentos ? payload.lancamentos : {};
  return projecaoPublica(projecaoConsolidada({
    faturamento: payload && payload.monthRevenue != null ? payload.monthRevenue : (atual && atual.faturamentoBruto),
    financeiro: docsDeLancamento(lanc.financeiro),
    marketing: docsDeLancamento(lanc.marketing),
    rh: docsDeLancamento(lanc.rh),
    operacao: docsDeLancamento(lanc.operacao),
    cmv: docsDeLancamento(lanc.cmv),
  }));
}

function alertaPublico(alerta) {
  if (!alerta || typeof alerta !== 'object') return null;
  return {
    nivel: texto(alerta.nivel),
    titulo: texto(alerta.titulo),
    valor: typeof alerta.valor === 'number' ? alerta.valor : texto(alerta.valor),
    detalhe: texto(alerta.detalhe),
    selo: texto(alerta.selo),
    tipo: texto(alerta.tipo),
  };
}

function quadroPublico(quadro) {
  if (!quadro || typeof quadro !== 'object') return null;
  const kpis = {};
  Object.keys(quadro.kpis || {}).forEach((chave) => {
    const valor = quadro.kpis[chave];
    kpis[chave] = typeof valor === 'number' || valor == null ? valor : texto(valor);
  });
  return {
    kpis,
    alertas: Array.isArray(quadro.alertas) ? quadro.alertas.map(alertaPublico).filter(Boolean) : [],
    alertasComida: Array.isArray(quadro.alertasComida) ? quadro.alertasComida.map(alertaPublico).filter(Boolean) : [],
    alertasBebida: Array.isArray(quadro.alertasBebida) ? quadro.alertasBebida.map(alertaPublico).filter(Boolean) : [],
  };
}

function quadrosDoPayload(payload) {
  const bruto = (payload && payload.quadros && payload.quadros.marketing)
    ? payload.quadros
    : quadrosArea({
      faturamento: payload && payload.monthRevenue,
      servico: payload && payload.servicoMes,
      marketing: docsDeLancamento(payload && payload.lancamentos && payload.lancamentos.marketing),
      rh: docsDeLancamento(payload && payload.lancamentos && payload.lancamentos.rh),
      operacao: docsDeLancamento(payload && payload.lancamentos && payload.lancamentos.operacao),
      cmvZig: payload && payload.cmvZig,
    });
  return {
    marketing: quadroPublico(bruto.marketing),
    financeiro: quadroPublico(bruto.financeiro),
    rh: quadroPublico(bruto.rh),
    operacao: quadroPublico(bruto.operacao),
    cmv: quadroPublico(bruto.cmv),
  };
}

function envioPublico(doc) {
  if (!doc || typeof doc !== 'object') return null;
  const values = doc.values && typeof doc.values === 'object' ? doc.values : {};
  const notes = doc.notes && typeof doc.notes === 'object' ? doc.notes : {};
  return {
    date: texto(doc.date),
    submittedByName: texto(doc.submittedByName),
    opPublic: numero(values.opPublic),
    opLoss: numero(values.opLoss),
    opMaintenance: numero(values.opMaintenance),
    opDisposableReq: numero(values.opDisposableReq),
    opIncidents: texto(notes.opIncidents),
    opAction: texto(notes.opAction),
  };
}

function envioMarketingPublico(doc) {
  if (!doc || typeof doc !== 'object') return null;
  const values = doc.values && typeof doc.values === 'object' ? doc.values : {};
  const notes = doc.notes && typeof doc.notes === 'object' ? doc.notes : {};
  return {
    date: texto(doc.date),
    submittedByName: texto(doc.submittedByName),
    mkTraffic: numero(values.mkTraffic),
    mkAttractions: numero(values.mkAttractions),
    mkOther: numero(values.mkOther),
    mkReservations: numero(values.mkReservations),
    mkPeople: numero(values.mkPeople),
    mkShow: numero(values.mkShow),
    mkTicket: numero(values.mkTicket),
    mkWalkins: numero(values.mkWalkins),
    mkNote: texto(notes.mkNote),
  };
}

function horarioPublico(dia) {
  const item = dia && typeof dia === 'object' ? dia : {};
  return {
    trabalha: Boolean(item.trabalha),
    entrada: texto(item.entrada),
    saida: texto(item.saida),
    almoco: texto(item.almoco),
    jantar: texto(item.jantar),
  };
}

function colaboradorPublico(item) {
  if (!item || typeof item !== 'object') return null;
  const semana = Array.isArray(item.horarioSemanal) ? item.horarioSemanal.slice(0, 7).map(horarioPublico) : [];
  return {
    id: texto(item.id),
    nome: texto(item.nome),
    cargo: texto(item.cargo),
    cargoOutro: texto(item.cargoOutro),
    funcaoCargo: texto(item.funcaoCargo),
    nivel: texto(item.nivel),
    contratacao: texto(item.contratacao),
    horarioSemanal: semana,
    feriasInicio: texto(item.feriasInicio),
    feriasFim: texto(item.feriasFim),
  };
}

function displayFrom(row) {
  const payload = row && row.payload ? row.payload : {};
  return {
    ...shapeZig(payload, row && row.captured_at),
    serieMes: Array.isArray(payload.serieMes) ? payload.serieMes : [],
    serieAno: Array.isArray(payload.serieAno) ? payload.serieAno : [],
    custos: Array.isArray(payload.custos) ? payload.custos : [],
    horario: payload.horario || null,
    bilheteria: Array.isArray(payload.bilheteria) ? payload.bilheteria : [],
    servicoMes: numero(payload.servicoMes),
    ranking: payload.ranking || null,
    cmvZig: Array.isArray(payload.cmvZig) ? payload.cmvZig : [],
    projecao: projecaoDoPayload(payload),
    publicoMes: numero(payload.publicoMes) ?? (painelPublico(payload)),
    porDiaSemana: Array.isArray(payload.porDiaSemana) ? payload.porDiaSemana : [],
    semanas: Array.isArray(payload.semanas) ? payload.semanas : [],
    eventosResumo: payload.eventosResumo || null,
    lancamentos: payload.lancamentos || null,
    envioOperacao: envioPublico(payload.envioOperacao),
    envioMarketing: envioMarketingPublico(payload.envioMarketing),
    mkPlans: compactMkPlans({ docs: payload.mkPlans }),
    quadros: quadrosDoPayload(payload),
    freelancers: Array.isArray(payload.freelancers) ? payload.freelancers : [],
    sectorBase: payload.sectorBase || null,
    colaboradores: Array.isArray(payload.colaboradores) ? payload.colaboradores.map(colaboradorPublico).filter(Boolean) : [],
    calor: payload.calor || null,
    reservas: Array.isArray(payload.reservas) ? payload.reservas : [],
    reservaFator: Array.isArray(payload.reservaFator) ? payload.reservaFator : [],
    diasZig: Array.isArray(payload.diasZig) ? payload.diasZig : [],
    escala: montarEscala({
      porDiaSemana: payload.porDiaSemana,
      horario: payload.horario,
      semanas: payload.semanas,
      sectorBase: payload.sectorBase,
      hoje: payload.hoje,
    }),
    zigCarregando: false,
  };
}

function painelPublico(payload) {
  if (payload && payload.mes && typeof payload.mes === 'object') return numero(payload.mes.publico);
  return null;
}

function resumoDaColeta(painel) {
  if (!painel || !painel.mes) return null;
  const eventosMes = (painel.serieMes || []).reduce((total, ponto) => total + (Number(ponto.eventos) || 0), 0);
  return {
    monthKey: painel.mes.chave,
    monthRevenueZig: painel.mes.faturamento,
    monthRevenueEventos: eventosMes,
    monthRevenue: (Number(painel.mes.faturamento) || 0) + eventosMes,
    yearAvgMonthly: painel.mes.mediaMensal,
    lastYearSameMonth: painel.mes.mesmoMesAnoAnterior,
    weekActual: painel.semana && painel.semana.faturamento,
    weekActualLastYear: painel.semana && painel.semana.faturamentoAnoAnterior,
    weekStart: painel.semana && painel.semana.inicio,
    weekEnd: painel.semana && painel.semana.fim,
    weekIsPrevious: Boolean(painel.semana && painel.semana.anterior),
    ticketSemana: painel.tickets && painel.tickets.semana,
    ticketMes: painel.tickets && painel.tickets.mes,
    ticketAno: painel.tickets && painel.tickets.ano,
    publicoMes: painel.mes.publico,
    porDiaSemana: painel.porDiaSemana || [],
    semanas: painel.semanas || [],
  };
}

function copiaCompleta(row) {
  const payload = row && row.payload;
  return Boolean(payload && Array.isArray(payload.serieMes) && payload.serieMes.length);
}

async function loadZigOverview(pool, env, deps) {
  const options = deps || {};
  const store = options.store || snapshotStore;
  const sourceEnv = env || process.env;
  const last = await store.latestPayload(pool, SOURCE).catch(() => null);
  if (last) {
    const envio = await store.latestPayload(pool, ENVIO_OPERACAO).catch(() => null);
    const marketing = await store.latestPayload(pool, ENVIO_MARKETING).catch(() => null);
    const planos = await store.latestPayload(pool, MK_PLANS).catch(() => null);
    const payload = aplicarProjecaoMarketing(
      aplicarEnvioMarketing(
        aplicarEnvioOperacao(last.payload, envio && envio.payload),
        marketing && marketing.payload,
      ),
      planos && planos.payload,
    );
    const visivel = displayFrom({ ...last, payload });
    try {
      const { carregarUnidas } = require('./reservasUnidas');
      const unidas = await carregarUnidas(pool, { store });
      if (unidas.docs.length) {
        visivel.reservas = unidas.docs.map((doc) => ({ date: doc.date, pax: doc.pax }));
      }
    } catch (err) {
      console.warn('[bi-justino] reservas unidas no painel Zig indisponíveis', {
        establishment: 'Seu Justino',
        message: err && err.message ? err.message : String(err),
      });
    }
    return visivel;
  }
  if (missingCredentialNames(sourceEnv).length) return ausente('credenciais_ausentes');
  const recente = erroZig.ler();
  if (recente) return ausente(recente);
  return ausente('aguardando_coleta');
}

async function collectZigSnapshot(pool, env, deps) {
  const options = deps || {};
  const ler = options.readAction || readAction;
  const buscar = options.buscarZigPainel || buscarZigPainel;
  const store = options.store || snapshotStore;
  const sourceEnv = env || process.env;
  if (missingCredentialNames(sourceEnv).length) {
    const error = new Error('credenciais_ausentes');
    error.code = 'credenciais_ausentes';
    throw error;
  }

  let overview = null;
  let painel = null;
  let codigo = 'falha_na_coleta';
  try {
    overview = await estourar(ler(ACTION, sourceEnv), TIMEOUT_MS);
  } catch (error) {
    codigo = error && error.code ? error.code : codigo;
    overview = null;
  }
  const baseInicial = overview && typeof overview === 'object' ? overview : null;
  if (options.pularPainel) {
    if (!baseInicial) {
      const error = new Error(codigo);
      error.code = codigo;
      throw error;
    }
    const last = await store.latestPayload(pool, SOURCE).catch(() => null);
    const payload = { ...(last && last.payload ? last.payload : {}), ...baseInicial };
    const saved = await store.saveSnapshot(pool, { source: SOURCE, action: ACTION, payload });
    if (options.emit !== false) emitBiLiveChanged('zig');
    erroZig.limpar();
    return displayFrom({ payload, captured_at: saved && saved.captured_at });
  }
  if (baseInicial) {
    const previa = montarPayloadZig(baseInicial, null);
    await store.saveSnapshot(pool, { source: SOURCE, action: ACTION, payload: previa });
    if (options.emit !== false) emitBiLiveChanged('zig');
  }
  try {
    painel = await buscar(sourceEnv);
  } catch (error) {
    if (!baseInicial) codigo = error && error.code ? error.code : codigo;
    painel = null;
  }
  const base = baseInicial || resumoDaColeta(painel);
  if (!base && !painel) {
    const error = new Error(codigo);
    error.code = codigo;
    throw error;
  }

  const payload = montarPayloadZig(base, painel);
  const saved = await store.saveSnapshot(pool, {
    source: SOURCE,
    action: ACTION,
    payload,
  });
  if (options.emit !== false) emitBiLiveChanged('zig');
  erroZig.limpar();
  return displayFrom({ payload, captured_at: saved && saved.captured_at });
}

function montarPayloadZig(base, painel) {
  return {
    ...(base || {}),
    serieMes: painel && Array.isArray(painel.serieMes) ? painel.serieMes : [],
    serieAno: painel && Array.isArray(painel.serieAno) ? painel.serieAno : [],
    custos: painel && Array.isArray(painel.custos) ? painel.custos : [],
    horario: painel ? painel.horario : null,
    bilheteria: painel && Array.isArray(painel.bilheteria) ? painel.bilheteria : [],
    servicoMes: painel && painel.mes ? painel.mes.servico : null,
    ranking: painel ? painel.ranking : null,
    cmvZig: painel && Array.isArray(painel.cmv) ? painel.cmv : [],
    publicoMes: painel && painel.mes ? painel.mes.publico : (base && base.publicoMes) || null,
    porDiaSemana: painel && Array.isArray(painel.porDiaSemana) ? painel.porDiaSemana : (base && base.porDiaSemana) || [],
    semanas: painel && Array.isArray(painel.semanas) ? painel.semanas : (base && base.semanas) || [],
    eventosResumo: painel && painel.eventosResumo ? painel.eventosResumo : null,
    lancamentos: painel && painel.lancamentos ? painel.lancamentos : null,
    freelancers: painel && Array.isArray(painel.freelancers) && painel.freelancers.length ? painel.freelancers : (base && base.freelancers) || [],
    sectorBase: painel && painel.sectorBase ? painel.sectorBase : (base && base.sectorBase) || null,
    colaboradores: painel && Array.isArray(painel.colaboradores) && painel.colaboradores.length ? painel.colaboradores : (base && base.colaboradores) || [],
    calor: painel && painel.calor ? painel.calor : (base && base.calor) || null,
    reservas: painel && Array.isArray(painel.reservas) && painel.reservas.length ? painel.reservas : (base && base.reservas) || [],
    reservaFator: painel && Array.isArray(painel.reservaFator) && painel.reservaFator.length ? painel.reservaFator : (base && base.reservaFator) || [],
    diasZig: painel && Array.isArray(painel.diasZig) && painel.diasZig.length ? painel.diasZig : (base && base.diasZig) || [],
  };
}

function scheduleZigSync(pool, env, deps) {
  const sourceEnv = env || process.env;
  if (missingCredentialNames(sourceEnv).length) return null;
  if (emAndamento) return emAndamento;
  const options = deps || {};
  const store = options.store || snapshotStore;
  const agora = options.now ? options.now() : Date.now();
  const freshMs = options.freshMs || FRESH_MS;
  emAndamento = (async () => {
    try {
      const last = await store.latestPayload(pool, SOURCE).catch(() => null);
      if (copiaCompleta(last) && fresco(last, agora, freshMs)) return null;
      return await collectZigSnapshot(pool, sourceEnv, options);
    } catch (error) {
      const codigo = error && error.code ? error.code : 'falha_na_coleta';
      console.error('[bi-justino] falha ao gravar a Zig no banco', { code: codigo });
      erroZig.guardar(codigo);
      if (options.emit !== false) emitBiLiveChanged('zig');
      return ausente(codigo);
    }
  })().finally(() => {
    emAndamento = null;
  });
  return emAndamento;
}

function resetZigSync() {
  emAndamento = null;
}

module.exports = {
  shapeZig,
  loadZigOverview,
  collectZigSnapshot,
  scheduleZigSync,
  resetZigSync,
};
