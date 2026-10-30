'use strict';

const { readAction } = require('./appsScriptClient');
const snapshotStore = require('./snapshotStore');
const { emitBiLiveChanged } = require('../../utils/biLiveRealtime');

const SOURCE = 'envio_operacao';
const CAMPOS = ['opPublic', 'opLoss', 'opMaintenance', 'opDisposableReq'];

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

function validarEnvioOperacao(entrada, agora) {
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
  return {
    doc: {
      date: data,
      values,
      notes: {
        opIncidents: texto(fonte.opIncidents, 2000),
        opAction: texto(fonte.opAction, 2000),
      },
      submittedByName: nome,
    },
  };
}

function linhaOperacao(doc) {
  const values = doc && doc.values ? doc.values : {};
  const notes = doc && doc.notes ? doc.notes : {};
  return {
    date: doc.date,
    opPublic: values.opPublic,
    opLoss: values.opLoss,
    opMaintenance: values.opMaintenance,
    opDisposableReq: values.opDisposableReq,
    opIncidents: notes.opIncidents || '',
    opAction: notes.opAction || '',
  };
}

function juntarOperacao(planilha, locais) {
  const mapa = new Map();
  (planilha || []).forEach((linha) => {
    if (linha && linha.date) mapa.set(String(linha.date).slice(0, 10), linha);
  });
  (locais || []).forEach((doc) => {
    if (!doc || !doc.date) return;
    const linha = linhaOperacao(doc);
    mapa.set(linha.date, { ...(mapa.get(linha.date) || {}), ...linha });
  });
  return [...mapa.values()].sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

function aplicarEnvioOperacao(payload, envio) {
  const docs = envio && Array.isArray(envio.docs) ? envio.docs : [];
  if (!docs.length || !payload || typeof payload !== 'object') return payload;
  const lancamentos = { ...(payload.lancamentos || {}) };
  lancamentos.operacao = juntarOperacao(lancamentos.operacao, docs);
  return {
    ...payload,
    lancamentos,
    envioOperacao: docs[0] || null,
    projecao: undefined,
    quadros: undefined,
  };
}

async function gravarEnvioOperacao(pool, entrada, deps) {
  const options = deps || {};
  const validado = validarEnvioOperacao(entrada, options.agora ? options.agora() : new Date());
  if (validado.erro) return { ok: false, error: validado.erro };
  const store = options.store || snapshotStore;
  const last = await store.latestPayload(pool, SOURCE).catch(() => null);
  const anteriores = last && last.payload && Array.isArray(last.payload.docs) ? last.payload.docs : [];
  const docs = [
    validado.doc,
    ...anteriores.filter((doc) => !doc || doc.date !== validado.doc.date),
  ].slice(0, 60);
  await store.saveSnapshot(pool, { source: SOURCE, action: 'submitEntry', payload: { docs } });
  let planilha = false;
  try {
    const enviar = options.readAction || readAction;
    await enviar('submitEntry', options.env || process.env, options.fetchImpl, {
      area: 'operacao',
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
  validarEnvioOperacao,
  juntarOperacao,
  aplicarEnvioOperacao,
  gravarEnvioOperacao,
};
