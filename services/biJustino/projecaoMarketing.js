'use strict';

const { readAction } = require('./appsScriptClient');
const snapshotStore = require('./snapshotStore');
const { emitBiLiveChanged } = require('../../utils/biLiveRealtime');

// Projeção de gastos do Marketing (aba MkPlans da planilha). O painel grava aqui e,
// na mesma hora, tenta levar pra planilha; se a planilha falhar, o número já fica
// no banco e a próxima coleta não o apaga (local vence por data).
const SOURCE = 'mk_plans';
const CAMPOS = ['trafficPlan', 'otherPlan', 'attractionsPlan', 'publicPlan', 'ticketPlan'];

function texto(valor, limite) {
  const limpo = String(valor || '').replace(/\s+/g, ' ').trim();
  return limpo ? limpo.slice(0, limite) : '';
}

function numeroBr(valor) {
  if (typeof valor === 'number' && Number.isFinite(valor)) return valor;
  const bruto = String(valor ?? '').trim();
  if (!bruto) return 0;
  let normal = bruto;
  if (bruto.includes(',')) normal = bruto.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(bruto)) normal = bruto.replace(/\./g, '');
  const n = Number(normal.replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : null;
}

function planoPublico(item) {
  if (!item || typeof item !== 'object') return null;
  const date = String(item.date || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const n = (chave) => {
    const valor = Number(item[chave]);
    return Number.isFinite(valor) ? valor : 0;
  };
  const publicPlan = n('publicPlan');
  const ticketPlan = n('ticketPlan');
  return {
    date,
    trafficPlan: n('trafficPlan'),
    otherPlan: n('otherPlan'),
    attractionsPlan: n('attractionsPlan'),
    publicPlan,
    ticketPlan,
    revenuePlan: item.revenuePlan != null && Number.isFinite(Number(item.revenuePlan)) ? Number(item.revenuePlan) : publicPlan * ticketPlan,
    note: texto(item.note, 500),
    updatedAt: texto(item.updatedAt, 40),
    updatedBy: texto(item.updatedBy, 80),
  };
}

function compactMkPlans(payload) {
  const docs = payload && Array.isArray(payload.docs) ? payload.docs : [];
  return docs.map(planoPublico).filter(Boolean).slice(0, 60);
}

function validarProjecao(entrada) {
  const fonte = entrada || {};
  const date = String(fonte.date || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { erro: 'data_invalida' };
  const valores = {};
  for (const campo of CAMPOS) {
    const n = numeroBr(fonte[campo]);
    if (n == null || n < 0 || n > 1000000000) return { erro: 'valores_invalidos' };
    valores[campo] = n;
  }
  if (CAMPOS.every((campo) => valores[campo] === 0)) return { erro: 'projecao_em_branco' };
  return {
    doc: {
      date,
      ...valores,
      revenuePlan: valores.publicPlan * valores.ticketPlan,
      note: texto(fonte.note, 500),
      updatedBy: texto(fonte.updatedBy, 80),
    },
  };
}

function juntarPlanos(planilha, locais, removidos) {
  const fora = new Set(Array.isArray(removidos) ? removidos : []);
  const mapa = new Map();
  (planilha || []).forEach((item) => {
    const plano = planoPublico(item);
    if (plano && !fora.has(plano.date)) mapa.set(plano.date, plano);
  });
  (locais || []).forEach((item) => {
    const plano = planoPublico(item);
    if (plano && !fora.has(plano.date)) mapa.set(plano.date, plano);
  });
  return [...mapa.values()].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 60);
}

function aplicarProjecaoMarketing(payload, snapshot) {
  if (!payload || typeof payload !== 'object') return payload;
  const docs = snapshot && Array.isArray(snapshot.docs) ? snapshot.docs : [];
  const removidos = snapshot && Array.isArray(snapshot.removidos) ? snapshot.removidos : [];
  if (!docs.length && !removidos.length) return payload;
  return { ...payload, mkPlans: juntarPlanos(payload.mkPlans, docs, removidos) };
}

async function estadoLocal(pool, store) {
  const last = await store.latestPayload(pool, SOURCE).catch(() => null);
  const payload = last && last.payload ? last.payload : {};
  return {
    docs: Array.isArray(payload.docs) ? payload.docs : [],
    removidos: Array.isArray(payload.removidos) ? payload.removidos : [],
  };
}

async function gravarProjecaoMarketing(pool, entrada, deps) {
  const options = deps || {};
  const validado = validarProjecao(entrada);
  if (validado.erro) return { ok: false, error: validado.erro };
  const store = options.store || snapshotStore;
  const agora = options.agora ? options.agora() : new Date();
  const doc = { ...validado.doc, updatedAt: agora.toISOString() };
  const atual = await estadoLocal(pool, store);
  const docs = [doc, ...atual.docs.filter((item) => item && item.date !== doc.date)].slice(0, 60);
  const removidos = atual.removidos.filter((date) => date !== doc.date);
  await store.saveSnapshot(pool, { source: SOURCE, action: 'submitMkPlan', payload: { docs, removidos } });
  let planilha = false;
  try {
    const enviar = options.readAction || readAction;
    await enviar('submitMkPlan', options.env || process.env, options.fetchImpl, { ...doc });
    planilha = true;
  } catch (err) {
    planilha = false;
  }
  if (options.emit !== false) emitBiLiveChanged('zig');
  return { ok: true, date: doc.date, planilha };
}

async function apagarProjecaoMarketing(pool, entrada, deps) {
  const options = deps || {};
  const date = String((entrada || {}).date || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, error: 'data_invalida' };
  const store = options.store || snapshotStore;
  const atual = await estadoLocal(pool, store);
  const docs = atual.docs.filter((item) => item && item.date !== date);
  const removidos = [...new Set([...atual.removidos, date])].slice(-120);
  await store.saveSnapshot(pool, { source: SOURCE, action: 'deleteMkPlan', payload: { docs, removidos } });
  let planilha = false;
  try {
    const enviar = options.readAction || readAction;
    await enviar('deleteMkPlan', options.env || process.env, options.fetchImpl, { date });
    planilha = true;
  } catch (err) {
    planilha = false;
  }
  if (options.emit !== false) emitBiLiveChanged('zig');
  return { ok: true, date, planilha };
}

module.exports = {
  SOURCE,
  compactMkPlans,
  validarProjecao,
  aplicarProjecaoMarketing,
  gravarProjecaoMarketing,
  apagarProjecaoMarketing,
};
