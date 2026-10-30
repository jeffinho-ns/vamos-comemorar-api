'use strict';

const { readAction } = require('../appsScriptClient');
const snapshotStore = require('../snapshotStore');

/**
 * PDFs guardados no Drive e servidos pelo Apps Script em pedaços (getManualPdfInfo/getManualPdfChunk,
 * getEventoPacotesPdfInfo/getEventoPacotesPdfChunk). Montamos o arquivo uma vez e guardamos no banco
 * (snapshot `planilha:<chave>`, payload { base64, totalBytes, updatedAt }). O snapshot só é refeito
 * quando updatedAt/totalBytes do Drive mudarem.
 */
const PDFS = {
  manual: { chave: 'getManualPdf', infoAction: 'getManualPdfInfo', chunkAction: 'getManualPdfChunk' },
  pacotes: { chave: 'getEventoPacotesPdf', infoAction: 'getEventoPacotesPdfInfo', chunkAction: 'getEventoPacotesPdfChunk' },
};
const TAMANHO_PEDACO = 3000000;
const LIMITE_BYTES = 60 * 1024 * 1024;

function fonteDe(chave) {
  return `planilha:${chave}`;
}

async function baixarPdf(info, def, env, chamar, fetchImpl) {
  const total = Number(info.totalBytes) || 0;
  const partes = [];
  let offset = 0;
  while (offset < total) {
    const length = Math.min(TAMANHO_PEDACO, total - offset);
    const r = await chamar(def.chunkAction, env, fetchImpl, { offset, length });
    if (!r || !r.base64) {
      const err = new Error('pedaco_invalido');
      err.code = 'pedaco_invalido';
      throw err;
    }
    partes.push(Buffer.from(r.base64, 'base64'));
    const lido = Number(r.length) || partes[partes.length - 1].length;
    if (lido <= 0) {
      const err = new Error('pedaco_vazio');
      err.code = 'pedaco_vazio';
      throw err;
    }
    offset += lido;
  }
  return Buffer.concat(partes);
}

/**
 * @param {'manual'|'pacotes'} qual
 * @returns {Promise<{ ok: true, bytes: Buffer, totalBytes: number, updatedAt: string, origem: 'banco'|'planilha' } | { ok: false, erro: string }>}
 */
async function obterPdf(pool, env, qual, deps) {
  const def = PDFS[qual];
  if (!def) return { ok: false, erro: 'pdf_desconhecido' };
  const options = deps || {};
  const store = options.store || snapshotStore;
  const chamar = options.readAction || readAction;
  const fonte = fonteDe(def.chave);
  const ultima = await store.latestPayload(pool, fonte).catch(() => null);
  let info;
  try {
    info = await chamar(def.infoAction, env, options.fetchImpl, {});
  } catch (err) {
    if (ultima && ultima.payload && ultima.payload.base64) {
      return { ok: true, bytes: Buffer.from(ultima.payload.base64, 'base64'), totalBytes: ultima.payload.totalBytes, updatedAt: ultima.payload.updatedAt, origem: 'banco' };
    }
    return { ok: false, erro: err && err.code ? String(err.code) : 'planilha_indisponivel' };
  }
  const totalBytes = Number(info.totalBytes) || 0;
  const updatedAt = String(info.updatedAt || '');
  const mesma = ultima && ultima.payload && ultima.payload.base64
    && ultima.payload.updatedAt === updatedAt && Number(ultima.payload.totalBytes) === totalBytes;
  if (mesma) {
    return { ok: true, bytes: Buffer.from(ultima.payload.base64, 'base64'), totalBytes, updatedAt, origem: 'banco' };
  }
  if (totalBytes <= 0) return { ok: false, erro: 'pdf_vazio' };
  if (totalBytes > LIMITE_BYTES) return { ok: false, erro: 'pdf_grande_demais' };
  try {
    const bytes = await baixarPdf(info, def, env, chamar, options.fetchImpl);
    await store.saveSnapshot(pool, { source: fonte, action: def.infoAction, payload: { base64: bytes.toString('base64'), totalBytes, updatedAt } });
    return { ok: true, bytes, totalBytes, updatedAt, origem: 'planilha' };
  } catch (err) {
    const erro = err && err.code ? String(err.code) : 'planilha_indisponivel';
    console.error('[bi-justino] montagem de PDF falhou', { establishment: 'Seu Justino', pdf: qual, erro });
    return { ok: false, erro };
  }
}

/** Só as informações (tamanho/atualização) e se já há cópia no banco. */
async function infoPdf(pool, env, qual, deps) {
  const def = PDFS[qual];
  if (!def) return { ok: false, erro: 'pdf_desconhecido' };
  const options = deps || {};
  const store = options.store || snapshotStore;
  const ultima = await store.latestPayload(pool, fonteDe(def.chave)).catch(() => null);
  const copia = ultima && ultima.payload && ultima.payload.base64
    ? { totalBytes: Number(ultima.payload.totalBytes) || 0, updatedAt: ultima.payload.updatedAt, capturedAt: ultima.captured_at }
    : null;
  try {
    const chamar = options.readAction || readAction;
    const info = await chamar(def.infoAction, env, options.fetchImpl, {});
    return { ok: true, totalBytes: Number(info.totalBytes) || 0, updatedAt: String(info.updatedAt || ''), copia };
  } catch (err) {
    if (copia) return { ok: true, totalBytes: copia.totalBytes, updatedAt: copia.updatedAt, copia, aviso: err && err.code ? String(err.code) : 'planilha_indisponivel' };
    return { ok: false, erro: err && err.code ? String(err.code) : 'planilha_indisponivel' };
  }
}

module.exports = {
  PDFS,
  TAMANHO_PEDACO,
  LIMITE_BYTES,
  obterPdf,
  infoPdf,
};
