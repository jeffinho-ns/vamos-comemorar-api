'use strict';

/**
 * requireModule('reservas') — enforcement de RECEITA (módulo contratado).
 *
 * FAIL-OPEN: com SAAS_MODE off/observe, libera (e em observe loga o que
 * bloquearia). Só barra de fato com SAAS_MODE on. NÃO está plugado ainda.
 *
 * Uso futuro (em cada router, após authenticateToken):
 *   router.use(requireModule('reservas'))
 */

const { isSaasEnforced, isSaasObserving } = require('./featureFlags');
const { resolveEntitlements, hasModule } = require('./entitlements');

function requireModule(moduleKey) {
  return async function moduleGate(req, res, next) {
    if (!isSaasEnforced() && !isSaasObserving()) return next();

    // Anônimo mantém política pública da rota (ex.: POST reserva sem token).
    if (!req.user) return next();

    const pool = req.app && req.app.get ? req.app.get('pool') : null;
    if (!pool) {
      if (!isSaasEnforced()) return next();
      return res.status(500).json({ success: false, error: 'Pool indisponível.' });
    }

    let entitlements = req.entitlements;
    try {
      if (!entitlements) {
        entitlements = await resolveEntitlements(pool, req.user);
        req.entitlements = entitlements;
      }
    } catch (err) {
      console.error('[requireModule] erro:', err.message);
      if (!isSaasEnforced()) return next();
      return res.status(500).json({ success: false, error: 'Falha ao validar módulo.' });
    }

    if (hasModule(entitlements, moduleKey)) return next();

    if (isSaasObserving()) {
      console.warn(
        `[module:observe] BLOQUEARIA modulo='${moduleKey}' user=${req.user.id} ` +
        `rota=${req.method} ${req.originalUrl}`,
      );
      return next();
    }
    return res.status(403).json({ success: false, error: `Módulo '${moduleKey}' não contratado.` });
  };
}

module.exports = requireModule;
