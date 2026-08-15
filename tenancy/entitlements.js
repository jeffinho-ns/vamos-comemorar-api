'use strict';

/**
 * Resolução de entitlements (módulos + permissões) de um usuário/organização.
 *
 * Isolamento de TENANT é obrigatório mesmo com SAAS_MODE off: uma empresa nova
 * nunca herda módulos/casas de outra. allowAll fica só para superadmin ou
 * operação legado sem organização.
 */

const { isSaasEnforced } = require('./featureFlags');
const { loadUserScope } = require('./tenantScope');
const { loadUepRbacPermissions } = require('./uepToRbacPermissions');

const ALLOW_ALL = Object.freeze({ allowAll: true, modules: ['*'], permissions: ['*'] });

function moduleKeyFromPermission(permissionKey) {
  const text = String(permissionKey || '');
  const idx = text.indexOf(':');
  return idx > 0 ? text.slice(0, idx) : text;
}

function restrictPermissionsToModules(permissions, modules) {
  if (!Array.isArray(modules) || modules.length === 0) return [];
  const allowed = new Set(modules);
  return [...new Set((permissions || []).filter((p) => allowed.has(moduleKeyFromPermission(p))))];
}

/**
 * Módulos ligados nas casas do escopo.
 * `null` = casas ainda sem contrato próprio (não restringe o da org).
 * `[]` = contrato existe, mas nenhum módulo está ligado.
 */
async function loadEstablishmentModuleKeys(pool, orgId, establishmentIds) {
  try {
    const ids = Array.isArray(establishmentIds)
      ? establishmentIds.map(Number).filter((n) => Number.isFinite(n) && n > 0)
      : [];
    const { rows } = await pool.query(
      `SELECT m.key, BOOL_OR(em.is_enabled) AS is_enabled
         FROM meu_backup_db.establishments e
         JOIN meu_backup_db.establishment_modules em
           ON em.establishment_id = e.id
         JOIN meu_backup_db.modules m ON m.id = em.module_id AND m.is_active = TRUE
        WHERE e.organization_id = $1
          AND (
            $2::int[] IS NULL OR cardinality($2::int[]) = 0
            OR e.legacy_place_id = ANY($2::int[])
            OR e.legacy_bar_id = ANY($2::int[])
          )
        GROUP BY m.key`,
      [orgId, ids.length ? ids : null],
    );
    if (!rows.length) return null;
    return rows.filter((r) => !!r.is_enabled).map((r) => r.key);
  } catch (_) {
    return null;
  }
}

/**
 * @returns {{ allowAll: boolean, modules: string[], permissions: string[], organizationId: number|null }}
 */
async function resolveEntitlements(pool, user) {
  if (user?.is_super_admin === true) return { ...ALLOW_ALL, organizationId: null };

  const scope = await loadUserScope(pool, user);
  const hasTenant =
    (Array.isArray(scope.organizationIds) && scope.organizationIds.length > 0) ||
    (Array.isArray(scope.establishmentIds) && scope.establishmentIds.length > 0);

  // Sem tenant: operação legado (Highline pré-segunda org) ou anônimo de token.
  if (!hasTenant) {
    if (!isSaasEnforced()) return { ...ALLOW_ALL, organizationId: null };
    return { allowAll: false, modules: [], permissions: [], organizationId: null };
  }

  const orgId = scope.organizationIds[0] || null;
  if (!orgId) {
    if (Array.isArray(scope.establishmentIds) && scope.establishmentIds.length > 0) {
      return {
        allowAll: false,
        modules: [],
        permissions: [],
        organizationId: null,
        establishmentIds: scope.establishmentIds || [],
        legacyScoped: true,
      };
    }
    return { allowAll: false, modules: [], permissions: [], organizationId: null };
  }

  try {
    const subRes = await pool.query(
      `SELECT status FROM meu_backup_db.subscriptions
        WHERE organization_id = $1 ORDER BY id DESC LIMIT 1`,
      [orgId],
    );
    const subStatus = subRes.rows[0]?.status;
    if (subStatus === 'past_due' || subStatus === 'canceled') {
      return {
        allowAll: false,
        modules: [],
        permissions: [],
        organizationId: orgId,
        billingBlocked: true,
        subscriptionStatus: subStatus,
      };
    }
  } catch (_) {
    /* fail-open em erro de billing */
  }

  // Módulos habilitados da organização (override > plano)
  let modules = [];
  try {
    const { rows } = await pool.query(
      `SELECT DISTINCT m.key
         FROM meu_backup_db.organization_modules om
         JOIN meu_backup_db.modules m ON m.id = om.module_id
        WHERE om.organization_id = $1 AND om.is_enabled = TRUE AND m.is_active = TRUE`,
      [orgId],
    );
    modules = rows.map((r) => r.key);
  } catch (_) {
    modules = [];
  }

  // Permissões via roles do usuário naquela organização
  let permissions = [];
  let isAccountAdmin = false;
  try {
    const { rows } = await pool.query(
      `SELECT DISTINCT p.key, r.key AS role_key
         FROM meu_backup_db.memberships mem
         JOIN meu_backup_db.roles r ON r.id = mem.role_id
         JOIN meu_backup_db.role_permissions rp ON rp.role_id = mem.role_id
         JOIN meu_backup_db.permissions p ON p.id = rp.permission_id
        WHERE mem.user_id = $1 AND mem.organization_id = $2 AND mem.is_active = TRUE`,
      [user.id, orgId],
    );
    permissions = [...new Set(rows.map((r) => r.key))];
    isAccountAdmin = rows.some((r) => r.role_key === 'account_admin');
  } catch (_) {
    permissions = [];
  }

  // Usuários legados (UEP sem memberships): módulos da org, sem permissões finas ainda.
  const legacyScoped =
    permissions.length === 0 &&
    Array.isArray(scope.establishmentIds) &&
    scope.establishmentIds.length > 0;

  const uepPermissions = await loadUepRbacPermissions(pool, user.id);
  if (uepPermissions.length > 0) {
    permissions = [...new Set([...permissions, ...uepPermissions])];
  }

  const establishmentModules = await loadEstablishmentModuleKeys(
    pool,
    orgId,
    scope.establishmentIds || [],
  );
  if (establishmentModules !== null) {
    const allowed = new Set(establishmentModules);
    modules = modules.filter((key) => allowed.has(key));
  }

  permissions = restrictPermissionsToModules(permissions, modules);

  return {
    allowAll: false,
    modules,
    permissions,
    organizationId: orgId,
    establishmentIds: scope.establishmentIds || [],
    legacyScoped,
    isAccountAdmin,
  };
}

function hasModule(entitlements, moduleKey) {
  if (!entitlements) return false;
  if (entitlements.allowAll) return true;
  return Array.isArray(entitlements.modules) && entitlements.modules.includes(moduleKey);
}

function hasPermission(entitlements, permissionKey) {
  if (!entitlements) return false;
  if (entitlements.allowAll) return true;
  const moduleKey = moduleKeyFromPermission(permissionKey);
  if (moduleKey && !hasModule(entitlements, moduleKey)) return false;
  if (entitlements.legacyScoped) return true;
  return Array.isArray(entitlements.permissions) && entitlements.permissions.includes(permissionKey);
}

module.exports = {
  resolveEntitlements,
  hasModule,
  hasPermission,
  ALLOW_ALL,
  restrictPermissionsToModules,
};
