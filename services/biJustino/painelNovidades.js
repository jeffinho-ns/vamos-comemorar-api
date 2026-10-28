'use strict';

const { missingCredentialNames, readActions } = require('./appsScriptClient');
const { avaliarConfig } = require('./notaAtendimento');
const { emitBiLiveChanged } = require('../../utils/biLiveRealtime');
const snapshotStore = require('./snapshotStore');

const SOURCE = 'painel_novidades';
const FRESH_MS = 20 * 60 * 1000;
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

function resumirInstagram(payload) {
  if (!payload || payload.ok === false) return null;
  const atual = payload.atual || {};
  const posts = Array.isArray(payload.posts) ? payload.posts : [];
  const seguidores = numero(atual.followers);
  const alcance30 = numero(atual.reach30);
  if (seguidores == null && alcance30 == null && !posts.length) return null;
  return {
    seguidores,
    alcance30,
    data: texto(atual.date, 20),
    posts: posts.length,
  };
}

function montar(partes) {
  const [food, delivery, avaliacoes, reservas, funil, config, instagram] = partes;
  return {
    disponivel: true,
    motivo: null,
    food: resumirFood(food),
    delivery: resumirDelivery(delivery),
    avaliacoes: resumirAvaliacoes(avaliacoes),
    instagram: resumirInstagram(instagram),
    crm: resumirCrm(reservas, funil, config),
  };
}

function exibir(last) {
  if (!last || !last.payload) return null;
  return { ...last.payload, disponivel: true, motivo: null, capturedAt: last.captured_at };
}

function ausente(motivo) {
  return { disponivel: false, motivo: motivo || 'falha_na_coleta', capturedAt: null };
}

function fresco(last, agora, freshMs) {
  if (!last || !last.captured_at || !last.payload) return false;
  const idade = agora - new Date(last.captured_at).getTime();
  return idade >= 0 && idade < freshMs;
}

async function loadNovidades(pool, env, deps) {
  const options = deps || {};
  const store = options.store || snapshotStore;
  const sourceEnv = env || process.env;
  const last = await store.latestPayload(pool, SOURCE).catch(() => null);
  const pronto = exibir(last);
  if (pronto) return pronto;
  if (missingCredentialNames(sourceEnv).length) return ausente('credenciais_ausentes');
  return ausente('aguardando_coleta');
}

async function collectNovidades(pool, env, deps) {
  const options = deps || {};
  const ler = options.readActions || readActions;
  const store = options.store || snapshotStore;
  const sourceEnv = env || process.env;
  const agora = options.now ? options.now() : Date.now();
  if (missingCredentialNames(sourceEnv).length) return null;

  const last = await store.latestPayload(pool, SOURCE).catch(() => null);
  if (fresco(last, agora, options.freshMs || FRESH_MS)) return exibir(last);
  if (emAndamento) {
    try { await emAndamento; } catch (err) { /* a outra coleta já registrou a falha */ }
    return exibir(await store.latestPayload(pool, SOURCE).catch(() => last));
  }

  emAndamento = (async () => {
    const partes = await ler([
      { action: 'get99Food' },
      { action: 'getZigDelivery', payload: { days: 30 } },
      { action: 'getGoogleAvaliacoes' },
      { action: 'getCrmReservas' },
      { action: 'getCrmFunil' },
      { action: 'getCrmConfig' },
      { action: 'getInstagram' },
    ], sourceEnv, options.fetchImpl, 18000);
    const lido = montar(partes);
    const temAlgo = lido.food || (lido.delivery && lido.delivery.length) || lido.avaliacoes || lido.instagram || (lido.crm && (lido.crm.funil || lido.crm.saude || (lido.crm.reservas && lido.crm.reservas.length)));
    if (!temAlgo) {
      const error = new Error('falha_na_coleta');
      error.code = 'falha_na_coleta';
      throw error;
    }
    const saved = await store.saveSnapshot(pool, { source: SOURCE, action: 'novidades', payload: lido });
    if (options.emit !== false) emitBiLiveChanged('novidades');
    return { ...lido, capturedAt: saved && saved.captured_at };
  })().finally(() => { emAndamento = null; });

  try {
    return await emAndamento;
  } catch (err) {
    const codigo = err && err.code ? err.code : 'falha_na_coleta';
    console.error('[bi-justino] falha ao gravar as fontes do painel no banco', { code: codigo });
    return exibir(last) || ausente(codigo);
  }
}

module.exports = {
  montar,
  resumirFood,
  loadNovidades,
  collectNovidades,
};
