'use strict';

/**
 * Exige Account Admin da organização (membership role account_admin) ou super admin.
 * Usado em /api/org/* — gestão de equipe tenant-scoped.
 */

const { isSaasEnforced, isSaasObserving } = require('./featureFlags');
const { loadUserScope } = require('./tenantScope');

function getPool(req) {
  return req.app && typeof req.app.get === 'function' ? req.app.get('pool') : null;
}

async function isAccountAdminForOrg(pool, userId, organizationId) {
  const { rows } = await pool.query(
    `SELECT 1
       FROM meu_backup_db.memberships m
       JOIN meu_backup_db.roles r ON r.id = m.role_id
      WHERE m.user_id = $1
        AND m.organization_id = $2
        AND m.is_active = TRUE
        AND r.key = 'account_admin'
      LIMIT 1`,
    [userId, organizationId],
  );
  return rows.length > 0;
}

function requireAccountAdmin() {
  return async function accountAdminGate(req, res, next) {
    if (!isSaasEnforced() && !isSaasObserving()) return next();
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Autenticação necessária.' });
    }
    if (req.user.is_super_admin === true) return next();

    const pool = getPool(req);
    if (!pool) {
      if (!isSaasEnforced()) return next();
      return res.status(500).json({ success: false, error: 'Pool indisponível.' });
    }

    let orgId = req.tenant?.primaryOrganizationId ?? null;
    if (!orgId) {
      try {
        const scope = await loadUserScope(pool, req.user);
        orgId = scope.organizationIds[0] ?? null;
      } catch (err) {
        console.error('[requireAccountAdmin]', err.message);
        if (!isSaasEnforced()) return next();
        return res.status(500).json({ success: false, error: 'Falha ao validar organização.' });
      }
    }

    if (!orgId) {
      if (isSaasObserving()) {
        console.warn(`[accountAdmin:observe] sem org user=${req.user.id} ${req.method} ${req.originalUrl}`);
        return next();
      }
      return res.status(403).json({ success: false, error: 'Organização não identificada.' });
    }

    req.orgAdminContext = { organizationId: orgId };

    const allowed = await isAccountAdminForOrg(pool, req.user.id, orgId);
    if (allowed) return next();

    if (isSaasObserving()) {
      console.warn(
        `[accountAdmin:observe] BLOQUEARIA user=${req.user.id} org=${orgId} ${req.method} ${req.originalUrl}`,
      );
      return next();
    }
    return res.status(403).json({ success: false, error: 'Apenas Account Admin pode gerenciar a equipe.' });
  };
}

module.exports = { requireAccountAdmin, isAccountAdminForOrg };
