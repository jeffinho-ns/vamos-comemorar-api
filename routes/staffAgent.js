'use strict';

/**
 * Staff Agent Fase 1 — rotas autenticadas.
 *
 * ignoreQueryEstablishmentId: o /status precisa consultar várias casas no seletor
 * sem o tenantMiddleware bloquear (403) e poluir o log.
 * O escopo continua validado em /turn e /confirm.
 */

const express = require('express');
const authenticateToken = require('../middleware/auth');
const tenantMiddleware = require('../tenancy/tenantMiddleware');
const { runTurn, confirmTurn } = require('../services/staffAgent/staffAgentService');
const {
  isEstablishmentEnabled,
  isStaffAgentGloballyEnabled,
  isAllowAllMode,
  parseAllowedIds,
} = require('../services/staffAgent/featureFlag');
const groqClient = require('../services/staffAgent/groqClient');
const { getPhase1Meta } = require('../services/staffAgent/phase1ToolCatalog');
const { canAccessEstablishment } = require('../tenancy/tenantScope');

function mapErrorStatus(code) {
  if (code === 'feature_disabled' || code === 'groq_disabled') return 503;
  if (code === 'forbidden_role' || code === 'forbidden_uep' || code === 'forbidden_establishment') {
    return 403;
  }
  if (code === 'bad_establishment' || code === 'bad_message' || code === 'bad_confirm') return 400;
  if (code === 'groq_rate_limit') return 429;
  if (code === 'confirm_expired') return 410;
  return 500;
}

module.exports = (pool) => {
  const router = express.Router();
  router.use(authenticateToken);
  // Não bloquear por establishment_id na query (status do seletor).
  router.use(tenantMiddleware({ ignoreQueryEstablishmentId: true }));

  router.get('/status', async (req, res) => {
    try {
      const establishmentId = Number(
        req.query.establishment_id || req.body?.establishment_id || 0
      );
      return res.json({
        ok: true,
        enabled_globally: isStaffAgentGloballyEnabled(),
        groq_configured: groqClient.isEnabled(),
        model: groqClient.getModel(),
        establishment_id: establishmentId || null,
        establishment_enabled: establishmentId
          ? isEstablishmentEnabled(establishmentId)
          : false,
        allow_all: isAllowAllMode(),
        allowed_ids: parseAllowedIds(),
        // Ajuda a saber se o Render já pegou este código.
        code_rev: 'staff-agent-allow-all-v3',
        meta: getPhase1Meta(),
      });
    } catch (e) {
      console.error('[staffAgent] status error', e.message);
      return res.status(500).json({
        ok: false,
        code: 'status_error',
        error: 'Falha ao ler status do Staff Agent',
      });
    }
  });

  router.post('/turn', async (req, res) => {
    try {
      const establishmentId = Number(req.body?.establishment_id);
      const message = req.body?.message;

      if (req.tenant && establishmentId) {
        if (!canAccessEstablishment(req.tenant, establishmentId)) {
          return res.status(403).json({
            ok: false,
            code: 'forbidden_establishment',
            error: 'Casa fora do seu escopo.',
          });
        }
      }

      const result = await runTurn(pool, {
        user: req.user,
        establishmentId,
        message,
        pendingConfirmId: req.body?.confirm_id || null,
      });
      return res.json(result);
    } catch (e) {
      const code = e.code || 'staff_agent_error';
      console.error('[staffAgent] turn error', { code, message: e.message });
      return res.status(mapErrorStatus(code)).json({
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
        return res
          .status(400)
          .json({ ok: false, code: 'bad_confirm', error: 'confirm_id obrigatório' });
      }
      const result = await confirmTurn(pool, { user: req.user, confirmId });
      return res.json(result);
    } catch (e) {
      const code = e.code || 'staff_agent_error';
      console.error('[staffAgent] confirm error', { code, message: e.message });
      return res.status(mapErrorStatus(code)).json({
        ok: false,
        code,
        error: e.message || 'Erro ao confirmar',
      });
    }
  });

  return router;
};
