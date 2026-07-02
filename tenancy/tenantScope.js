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
 * memberships.establishment_id é CANÔNICO (establishments.id).
 * Rotas operacionais (restaurant_reservations, permissions legadas) usam id de place/bar.
 * Traduz para legacy_place_id (preferência) ou legacy_bar_id.
 */
function operationalEstablishmentIdFromRow(row) {
  const placeId = Number(row?.legacy_place_id);
  if (Number.isFinite(placeId) && placeId > 0) return placeId;
  const barId = Number(row?.legacy_bar_id);
  if (Number.isFinite(barId) && barId > 0) return barId;
  const canonical = Number(row?.establishment_id);
  if (Number.isFinite(canonical) && canonical > 0) return canonical;
  return null;
}

async function operationalIdsForOrganizations(pool, organizationIds) {
  if (!organizationIds.length) return [];
  const { rows } = await pool.query(
    `SELECT legacy_place_id, legacy_bar_id
       FROM meu_backup_db.establishments
      WHERE organization_id = ANY($1::int[])`,
    [organizationIds],
  );
  return [
    ...new Set(
      rows.map((r) => operationalEstablishmentIdFromRow(r)).filter((id) => id != null),
    ),
  ];
}

/**
 * Carrega o escopo do usuário usando as tabelas NOVAS (memberships) quando
 * existirem, com fallback para a tabela legada user_establishment_permissions.
 * Tolerante a schema incompleto (staging): qualquer erro => escopo vazio.
 *
 * establishmentIds retornados são sempre OPERACIONAIS (place/bar), compatíveis com
 * restaurant_reservations.establishment_id e user_establishment_permissions.
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
      `SELECT DISTINCT m.organization_id, m.establishment_id,
              e.legacy_place_id, e.legacy_bar_id
         FROM meu_backup_db.memberships m
         LEFT JOIN meu_backup_db.establishments e ON e.id = m.establishment_id
        WHERE m.user_id = $1 AND m.is_active = TRUE`,
      [user.id],
    );
    if (rows.length > 0) {
      const organizationIds = [...new Set(rows.map((r) => Number(r.organization_id)).filter(Boolean))];
      const establishmentIds = [];
      const orgWideMembership = rows.some((r) => r.establishment_id == null);

      for (const row of rows) {
        if (row.establishment_id != null) {
          const opId = operationalEstablishmentIdFromRow(row);
          if (opId) establishmentIds.push(opId);
        }
      }

      if (orgWideMembership) {
        const orgIds = await operationalIdsForOrganizations(pool, organizationIds);
        establishmentIds.push(...orgIds);
      }

      return {
        isAdmin: false,
        organizationIds,
        establishmentIds: [...new Set(establishmentIds)],
      };
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
    let organizationIds = [];
    if (establishmentIds.length > 0) {
      try {
        const orgResult = await pool.query(
          `SELECT DISTINCT organization_id
             FROM meu_backup_db.establishments
            WHERE organization_id IS NOT NULL
              AND (legacy_place_id = ANY($1::int[]) OR legacy_bar_id = ANY($1::int[]))`,
          [establishmentIds],
        );
        organizationIds = [
          ...new Set(orgResult.rows.map((r) => Number(r.organization_id)).filter(Boolean)),
        ];
      } catch (_) {
        organizationIds = [];
      }
    }
    return { isAdmin: false, organizationIds, establishmentIds };
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

module.exports = {
  isAdminRole,
  loadUserScope,
  canAccessEstablishment,
  operationalEstablishmentIdFromRow,
};
