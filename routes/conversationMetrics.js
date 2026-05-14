const express = require('express');
const auth = require('../middleware/auth');
const authorize = require('../middleware/authorize');
const metrics = require('../services/metrics/conversationMetricsService');

module.exports = (pool) => {
  const router = express.Router();
  const allowedRoles = ['admin', 'gerente', 'hostess', 'promoter', 'recepção', 'recepcao', 'atendente'];

  function parseFilters(req) {
    return {
      from: req.query.from || null,
      to: req.query.to || null,
      establishmentId: req.query.establishment_id || req.query.establishmentId || null,
    };
  }

  router.get('/overview', auth, authorize(...allowedRoles), async (req, res) => {
    try {
      const data = await metrics.getOverview(pool, parseFilters(req));
      return res.json({ success: true, data });
    } catch (error) {
      console.error('[conversation-metrics] overview:', error.message);
      return res.status(500).json({ success: false, message: 'Falha ao carregar overview do funil.' });
    }
  });

  router.get('/funnel', auth, authorize(...allowedRoles), async (req, res) => {
    try {
      const data = await metrics.getFunnelSummary(pool, parseFilters(req));
      return res.json({ success: true, data });
    } catch (error) {
      console.error('[conversation-metrics] funnel:', error.message);
      return res.status(500).json({ success: false, message: 'Falha ao carregar funil.' });
    }
  });

  router.get('/dropoff', auth, authorize(...allowedRoles), async (req, res) => {
    try {
      const data = await metrics.getDropoffByStep(pool, parseFilters(req));
      return res.json({ success: true, data });
    } catch (error) {
      console.error('[conversation-metrics] dropoff:', error.message);
      return res.status(500).json({ success: false, message: 'Falha ao carregar desistências.' });
    }
  });

  router.get('/handoff', auth, authorize(...allowedRoles), async (req, res) => {
    try {
      const data = await metrics.getHandoffMetrics(pool, parseFilters(req));
      return res.json({ success: true, data });
    } catch (error) {
      console.error('[conversation-metrics] handoff:', error.message);
      return res.status(500).json({ success: false, message: 'Falha ao carregar handoff.' });
    }
  });

  router.get('/loops', auth, authorize(...allowedRoles), async (req, res) => {
    try {
      const data = await metrics.getBotLoopMetrics(pool, parseFilters(req));
      return res.json({ success: true, data });
    } catch (error) {
      console.error('[conversation-metrics] loops:', error.message);
      return res.status(500).json({ success: false, message: 'Falha ao carregar loops do bot.' });
    }
  });

  return router;
};
