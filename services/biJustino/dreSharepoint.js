'use strict';

const snapshotStore = require('./snapshotStore');
const { emitBiLiveChanged } = require('../../utils/biLiveRealtime');
const { missingCredentialNames, readAction } = require('./appsScriptClient');
const { numeroCelula, mesAlvo, mesesPresentes, colunaExcel, extrairDre } = require('./dreLeitura');

const SOURCE = 'dre_sharepoint';
const FRESH_MS = 30 * 60 * 1000;
const TIMEOUT_MS = 25000;
const ENV_NOMES = ['MS_TENANT_ID', 'MS_CLIENT_ID', 'MS_CLIENT_SECRET', 'MS_DRE_SHARE_URL', 'MS_DRE_CELL_MAP'];

let emAndamento = null;

function ausente(motivo) {
  return { disponivel: false, motivo: motivo || 'falha_na_coleta', capturedAt: null };
}

function preenchida(env, nome) {
  return Boolean(env && String(env[nome] || '').trim());
}

function faltando(env) {
  return ENV_NOMES.filter((nome) => !preenchida(env, nome));
}

function encodeShareId(url) {
  const b64 = Buffer.from(String(url), 'utf8').toString('base64').replace(/=+$/, '').replace(/\//g, '_').replace(/\+/g, '-');
  return `u!${b64}`;
}

function estourar(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      const error = new Error('timeout');
      error.code = 'timeout';
      reject(error);
    }, ms);
    promise.then((valor) => {
      clearTimeout(timer);
      resolve(valor);
    }, (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

function publico(extraido, capturedAt, mesKey) {
  return {
    disponivel: true,
    motivo: null,
    capturedAt: capturedAt || null,
    mes: extraido.mes,
    mesKey: mesKey || null,
    valores: extraido.valores,
    fallbacks: extraido.fallbacks,
    naoAchados: extraido.naoAchados,
  };
}

async function lerJson(resposta) {
  return resposta.json().catch(() => ({}));
}

async function tokenMicrosoft(env, fetchImpl) {
  const corpo = new URLSearchParams({
    client_id: String(env.MS_CLIENT_ID).trim(),
    client_secret: String(env.MS_CLIENT_SECRET),
    scope: 'https://graph.microsoft.com/.default',
    grant_type: 'client_credentials',
  });
  const resposta = await fetchImpl(`https://login.microsoftonline.com/${encodeURIComponent(String(env.MS_TENANT_ID).trim())}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: corpo.toString(),
  });
  const json = await lerJson(resposta);
  if (!resposta.ok || !json.access_token) {
    const error = new Error('login_recusado');
    error.code = 'login_recusado';
    throw error;
  }
  return json.access_token;
}

async function graphGet(url, token, fetchImpl) {
  const resposta = await fetchImpl(url, { headers: { Authorization: `Bearer ${token}` } });
  const json = await lerJson(resposta);
  if (!resposta.ok) {
    const error = new Error('leitura_recusada');
    error.code = resposta.status === 401 || resposta.status === 403 ? 'login_recusado' : 'leitura_recusada';
    throw error;
  }
  return json;
}

async function lerIntervalo(arquivo, planilha, endereco, token, fetchImpl) {
  const url = `https://graph.microsoft.com/v1.0/drives/${arquivo.driveId}/items/${arquivo.itemId}/workbook/worksheets('${encodeURIComponent(planilha)}')/range(address='${endereco}')?$select=values`;
  const json = await graphGet(url, token, fetchImpl);
  if (!json.values) {
    const error = new Error('leitura_recusada');
    error.code = 'leitura_recusada';
    throw error;
  }
  return json.values;
}

async function coletar(env, fetchImpl) {
  let mapa;
  try {
    mapa = JSON.parse(String(env.MS_DRE_CELL_MAP));
  } catch (err) {
    const error = new Error('mapa_invalido');
    error.code = 'mapa_invalido';
    throw error;
  }
  const planilha = mapa.sheet || 'DRE Acumulado';
  const headerRow = Number(mapa.headerRow) || 2;
  const labelColumn = mapa.labelColumn || 'B';
  const alvo = mesAlvo(new Date());
  const token = await tokenMicrosoft(env, fetchImpl);
  const shareId = encodeShareId(String(env.MS_DRE_SHARE_URL).trim());
  const arquivoJson = await graphGet(`https://graph.microsoft.com/v1.0/shares/${shareId}/driveItem?$select=id,parentReference,name`, token, fetchImpl);
  if (!arquivoJson.id || !arquivoJson.parentReference || !arquivoJson.parentReference.driveId) {
    const error = new Error('leitura_recusada');
    error.code = 'leitura_recusada';
    throw error;
  }
  const arquivo = { driveId: arquivoJson.parentReference.driveId, itemId: arquivoJson.id };
  const header = (await lerIntervalo(arquivo, planilha, `A${headerRow}:ZZ${headerRow}`, token, fetchImpl))[0] || [];
  const rotulosBrutos = await lerIntervalo(arquivo, planilha, `${labelColumn}1:${labelColumn}500`, token, fetchImpl);
  const rotulos = rotulosBrutos.map((linha) => String((linha && linha[0]) || ''));
  const colunas = {};
  for (const label of mesesPresentes(alvo.label, header)) {
    const indice = header.findIndex((celula) => String(celula || '').trim() === label);
    if (indice < 0) continue;
    const letra = colunaExcel(indice + 1);
    const valores = await lerIntervalo(arquivo, planilha, `${letra}1:${letra}500`, token, fetchImpl);
    colunas[label] = valores.map((linha) => numeroCelula(linha && linha[0]));
  }
  const extraido = extrairDre({
    mesLabel: alvo.label,
    rotulos,
    colunas,
    fields: mapa.fields || {},
  });
  return publico(extraido, null, alvo.key);
}

function numeroPlanilha(valor) {
  if (typeof valor === 'number' && Number.isFinite(valor)) return valor;
  if (typeof valor !== 'string' || !valor.trim()) return null;
  const limpo = valor.trim();
  const normal = limpo.includes(',') ? limpo.replace(/\./g, '').replace(',', '.') : limpo;
  const n = Number(normal);
  return Number.isFinite(n) ? n : null;
}

function formatoDreBase(data) {
  const valoresBrutos = data && data.values && typeof data.values === 'object' ? data.values : null;
  if (!valoresBrutos) return null;
  const meses = data.mesPorCampo && typeof data.mesPorCampo === 'object' ? data.mesPorCampo : {};
  const valores = {};
  Object.keys(valoresBrutos).forEach((campo) => {
    const n = numeroPlanilha(valoresBrutos[campo]);
    if (n != null) valores[campo] = n;
  });
  if (!Object.keys(valores).length) return null;
  const referencia = meses.revenue || meses.rent || null;
  const fallbacks = {};
  Object.keys(meses).forEach((campo) => {
    if (meses[campo] && meses[campo] !== referencia) fallbacks[campo] = meses[campo];
  });
  return {
    disponivel: true,
    motivo: null,
    mes: referencia,
    mesKey: null,
    valores,
    fallbacks,
    naoAchados: [],
  };
}

async function peloPainel(sourceEnv, options) {
  if (missingCredentialNames(sourceEnv).length) return null;
  const ler = options.readAction || readAction;
  const data = await estourar(ler('getDreBase', sourceEnv, options.fetchImpl), 20000);
  return formatoDreBase(data);
}

function exibir(last) {
  if (!last || !last.payload) return null;
  return { ...last.payload, disponivel: true, motivo: null, capturedAt: last.captured_at };
}

function fresco(last, agora, freshMs) {
  if (!last || !last.captured_at || !last.payload) return false;
  const idade = agora - new Date(last.captured_at).getTime();
  return idade >= 0 && idade < freshMs;
}

async function loadDre(pool, env, deps) {
  const options = deps || {};
  const store = options.store || snapshotStore;
  const sourceEnv = env || process.env;
  const last = await store.latestPayload(pool, SOURCE).catch(() => null);
  const pronto = exibir(last);
  if (pronto) return pronto;
  const temPainel = missingCredentialNames(sourceEnv).length === 0;
  const temMicrosoft = faltando(sourceEnv).length === 0;
  if (!temPainel && !temMicrosoft) return ausente('credenciais_ausentes');
  return ausente('aguardando_coleta');
}

async function collectDre(pool, env, deps) {
  const options = deps || {};
  const store = options.store || snapshotStore;
  const sourceEnv = env || process.env;
  const agora = options.now ? options.now() : Date.now();
  const freshMs = options.freshMs || FRESH_MS;
  const temPainel = missingCredentialNames(sourceEnv).length === 0;
  const temMicrosoft = faltando(sourceEnv).length === 0;
  if (!temPainel && !temMicrosoft) return null;

  const last = await store.latestPayload(pool, SOURCE).catch(() => null);
  if (fresco(last, agora, freshMs)) return exibir(last);
  if (emAndamento) {
    try { await emAndamento; } catch (err) { /* a outra coleta já registrou a falha */ }
    return exibir(await store.latestPayload(pool, SOURCE).catch(() => last));
  }

  const lerGraph = options.coletar || (() => coletar(sourceEnv, options.fetchImpl || fetch));
  emAndamento = (async () => {
    let lido = null;
    let codigo = 'falha_na_coleta';
    try {
      lido = await (options.lerPainel ? options.lerPainel() : peloPainel(sourceEnv, options));
    } catch (err) {
      codigo = err && err.code ? err.code : 'falha_na_coleta';
      console.error('[bi-justino] DRE da planilha do painel', { code: codigo });
    }
    if (!lido && !faltando(sourceEnv).length) {
      lido = await estourar(lerGraph(), TIMEOUT_MS);
    }
    if (!lido) {
      const error = new Error(codigo);
      error.code = codigo;
      throw error;
    }
    const saved = await store.saveSnapshot(pool, { source: SOURCE, action: 'getDreBase', payload: lido });
    if (options.emit !== false) emitBiLiveChanged('dre');
    return { ...lido, capturedAt: saved && saved.captured_at };
  })().finally(() => {
    emAndamento = null;
  });

  try {
    return await emAndamento;
  } catch (err) {
    const codigo = err && err.code ? err.code : 'falha_na_coleta';
    console.error('[bi-justino] falha ao gravar a DRE no banco', { code: codigo });
    return exibir(last) || ausente(codigo);
  }
}

module.exports = {
  loadDre,
  collectDre,
  formatoDreBase,
  faltando,
};
