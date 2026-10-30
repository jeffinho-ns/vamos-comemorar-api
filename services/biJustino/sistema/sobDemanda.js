'use strict';

const { readAction } = require('../appsScriptClient');
const snapshotStore = require('../snapshotStore');

const FRESCOR_MS = 5 * 60 * 1000;
const ACOES_PERMITIDAS = new Set(['getEventoInteracoes', 'getAuditoriaOpEvidencias']);
const RE_ID = /^[A-Za-z0-9_-]{1,80}$/;

function fonteDe(action, id) {
  return `planilha:${action}:${id}`;
}

function idadeMs(capturedAt, agora) {
  const t = capturedAt instanceof Date ? capturedAt.getTime() : Date.parse(String(capturedAt || ''));
  return Number.isFinite(t) ? agora - t : Infinity;
}

/**
 * Leituras que dependem de um id (ex.: interações de um evento). Não cabem no catálogo fixo:
 * lê do banco se a cópia tiver menos de 5 minutos; senão busca na planilha e grava um snapshot
 * `planilha:<action>:<id>`.
 *
 * @returns {Promise<{ ok: true, payload: object, capturedAt: string, origem: 'banco'|'planilha' } | { ok: false, erro: string, payload?: object }>}
 */
async function lerSobDemanda(pool, env, { action, campoId, id, forcar }, deps) {
  const options = deps || {};
  if (!ACOES_PERMITIDAS.has(action)) return { ok: false, erro: 'acao_invalida' };
  if (!RE_ID.test(String(id || ''))) return { ok: false, erro: 'id_invalido' };
  const store = options.store || snapshotStore;
  const agora = options.agora ? options.agora() : Date.now();
  const fonte = fonteDe(action, id);
  const ultima = await store.latestPayload(pool, fonte).catch(() => null);
  if (ultima && !forcar && idadeMs(ultima.captured_at, agora) < FRESCOR_MS) {
    return { ok: true, payload: ultima.payload, capturedAt: ultima.captured_at, origem: 'banco' };
  }
  try {
    const chamar = options.readAction || readAction;
    const payload = await chamar(action, env, options.fetchImpl, { [campoId]: id });
    const salvo = await store.saveSnapshot(pool, { source: fonte, action, payload });
    return { ok: true, payload, capturedAt: salvo && salvo.captured_at ? salvo.captured_at : new Date(agora).toISOString(), origem: 'planilha' };
  } catch (err) {
    const erro = err && err.code ? String(err.code) : 'planilha_indisponivel';
    console.error('[bi-justino] leitura sob demanda falhou', { establishment: 'Seu Justino', action, id, erro });
    if (ultima) return { ok: true, payload: ultima.payload, capturedAt: ultima.captured_at, origem: 'banco', aviso: erro };
    return { ok: false, erro };
  }
}

module.exports = {
  FRESCOR_MS,
  ACOES_PERMITIDAS,
  fonteDe,
  lerSobDemanda,
};
