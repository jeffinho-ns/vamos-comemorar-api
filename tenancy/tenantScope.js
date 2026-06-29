'use strict';

/**
 * Resolução de escopo de tenant (organização + estabelecimentos do usuário).
 *
 * Generaliza o padrão já maduro de `routes/whatsappAdmin.js`
 * (`loadUserScope` / `canAccessEstablishment`) e de
 * `middleware/logAccessHelpers.js`, num único módulo reutilizável.
 *
 * NÃO é plugado em nenhuma rota ainda. É a base do `tenantMiddleware`.
 */

const isAdminRole = (user) => {
  const role = String(user && user.role ? user.role : '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  return role === 'admin' || role === 'administrador' || user?.is_super_admin === true;
};

/**
 * Carrega o escopo do usuário usando as tabelas NOVAS (memberships) quando
 * existirem, com fallback para a tabela legada user_establishment_permissions.
 * Tolerante a schema incompleto (staging): qualquer erro => escopo vazio.
 *
 * @returns {{ isAdmin: boolean, organizationIds: number[], establishmentIds: number[] }}
 */
async function loadUserScope(pool, user) {
  if (!user || !user.id) {
    return { isAdmin: false, organizationIds: [], establishmentIds: [] };
  }
  if (isAdminRole(user)) {
    return { isAdmin: true, organizationIds: [], establishmentIds: [] };
  }

  // 1) Tenta o modelo novo (memberships)
  try {
    const { rows } = await pool.query(
      `SELECT DISTINCT m.organization_id, m.establishment_id
         FROM meu_backup_db.memberships m
        WHERE m.user_id = $1 AND m.is_active = TRUE`,
      [user.id],
    );
    if (rows.length > 0) {
      const organizationIds = [...new Set(rows.map((r) => Number(r.organization_id)).filter(Boolean))];
      const establishmentIds = [...new Set(rows.map((r) => Number(r.establishment_id)).filter(Boolean))];
      return { isAdmin: false, organizationIds, establishmentIds };
    }
  } catch (_) {
    // tabela memberships ainda não existe — segue para o legado
  }

  // 2) Fallback legado: user_establishment_permissions
  try {
    const { rows } = await pool.query(
      `SELECT DISTINCT establishment_id
         FROM user_establishment_permissions
        WHERE user_id = $1 AND is_active = TRUE`,
      [user.id],
    );
    const establishmentIds = [...new Set(rows.map((r) => Number(r.establishment_id)).filter(Boolean))];
    return { isAdmin: false, organizationIds: [], establishmentIds };
  } catch (_) {
    return { isAdmin: false, organizationIds: [], establishmentIds: [] };
  }
}

function canAccessEstablishment(scope, establishmentId) {
  if (!scope) return false;
  if (scope.isAdmin) return true;
  const id = Number(establishmentId);
  if (!Number.isFinite(id) || id <= 0) return false;
  return scope.establishmentIds.includes(id);
}

module.exports = { isAdminRole, loadUserScope, canAccessEstablishment };
