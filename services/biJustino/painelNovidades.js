'use strict';

const { missingCredentialNames, readActions } = require('./appsScriptClient');
const { avaliarConfig } = require('./notaAtendimento');
const snapshotStore = require('./snapshotStore');

const SOURCE = 'painel_novidades';
const FRESH_MS = 20 * 60 * 1000;
const TIMEOUT_MS = 40000;
let emAndamento = null;

function texto(valor, limite) {
  return String(valor || '').replace(/\s+/g, ' ').trim().slice(0, limite || 280);
}

function numero(valor) {
  const n = Number(valor);
  return Number.isFinite(n) ? n : null;
}

function resumirFood(payload) {
  const linhas = payload && Array.isArray(payload.rows) ? payload.rows : [];
  const atual = linhas[0];
  if (!atual || !atual.snap) return null;
  const snap = atual.snap;
  const vendidos = Array.isArray(snap.itens && snap.itens.vendidos) ? snap.itens.vendidos : [];
  return {
    capturedAt: atual.capturedAt || null,
    pedidos: numero(snap.pedidosConcluidos),
    renda: numero(snap.rendaVendas),
    ticket: numero(snap.ticketMedio),
    horas: numero(snap.horasConectadoDia),
    preparoMin: numero(snap.tempoPreparoMin),
    cancelamentosPct: numero(snap.cancelamentosLojaPct),
    vendidos: vendidos.filter((item) => item && item.volume > 0).slice(0, 8).map((item) => ({
      nome: texto(item.nome, 80),
      volume: numero(item.volume) || 0,
    })),
  };
}

function resumirDelivery(payload) {
  const linhas = payload && Array.isArray(payload.rows) ? payload.rows : [];
  const porPlataforma = {};
  linhas.forEach((linha) => {
    if (!Array.isArray(linha)) return;
    const nome = texto(linha[1], 40) || 'Outra';
    porPlataforma[nome] = (porPlataforma[nome] || 0) + (Number(linha[2]) || 0);
  });
  return Object.keys(porPlataforma).map((nome) => ({ plataforma: nome, valor: porPlataforma[nome] }));
}

function resumirAvaliacoes(payload) {
  if (!payload || !Array.isArray(payload.rows)) return null;
  const linhas = payload.rows;
  const total = linhas.length;
  const media = total ? linhas.reduce((soma, item) => soma + (Number(item.nota) || 0), 0) / total : null;
  const pendentes = linhas.filter((item) => item.status === 'novo' && !item.respondida).length;
  return {
    media,
    total,
    pendentes,
    itens: linhas.slice(0, 15).map((item) => ({
      nota: Number(item.nota) || 0,
      quando: texto(item.quando, 40),
      status: texto(item.status, 32),
      texto: texto(item.texto, 320),
      sugestao: texto(item.sugestao, 320),
    })),
  };
}

function resumirCrm(reservas, funil, config) {
  const cols = reservas && Array.isArray(reservas.cols) ? reservas.cols : [];
  const rows = reservas && Array.isArray(reservas.rows) ? reservas.rows : [];
  const statusIdx = cols.indexOf('status');
  const pessoasIdx = cols.indexOf('pessoas');
  const porStatus = {};
  rows.forEach((linha) => {
    if (!Array.isArray(linha)) return;
    const status = texto(linha[statusIdx], 40) || 'sem status';
    const atual = porStatus[status] || { status, reservas: 0, pessoas: 0 };
    atual.reservas += 1;
    atual.pessoas += Number(linha[pessoasIdx]) || 0;
    porStatus[status] = atual;
  });
  const funilLinhas = funil && Array.isArray(funil.rows) ? funil.rows : [];
  const ultimoFunil = funilLinhas[0] || null;
  const cfgs = config && Array.isArray(config.rows) ? config.rows : [];
  const ultima = cfgs[0] || null;
  const saude = ultima ? avaliarConfig(ultima.cfg, ultima.capturedAt) : null;
  return {
    reservas: Object.values(porStatus),
    funil: ultimoFunil ? {
      periodo: texto(ultimoFunil.periodo, 40),
      conversas: numero(ultimoFunil.conversas),
      reservas: numero(ultimoFunil.totalReservas),
      comparecimentoPct: numero(ultimoFunil.comparecimentoPct),
      porIAPct: numero(ultimoFunil.porIAPct),
    } : null,
    saude,
  };
}

function montar(partes) {
  const [food, delivery, avaliacoes, reservas, funil, config] = partes;
  return {
    disponivel: true,
    motivo: null,
    food: resumirFood(food),
    delivery: resumirDelivery(delivery),
    avaliacoes: resumirAvaliacoes(avaliacoes),
    crm: resumirCrm(reservas, funil, config),
  };
}

function estourar(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      const error = new Error('timeout');
      error.code = 'timeout';
      reject(error);
    }, ms);
    promise.then((valor) => { clearTimeout(timer); resolve(valor); }, (err) => { clearTimeout(timer); reject(err); });
  });
}

async function loadNovidades(pool, env, deps) {
  const options = deps || {};
  const ler = options.readActions || readActions;
  const store = options.store || snapshotStore;
  const agora = options.now ? options.now() : Date.now();
  const sourceEnv = env || process.env;
  const last = await store.latestPayload(pool, SOURCE).catch(() => null);
  const idade = last && last.captured_at ? agora - new Date(last.captured_at).getTime() : Infinity;
  if (last && last.payload && idade >= 0 && idade < (options.freshMs || FRESH_MS)) {
    return { ...last.payload, disponivel: true, motivo: null, capturedAt: last.captured_at };
  }
  if (missingCredentialNames(sourceEnv).length) {
    if (last && last.payload) return { ...last.payload, disponivel: true, motivo: null, capturedAt: last.captured_at };
    return { disponivel: false, motivo: 'credenciais_ausentes', capturedAt: null };
  }
  if (!emAndamento) {
    emAndamento = estourar(ler([
      { action: 'get99Food' },
      { action: 'getZigDelivery', payload: { days: 30 } },
      { action: 'getGoogleAvaliacoes' },
      { action: 'getCrmReservas' },
      { action: 'getCrmFunil' },
      { action: 'getCrmConfig' },
    ], sourceEnv, options.fetchImpl), TIMEOUT_MS).finally(() => { emAndamento = null; });
  }
  try {
    const lido = montar(await emAndamento);
    const saved = await store.saveSnapshot(pool, { source: SOURCE, action: 'novidades', payload: lido });
    return { ...lido, capturedAt: saved && saved.captured_at };
  } catch (err) {
    if (last && last.payload) return { ...last.payload, disponivel: true, motivo: null, capturedAt: last.captured_at };
    return { disponivel: false, motivo: err && err.code ? err.code : 'falha_na_coleta', capturedAt: null };
  }
}

module.exports = {
  montar,
  resumirFood,
  loadNovidades,
};
