'use strict';

const express = require('express');
const { criarProxy } = require('../../services/biJustino/marketing/proxy');
const { canReadBiJustino } = require('../../services/biJustino/access');
const { podeAprovarBiJustino } = require('../../services/biJustino/sistema/aprovacao');
const { ROTAS } = require('../../services/biJustino/areas/reservas');

const ESTAB = 'Seu Justino';

/**
 * Rotas de escrita do BI Seu Justino — aba Reservas (lançamento + CRM Dionísio).
 * Montadas em /api/bi (autenticação já vem do router pai).
 */
module.exports = (pool, deps) => {
  const router = express.Router();
  const options = deps || {};
  const acesso = options.acesso || canReadBiJustino;
  const aprovar = options.aprovacao || podeAprovarBiJustino;

  ROTAS.forEach((rota) => {
    const handler = criarProxy(pool, rota, { ...options, acesso });
    if (!rota.aprovacao) {
      router.post(rota.caminho, handler);
      return;
    }
    router.post(rota.caminho, async (req, res) => {
      try {
        const allowed = await acesso(pool, req.user);
        if (!allowed) return res.status(403).json({ ok: false, error: 'acesso_negado' });
        const okDir = await aprovar(pool, req.user);
        if (!okDir) return res.status(403).json({ ok: false, error: 'somente_diretoria' });
        return handler(req, res);
      } catch (err) {
        console.error('[bi-justino] falha na aprovação', {
          establishment: ESTAB,
          action: rota.action,
          message: err && err.message ? err.message : String(err),
        });
        return res.status(500).json({ ok: false, error: 'falha_ao_gravar' });
      }
    });
  });

  return router;
};

module.exports.ROTAS = ROTAS;
