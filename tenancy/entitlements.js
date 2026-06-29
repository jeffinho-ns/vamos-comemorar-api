'use strict';

/**
 * Resolução de entitlements (módulos + permissões) de um usuário/organização.
 *
 * FAIL-OPEN: enquanto SAAS_MODE não for 'on', retorna allowAll=true (tudo
 * liberado), preservando o comportamento atual. Só consulta o banco e restringe
 * quando o enforcement estiver ligado.
 *
 * NÃO é plugado em nenhuma rota ainda.
 */

const { isSaasEnforced } = require('./featureFlags');
const { isAdminRole, loadUserScope } = require('./tenantScope');

const ALLOW_ALL = Object.freeze({ allowAll: true, modules: ['*'], permissions: ['*'] });

/**
 * @returns {{ allowAll: boolean, modules: string[], permissions: string[], organizationId: number|null }}
 */
async function resolveEntitlements(pool, user) {
  if (!isSaasEnforced()) return { ...ALLOW_ALL, organizationId: null };
  if (isAdminRole(user)) return { ...ALLOW_ALL, organizationId: null };

  const scope = await loadUserScope(pool, user);
  const orgId = scope.organizationIds[0] || null;
  if (!orgId) return { allowAll: false, modules: [], permissions: [], organizationId: null };

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
  try {
    const { rows } = await pool.query(
      `SELECT DISTINCT p.key
         FROM meu_backup_db.memberships mem
         JOIN meu_backup_db.role_permissions rp ON rp.role_id = mem.role_id
         JOIN meu_backup_db.permissions p ON p.id = rp.permission_id
        WHERE mem.user_id = $1 AND mem.organization_id = $2 AND mem.is_active = TRUE`,
      [user.id, orgId],
    );
    permissions = rows.map((r) => r.key);
  } catch (_) {
    permissions = [];
  }

  return { allowAll: false, modules, permissions, organizationId: orgId };
}

function hasModule(entitlements, moduleKey) {
  if (!entitlements) return false;
  if (entitlements.allowAll) return true;
  return entitlements.modules.includes(moduleKey);
}

function hasPermission(entitlements, permissionKey) {
  if (!entitlements) return false;
  if (entitlements.allowAll) return true;
  return entitlements.permissions.includes(permissionKey);
}

module.exports = { resolveEntitlements, hasModule, hasPermission, ALLOW_ALL };
