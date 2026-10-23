'use strict';

const { missingCredentialNames, readAction } = require('./appsScriptClient');
const snapshotStore = require('./snapshotStore');

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

async function coletar(pool, env, ler, store) {
  const payload = await estourar(ler(ACTION, env), TIMEOUT_MS);
  const saved = await store.saveSnapshot(pool, {
    source: SOURCE,
    action: ACTION,
    payload,
  });
  return shapeZig(payload, saved && saved.captured_at);
}

async function loadZigOverview(pool, env, deps) {
  const options = deps || {};
  const ler = options.readAction || readAction;
  const store = options.store || snapshotStore;
  const agora = options.now ? options.now() : Date.now();
  const freshMs = options.freshMs || FRESH_MS;
  const sourceEnv = env || process.env;

  const last = await store.latestPayload(pool, SOURCE).catch(() => null);
  if (fresco(last, agora, freshMs)) {
    return shapeZig(last.payload, last.captured_at);
  }

  if (missingCredentialNames(sourceEnv).length) {
    if (last) return shapeZig(last.payload, last.captured_at);
    return ausente('credenciais_ausentes');
  }

  if (!emAndamento) {
    emAndamento = coletar(pool, sourceEnv, ler, store).finally(() => {
      emAndamento = null;
    });
  }

  try {
    return await emAndamento;
  } catch (err) {
    if (last) return shapeZig(last.payload, last.captured_at);
    return ausente(err && err.code ? err.code : 'falha_na_coleta');
  }
}

module.exports = {
  shapeZig,
  loadZigOverview,
};
