'use strict';

/**
 * Claims de tenant no JWT — aditivo; tokens antigos continuam válidos sem org.
 */

const { loadUserScope, isAdminRole } = require('./tenantScope');

async function fetchUserDbFlags(pool, userId) {
  try {
    const { rows } = await pool.query(
      `SELECT COALESCE(is_super_admin, FALSE) AS is_super_admin
         FROM users
        WHERE id = $1
        LIMIT 1`,
      [userId],
    );
    return rows[0] || { is_super_admin: false };
  } catch (_) {
    return { is_super_admin: false };
  }
}

/**
 * Monta payload do JWT com organization_id(s) e is_super_admin.
 *
 * @param {import('pg').Pool} pool
 * @param {{ id: number, email?: string, role?: string, is_super_admin?: boolean }} user
 * @param {Record<string, unknown>} [extra]
 */
async function buildTokenPayload(pool, user, extra = {}) {
  const flags =
    user.is_super_admin !== undefined
      ? { is_super_admin: user.is_super_admin === true }
      : await fetchUserDbFlags(pool, user.id);

  const scopeUser = {
    id: user.id,
    email: user.email,
    role: user.role,
    is_super_admin: flags.is_super_admin,
  };

  const scope = await loadUserScope(pool, scopeUser);
  const organization_ids = scope.organizationIds || [];
  const organization_id = organization_ids.length > 0 ? organization_ids[0] : null;

  return {
    id: user.id,
    email: user.email,
    role: user.role,
    is_super_admin: flags.is_super_admin,
    organization_id,
    organization_ids,
    ...extra,
  };
}

/**
 * Enriquece req.user após jwt.verify com campos ausentes em tokens legados.
 */
async function hydrateUserFromToken(pool, tokenUser) {
  if (!tokenUser || !tokenUser.id) return tokenUser;

  const needsFlags = tokenUser.is_super_admin === undefined;
  const needsScope =
    tokenUser.organization_id === undefined && tokenUser.organization_ids === undefined;

  if (!needsFlags && !needsScope) return tokenUser;

  const flags = needsFlags ? await fetchUserDbFlags(pool, tokenUser.id) : null;
  const scopeUser = {
    ...tokenUser,
    is_super_admin:
      tokenUser.is_super_admin ?? flags?.is_super_admin ?? false,
  };

  if (!needsScope) return scopeUser;

  const scope = await loadUserScope(pool, scopeUser);
  return {
    ...scopeUser,
    organization_id: scope.organizationIds[0] ?? null,
    organization_ids: scope.organizationIds,
  };
}

module.exports = {
  buildTokenPayload,
  hydrateUserFromToken,
  fetchUserDbFlags,
  isAdminRole,
};
