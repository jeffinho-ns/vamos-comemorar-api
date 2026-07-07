'use strict';

/**
 * Monta contexto para queryWithRlsContext a partir do request autenticado.
 */
function rlsContextFromRequest(req, organizationId) {
  if (req.user?.is_super_admin === true) {
    return { isAdmin: true };
  }

  const fromArg = Number(organizationId);
  const fromTenant = Number(req.tenant?.primaryOrganizationId);
  const fromToken = Number(req.user?.organization_id);

  const org =
    (Number.isFinite(fromArg) && fromArg > 0 && fromArg) ||
    (Number.isFinite(fromTenant) && fromTenant > 0 && fromTenant) ||
    (Number.isFinite(fromToken) && fromToken > 0 && fromToken) ||
    null;

  if (org) return { organizationId: org };
  return null;
}

module.exports = { rlsContextFromRequest };
