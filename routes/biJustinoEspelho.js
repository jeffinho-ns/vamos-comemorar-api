'use strict';

const express = require('express');
const { requireSuperAdmin } = require('../middleware/requireSuperAdmin');
const { canReadBiJustino } = require('../services/biJustino/access');
const { lerEspelho, chavesSemCopia } = require('../services/biJustino/espelho/leitura');
const { coletarEspelho } = require('../services/biJustino/espelho/coletor');
const { listarLeituras } = require('../services/biJustino/espelho/catalogo');

const MAX_CHAVES = 40;

function chavesDaQuery(req) {
  const bruto = req.query && req.query.chaves;
  const texto = Array.isArray(bruto) ? bruto.join(',') : String(bruto || '');
  return texto.split(',').map((c) => c.trim()).filter(Boolean).slice(0, MAX_CHAVES);
}

/**
 * Rotas do espelho da planilha (montadas em /api/bi). O middleware de autenticação já vem do router pai.
 */
module.exports = (pool) => {
  const router = express.Router();

  // GET /api/bi/justino/planilha?chaves=getMkReunioes,getEntries:marketing
  router.get('/justino/planilha', async (req, res) => {
    try {
      const allowed = await canReadBiJustino(pool, req.user);
      if (!allowed) return res.status(403).json({ ok: false, error: 'acesso_negado' });
      const chaves = chavesDaQuery(req);
      if (!chaves.length) return res.status(400).json({ ok: false, error: 'chaves_ausentes' });
      const dados = await lerEspelho(pool, chaves);
      const faltando = chaves.filter((c) => !dados[c]);
      if (faltando.length) {
        coletarEspelho(pool, process.env, { chaves: faltando }).catch(() => null);
      }
      return res.json({ ok: true, dados, faltando });
    } catch (err) {
      console.error('[bi-justino] espelho: falha na leitura', {
        establishment: 'Seu Justino',
        message: err && err.message ? err.message : String(err),
      });
      return res.status(500).json({ ok: false, error: 'falha_na_leitura' });
    }
  });

  // GET /api/bi/justino/planilha/estado — catálogo e chaves ainda sem cópia (superadmin)
  router.get('/justino/planilha/estado', requireSuperAdmin, async (req, res) => {
    try {
      const faltando = await chavesSemCopia(pool);
      return res.json({ ok: true, total: listarLeituras().length, faltando });
    } catch (err) {
      return res.status(500).json({ ok: false, error: 'falha_no_estado' });
    }
  });

  // POST /api/bi/justino/planilha/coletar { modo?: 'completo'|'rapido'|'lento', chaves?: [] } (superadmin)
  router.post('/justino/planilha/coletar', requireSuperAdmin, async (req, res) => {
    try {
      const modo = req.body && ['completo', 'rapido', 'lento'].includes(req.body.modo) ? req.body.modo : 'completo';
      const chaves = req.body && Array.isArray(req.body.chaves) ? req.body.chaves.slice(0, MAX_CHAVES) : undefined;
      const saida = await coletarEspelho(pool, process.env, { modo, chaves });
      return res.json({ ok: true, ...saida });
    } catch (err) {
      console.error('[bi-justino] espelho: falha na coleta manual', {
        establishment: 'Seu Justino',
        message: err && err.message ? err.message : String(err),
      });
      return res.status(500).json({ ok: false, error: 'falha_na_coleta' });
    }
  });

  return router;
};
