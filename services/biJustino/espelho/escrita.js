'use strict';

const { readAction } = require('../appsScriptClient');
const { coletarEspelho } = require('./coletor');

const ACAO_VALIDA = /^[A-Za-z][A-Za-z0-9]+$/;
const BLOQUEADAS = new Set(['login', 'bootstrap', 'getEdgePass', 'requestPasswordReset', 'confirmPasswordReset', 'deleteUser', 'addAccount', 'changeMyPassword', 'setUserAreas']);

/**
 * Escreve na planilha (ação de gravação do Apps Script) e, se der certo, recoleta as chaves afetadas
 * para o espelho no banco. É o caminho padrão dos proxies de escrita por área.
 *
 * @param {object} pool
 * @param {object} env
 * @param {{ action: string, payload?: object, recoletar?: string[] }} entrada
 * @param {{ readAction?, coletar?, emit?: boolean }} deps
 * @returns {Promise<{ ok: true, resposta: object } | { ok: false, erro: string }>}
 */
async function gravarNaPlanilha(pool, env, entrada, deps) {
  const options = deps || {};
  const action = String((entrada && entrada.action) || '');
  if (!ACAO_VALIDA.test(action) || BLOQUEADAS.has(action) || /^get/.test(action)) {
    return { ok: false, erro: 'acao_invalida' };
  }
  const chamar = options.readAction || readAction;
  const coletar = options.coletar || coletarEspelho;
  try {
    const resposta = await chamar(action, env, options.fetchImpl, entrada.payload || {});
    const chaves = Array.isArray(entrada.recoletar) ? entrada.recoletar : [];
    if (chaves.length) {
      coletar(pool, env, { chaves, emit: options.emit }).catch((err) => {
        console.warn('[bi-justino] espelho: recoleta após escrita falhou', {
          establishment: 'Seu Justino', action, code: err && err.code,
        });
      });
    }
    return { ok: true, resposta };
  } catch (err) {
    const erro = err && err.code ? String(err.code) : 'planilha_indisponivel';
    console.error('[bi-justino] espelho: escrita na planilha falhou', { establishment: 'Seu Justino', action, erro });
    return { ok: false, erro };
  }
}

module.exports = {
  gravarNaPlanilha,
  BLOQUEADAS,
};
