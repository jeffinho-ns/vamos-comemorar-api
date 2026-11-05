'use strict';

/**
 * Router: GET /api/me/entitlements
 *
 * Retorna módulos + permissões + organização do usuário logado.
 * Tenant autenticado nunca recebe allowAll — isolamento entre empresas.
 */

const express = require('express');
const authenticateToken = require('../middleware/auth');
const { resolveEntitlements } = require('./entitlements');
const { listTrainingMaterialsForUser } = require('../billing/trainingService');

module.exports = (pool) => {
  const router = express.Router();

  router.get('/entitlements', authenticateToken, async (req, res) => {
    try {
      const entitlements = await resolveEntitlements(pool, req.user);
      return res.json({ success: true, data: entitlements });
    } catch (err) {
      console.error('[meEntitlements] erro:', err.message);
      if (req.user?.is_super_admin === true) {
        return res.json({
          success: true,
          data: { allowAll: true, modules: ['*'], permissions: ['*'], organizationId: null },
        });
      }
      // Não devolver um contrato vazio com HTTP 200: o painel escondia o menu inteiro
      // como se o usuário não tivesse permissão. 503 deixa o front tentar de novo.
      return res.status(503).json({
        success: false,
        error: 'entitlements_indisponiveis',
      });
    }
  });

  router.get('/training-materials', authenticateToken, async (req, res) => {
    try {
      const items = await listTrainingMaterialsForUser(pool, req.user);
      return res.json({ success: true, data: items });
    } catch (err) {
      console.error('[meTrainingMaterials] erro:', err.message);
      return res.json({ success: true, data: [] });
    }
  });

  return router;
};
