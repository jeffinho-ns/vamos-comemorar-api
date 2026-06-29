'use strict';

/**
 * Router: GET /api/me/entitlements
 *
 * Retorna módulos + permissões + organização do usuário logado. É ADITIVO e
 * read-only. Com SAAS_MODE off retorna allowAll=true (o front trata como
 * "tudo liberado", mantendo a UI atual).
 *
 * NÃO está montado no server.js. Para ligar (quando quiser), seguindo o padrão
 * factory do projeto:
 *
 *   const meEntitlementsRouter = require('./tenancy/meEntitlementsRouter');
 *   app.use('/api/me', meEntitlementsRouter(pool));
 */

const express = require('express');
const authenticateToken = require('../middleware/auth');
const { resolveEntitlements } = require('./entitlements');

module.exports = (pool) => {
  const router = express.Router();

  router.get('/entitlements', authenticateToken, async (req, res) => {
    try {
      const entitlements = await resolveEntitlements(pool, req.user);
      return res.json({ success: true, data: entitlements });
    } catch (err) {
      console.error('[meEntitlements] erro:', err.message);
      // Fail-open: na dúvida não quebra a UI do cliente.
      return res.json({
        success: true,
        data: { allowAll: true, modules: ['*'], permissions: ['*'], organizationId: null },
      });
    }
  });

  return router;
};
