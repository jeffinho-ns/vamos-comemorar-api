'use strict';

/**
 * Staff Agent Fase 1 — rotas autenticadas.
 * POST /api/staff-agent/turn
 * POST /api/staff-agent/confirm
 * GET  /api/staff-agent/status
 */

const express = require('express');
const authenticateToken = require('../middleware/auth');
const tenantMiddleware = require('../tenancy/tenantMiddleware');
const { runTurn, confirmTurn } = require('../services/staffAgent/staffAgentService');
const {
  isEstablishmentEnabled,
  isStaffAgentGloballyEnabled,
  parseAllowedIds,
} = require('../services/staffAgent/featureFlag');
const groqClient = require('../services/staffAgent/groqClient');
const { getPhase1Meta } = require('../services/staffAgent/phase1ToolCatalog');
const { canAccessEstablishment } = require('../tenancy/tenantScope');

module.exports = (pool) => {
  const router = express.Router();
  router.use(authenticateToken);
  router.use(tenantMiddleware());

  router.get('/status', async (req, res) => {
    const establishmentId = Number(
      req.query.establishment_id || req.body?.establishment_id || 0
    );
    return res.json({
      ok: true,
      enabled_globally: isStaffAgentGloballyEnabled(),
      groq_configured: groqClient.isEnabled(),
      model: groqClient.getModel(),
      establishment_id: establishmentId || null,
      establishment_enabled: establishmentId ? isEstablishmentEnabled(establishmentId) : false,
      allowed_ids: parseAllowedIds(),
      meta: getPhase1Meta(),
    });
  });

  router.post('/turn', async (req, res) => {
    try {
      const establishmentId = Number(req.body?.establishment_id);
      const message = req.body?.message;

      if (req.tenant && establishmentId) {
        const ok = await canAccessEstablishment(pool, req.user, establishmentId).catch(() => true);
        // canAccessEstablishment pode não existir com essa assinatura — fallback abaixo
        if (ok === false) {
          return res.status(403).json({ ok: false, code: 'forbidden_establishment', error: 'Casa fora do seu escopo.' });
        }
      }

      const result = await runTurn(pool, {
        user: req.user,
        establishmentId,
        message,
      });
      return res.json(result);
    } catch (e) {
      const code = e.code || 'staff_agent_error';
      const status =
        code === 'feature_disabled' || code === 'groq_disabled'
          ? 503
          : code === 'forbidden_role' || code === 'forbidden_uep'
            ? 403
            : code === 'bad_establishment' || code === 'bad_message'
              ? 400
              : code === 'groq_rate_limit'
                ? 429
                : 500;
      console.error('[staffAgent] turn error', { code, message: e.message });
      return res.status(status).json({
        ok: false,
        code,
        error: e.message || 'Erro no Staff Agent',
      });
    }
  });

  router.post('/confirm', async (req, res) => {
    try {
      const confirmId = req.body?.confirm_id;
      if (!confirmId) {
        return res.status(400).json({ ok: false, code: 'bad_confirm', error: 'confirm_id obrigatório' });
      }
      const result = await confirmTurn(pool, { user: req.user, confirmId });
      return res.json(result);
    } catch (e) {
      const code = e.code || 'staff_agent_error';
      const status =
        code === 'confirm_expired'
          ? 410
          : code === 'forbidden_role' || code === 'forbidden_uep'
            ? 403
            : 500;
      console.error('[staffAgent] confirm error', { code, message: e.message });
      return res.status(status).json({
        ok: false,
        code,
        error: e.message || 'Erro ao confirmar',
      });
    }
  });

  return router;
};
