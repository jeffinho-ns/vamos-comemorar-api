'use strict';

const { canReadBiJustino } = require('../access');
const { gravarNaPlanilha } = require('../espelho/escrita');

/**
 * Monta um handler Express padrão de proxy de escrita para a planilha do Seu Justino:
 *  1. checa acesso ao BI (403 acesso_negado);
 *  2. valida a entrada com `validar(body)` → { erro } (400) ou { payload };
 *  3. grava via gravarNaPlanilha (502 se a planilha recusar) e recoleta as chaves afetadas;
 *  4. devolve { ok: true, ...extrair(resposta) }.
 *
 * `deps` permite injetar `acesso`, `gravar` e `env` nos testes.
 */
function criarProxy(pool, config, deps) {
  const options = deps || {};
  const acesso = options.acesso || canReadBiJustino;
  const gravar = options.gravar || gravarNaPlanilha;
  const env = options.env || process.env;
  const { action, validar, recoletar, extrair, nome } = config;
  const rotulo = nome || action;

  return async function handler(req, res) {
    try {
      const allowed = await acesso(pool, req.user);
      if (!allowed) return res.status(403).json({ ok: false, error: 'acesso_negado' });
      const validado = validar ? validar(req.body || {}) : { payload: {} };
      if (validado.erro) return res.status(400).json({ ok: false, error: validado.erro });
      const r = await gravar(pool, env, { action, payload: validado.payload, recoletar: recoletar || [] });
      if (!r.ok) return res.status(502).json({ ok: false, error: r.erro });
      const resposta = r.resposta || {};
      if (resposta.ok === false) {
        console.warn('[bi-justino] marketing: planilha recusou', { establishment: 'Seu Justino', action, erro: resposta.error || resposta.code });
        return res.status(409).json({ ok: false, error: String(resposta.error || resposta.code || 'recusado_pela_planilha') });
      }
      console.log(`[bi-justino] ${rotulo}`, { establishment: 'Seu Justino', action, user: req.user && req.user.id });
      return res.json({ ok: true, ...(extrair ? extrair(resposta) : {}) });
    } catch (err) {
      console.error(`[bi-justino] falha em ${rotulo}`, {
        establishment: 'Seu Justino',
        action,
        message: err && err.message ? err.message : String(err),
      });
      return res.status(500).json({ ok: false, error: 'falha_ao_gravar' });
    }
  };
}

module.exports = { criarProxy };
