const express = require('express');
const auth = require('../middleware/auth');
const authorize = require('../middleware/authorize');
const { anonymizeSubjectData } = require('../services/privacy/lgpdAnonymizationService');

module.exports = (pool) => {
  const router = express.Router();
  const adminRoles = ['admin', 'administrador'];

  router.post('/subject-erasure', auth, authorize(...adminRoles), async (req, res) => {
    const waId = String(req.body?.wa_id || req.body?.waId || '').trim();
    if (!waId) {
      return res.status(400).json({
        success: false,
        message: 'wa_id é obrigatório.',
      });
    }

    try {
      const result = await anonymizeSubjectData(pool, waId);
      if (!result.ok) {
        return res.status(400).json({ success: false, ...result });
      }

      return res.json({
        success: true,
        message: 'Dados identificáveis anonimizados com sucesso.',
        data: {
          anonymizedWaId: result.anonymizedWaId,
          conversationId: result.conversationId,
          tablesTouched: result.tablesTouched,
        },
      });
    } catch (error) {
      console.error('[privacy/lgpd] subject-erasure:', error.message);
      return res.status(500).json({
        success: false,
        message: 'Falha ao processar exclusão/anonimização LGPD.',
      });
    }
  });

  return router;
};
