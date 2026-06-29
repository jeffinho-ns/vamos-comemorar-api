'use strict';

/**
 * requirePermission('reservas:create') — enforcement de RBAC (papel do usuário).
 *
 * FAIL-OPEN igual aos demais: off/observe libera (observe loga); on barra.
 * Generaliza a intenção de middleware/checkEstablishmentPermission.js (que
 * existe mas não está plugado). NÃO está plugado ainda.
 */

const { isSaasEnforced, isSaasObserving } = require('./featureFlags');
const { resolveEntitlements, hasPermission } = require('./entitlements');

function requirePermission(permissionKey) {
  return async function permissionGate(req, res, next) {
    if (!isSaasEnforced() && !isSaasObserving()) return next();

    const pool = req.app && req.app.get ? req.app.get('pool') : null;
    if (!pool || !req.user) {
      if (!isSaasEnforced()) return next();
      return res.status(401).json({ success: false, error: 'Autenticação necessária.' });
    }

    let entitlements = req.entitlements;
    try {
      if (!entitlements) {
        entitlements = await resolveEntitlements(pool, req.user);
        req.entitlements = entitlements;
      }
    } catch (err) {
      console.error('[requirePermission] erro:', err.message);
      if (!isSaasEnforced()) return next();
      return res.status(500).json({ success: false, error: 'Falha ao validar permissão.' });
    }

    if (hasPermission(entitlements, permissionKey)) return next();

    if (isSaasObserving()) {
      console.warn(
        `[permission:observe] BLOQUEARIA perm='${permissionKey}' user=${req.user.id} ` +
        `rota=${req.method} ${req.originalUrl}`,
      );
      return next();
    }
    return res.status(403).json({ success: false, error: `Sem permissão: ${permissionKey}.` });
  };
}

module.exports = requirePermission;
