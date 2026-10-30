'use strict';

const express = require('express');
const { criarProxy } = require('../../services/biJustino/marketing/proxy');
const { canReadBiJustino } = require('../../services/biJustino/access');
const { podeAprovarBiJustino } = require('../../services/biJustino/sistema/aprovacao');
const { lerSobDemanda } = require('../../services/biJustino/sistema/sobDemanda');
const { ROTAS } = require('../../services/biJustino/areas/eventos');

const ESTAB = 'Seu Justino';

/**
 * Rotas de escrita do BI Seu Justino — aba Eventos (privados/corporativos + cotações).
 * Montadas em /api/bi (autenticação já vem do router pai).
 */
module.exports = (pool, deps) => {
  const router = express.Router();
  const options = deps || {};
  const acesso = options.acesso || canReadBiJustino;
  const aprovar = options.aprovacao || podeAprovarBiJustino;
  const ler = options.lerSobDemanda || lerSobDemanda;
  const env = options.env || process.env;

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

  router.get('/justino/eventos/interacoes/:id', async (req, res) => {
    try {
      const allowed = await acesso(pool, req.user);
      if (!allowed) return res.status(403).json({ ok: false, error: 'acesso_negado' });
      const forcar = String(req.query.forcar || '') === '1';
      const r = await ler(pool, env, {
        action: 'getEventoInteracoes',
        campoId: 'eventoId',
        id: req.params.id,
        forcar,
      });
      if (!r.ok) return res.status(r.erro === 'id_invalido' ? 400 : 502).json({ ok: false, error: r.erro });
      const itens = r.payload && Array.isArray(r.payload.items) ? r.payload.items : [];
      return res.json({ ok: true, items: itens, capturedAt: r.capturedAt, origem: r.origem, aviso: r.aviso });
    } catch (err) {
      console.error('[bi-justino] falha em getEventoInteracoes', {
        establishment: ESTAB,
        message: err && err.message ? err.message : String(err),
      });
      return res.status(500).json({ ok: false, error: 'falha_na_leitura' });
    }
  });

  return router;
};

module.exports.ROTAS = ROTAS;
