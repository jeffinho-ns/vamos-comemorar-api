'use strict';

const { readAction } = require('./appsScriptClient');
const snapshotStore = require('./snapshotStore');
const { emitBiLiveChanged } = require('../../utils/biLiveRealtime');

const SOURCE = 'envio_marketing';
const CAMPOS = ['mkTraffic', 'mkAttractions', 'mkOther', 'mkReservations', 'mkPeople', 'mkShow', 'mkTicket', 'mkWalkins'];

function texto(valor, limite) {
  const limpo = String(valor || '').replace(/\s+/g, ' ').trim();
  if (!limpo) return '';
  return limpo.slice(0, limite);
}

function numeroBr(valor) {
  if (typeof valor === 'number' && Number.isFinite(valor)) return valor;
  const bruto = String(valor ?? '').trim();
  if (!bruto) return null;
  let normal = bruto;
  if (bruto.includes(',')) normal = bruto.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(bruto)) normal = bruto.replace(/\./g, '');
  const n = Number(normal.replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : null;
}

function hojeIso(agora) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(agora || new Date());
}

function validarEnvioMarketing(entrada, agora) {
  const fonte = entrada || {};
  const data = String(fonte.date || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return { erro: 'data_invalida' };
  if (data > hojeIso(agora)) return { erro: 'data_futura' };
  const nome = texto(fonte.submittedByName, 80);
  if (nome.length < 2) return { erro: 'nome_obrigatorio' };
  const values = {};
  CAMPOS.forEach((campo) => {
    values[campo] = numeroBr(fonte[campo]);
  });
  if (CAMPOS.some((campo) => values[campo] == null || values[campo] < 0 || values[campo] > 1000000000)) {
    return { erro: 'valores_invalidos' };
  }
  if (CAMPOS.every((campo) => values[campo] === 0)) return { erro: 'registro_em_branco' };
  const clientes = values.mkShow + values.mkWalkins;
  values.mkRevenue = clientes * values.mkTicket;
  values.mkReservas = values.mkReservations;
  values.mkAttendance = values.mkShow;
  return {
    doc: {
      date: data,
      values,
      notes: { mkNote: texto(fonte.mkNote, 2000) },
      submittedByName: nome,
    },
  };
}

function linhaMarketing(doc) {
  const values = doc && doc.values ? doc.values : {};
  return {
    date: doc.date,
    ...values,
    mkNote: doc.notes && doc.notes.mkNote ? doc.notes.mkNote : '',
    submittedByName: doc.submittedByName || '',
    submittedAt: doc.submittedAt || '',
  };
}

function juntarMarketing(planilha, locais) {
  const mapa = new Map();
  (planilha || []).forEach((linha) => {
    if (linha && linha.date) mapa.set(String(linha.date).slice(0, 10), linha);
  });
  (locais || []).forEach((doc) => {
    if (!doc || !doc.date) return;
    const linha = linhaMarketing(doc);
    mapa.set(linha.date, { ...(mapa.get(linha.date) || {}), ...linha });
  });
  return [...mapa.values()].sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

function aplicarEnvioMarketing(payload, envio) {
  const docs = envio && Array.isArray(envio.docs) ? envio.docs : [];
  if (!docs.length || !payload || typeof payload !== 'object') return payload;
  const lancamentos = { ...(payload.lancamentos || {}) };
  lancamentos.marketing = juntarMarketing(lancamentos.marketing, docs);
  return {
    ...payload,
    lancamentos,
    envioMarketing: docs[0] || null,
    projecao: undefined,
    quadros: undefined,
  };
}

async function gravarEnvioMarketing(pool, entrada, deps) {
  const options = deps || {};
  const validado = validarEnvioMarketing(entrada, options.agora ? options.agora() : new Date());
  if (validado.erro) return { ok: false, error: validado.erro };
  const store = options.store || snapshotStore;
  const last = await store.latestPayload(pool, SOURCE).catch(() => null);
  const anteriores = last && last.payload && Array.isArray(last.payload.docs) ? last.payload.docs : [];
  const agora = options.agora ? options.agora() : new Date();
  const doc = { ...validado.doc, submittedAt: agora.toISOString() };
  const docs = [
    doc,
    ...anteriores.filter((item) => !item || item.date !== doc.date),
  ].slice(0, 60);
  await store.saveSnapshot(pool, { source: SOURCE, action: 'submitEntry', payload: { docs } });
  let planilha = false;
  try {
    const enviar = options.readAction || readAction;
    await enviar('submitEntry', options.env || process.env, options.fetchImpl, {
      area: 'marketing',
      date: validado.doc.date,
      values: validado.doc.values,
      notes: validado.doc.notes,
      submittedByName: validado.doc.submittedByName,
    });
    planilha = true;
  } catch (err) {
    planilha = false;
  }
  if (options.emit !== false) emitBiLiveChanged('zig');
  return { ok: true, date: validado.doc.date, planilha, doc: validado.doc };
}

module.exports = {
  SOURCE,
  validarEnvioMarketing,
  aplicarEnvioMarketing,
  gravarEnvioMarketing,
};
