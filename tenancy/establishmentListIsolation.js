'use strict';

/**
 * Isolamento de listagens de places/bars por organização.
 *
 * Independente de SAAS_MODE: usuário autenticado de uma empresa nunca vê
 * estabelecimentos de outra. Superadmin continua vendo todas as casas.
 * Requisições anônimas (reserva/cardápio público) seguem públicas.
 */

function resolveEstablishmentListFilter(user, scope) {
  if (!user || !user.id) {
    return { mode: 'public', organizationIds: [], establishmentIds: [] };
  }

  if (user.is_super_admin === true || (scope && scope.isAdmin === true)) {
    return { mode: 'all', organizationIds: [], establishmentIds: [] };
  }

  const organizationIds = [
    ...new Set(
      (scope?.organizationIds || [])
        .map(Number)
        .filter((n) => Number.isFinite(n) && n > 0),
    ),
  ];
  const establishmentIds = [
    ...new Set(
      (scope?.establishmentIds || [])
        .map(Number)
        .filter((n) => Number.isFinite(n) && n > 0),
    ),
  ];

  if (organizationIds.length > 0) {
    return { mode: 'organization', organizationIds, establishmentIds };
  }
  if (establishmentIds.length > 0) {
    return { mode: 'establishments', organizationIds, establishmentIds };
  }
  return { mode: 'none', organizationIds: [], establishmentIds: [] };
}

function sqlPlaceIsolation(filter, startIndex) {
  if (!filter || filter.mode === 'public' || filter.mode === 'all') {
    return { sql: '', params: [], nextIndex: startIndex };
  }
  if (filter.mode === 'none') {
    return { sql: ' AND FALSE', params: [], nextIndex: startIndex };
  }
  if (filter.mode === 'organization') {
    return {
      sql: ` AND EXISTS (
              SELECT 1 FROM meu_backup_db.establishments e_iso
               WHERE e_iso.legacy_place_id = p.id
                 AND e_iso.organization_id = ANY($${startIndex}::int[])
            )`,
      params: [filter.organizationIds],
      nextIndex: startIndex + 1,
    };
  }
  return {
    sql: ` AND p.id = ANY($${startIndex}::int[])`,
    params: [filter.establishmentIds],
    nextIndex: startIndex + 1,
  };
}

function sqlBarIsolation(filter, startIndex) {
  if (!filter || filter.mode === 'public' || filter.mode === 'all') {
    return { sql: '', params: [], nextIndex: startIndex };
  }
  if (filter.mode === 'none') {
    return { sql: ' AND FALSE', params: [], nextIndex: startIndex };
  }
  if (filter.mode === 'organization') {
    return {
      sql: ` AND EXISTS (
              SELECT 1 FROM meu_backup_db.establishments e_iso
               WHERE e_iso.legacy_bar_id = b.id
                 AND e_iso.organization_id = ANY($${startIndex}::int[])
            )`,
      params: [filter.organizationIds],
      nextIndex: startIndex + 1,
    };
  }
  return {
    sql: ` AND b.id = ANY($${startIndex}::int[])`,
    params: [filter.establishmentIds],
    nextIndex: startIndex + 1,
  };
}

function sqlEstablishmentTableIsolation(filter, alias, startIndex) {
  if (!filter || filter.mode === 'public' || filter.mode === 'all') {
    return { sql: '', params: [], nextIndex: startIndex };
  }
  if (filter.mode === 'none') {
    return { sql: ' AND FALSE', params: [], nextIndex: startIndex };
  }
  if (filter.mode === 'organization') {
    return {
      sql: ` AND ${alias}.organization_id = ANY($${startIndex}::int[])`,
      params: [filter.organizationIds],
      nextIndex: startIndex + 1,
    };
  }
  return {
    sql: ` AND (${alias}.legacy_place_id = ANY($${startIndex}::int[])
              OR ${alias}.legacy_bar_id = ANY($${startIndex}::int[]))`,
    params: [filter.establishmentIds],
    nextIndex: startIndex + 1,
  };
}

/**
 * Módulos efetivos da casa: contract da org ∩ (establishment_modules se existir).
 * Casa sem linha em establishments (legado) → NULL (= UI trata como tudo liberado).
 */
const ENABLED_MODULES_FOR_PLACE_SQL = `
(
  SELECT CASE
    WHEN NOT EXISTS (
      SELECT 1 FROM meu_backup_db.establishments e_mod
       WHERE e_mod.legacy_place_id = p.id
    ) THEN NULL
    ELSE COALESCE(
      (
        SELECT json_agg(DISTINCT m.key)
          FROM meu_backup_db.establishments e
          JOIN meu_backup_db.organization_modules om
            ON om.organization_id = e.organization_id AND om.is_enabled = TRUE
          JOIN meu_backup_db.modules m ON m.id = om.module_id AND m.is_active = TRUE
         WHERE e.legacy_place_id = p.id
           AND (
             NOT EXISTS (
               SELECT 1 FROM meu_backup_db.establishment_modules em0
                WHERE em0.establishment_id = e.id
             )
             OR EXISTS (
               SELECT 1 FROM meu_backup_db.establishment_modules em
                WHERE em.establishment_id = e.id
                  AND em.module_id = m.id
                  AND em.is_enabled = TRUE
             )
           )
      ),
      '[]'::json
    )
  END
) AS enabled_modules
`;

const ENABLED_MODULES_FOR_BAR_SQL = `
(
  SELECT CASE
    WHEN NOT EXISTS (
      SELECT 1 FROM meu_backup_db.establishments e_mod
       WHERE e_mod.legacy_bar_id = b.id
    ) THEN NULL
    ELSE COALESCE(
      (
        SELECT json_agg(DISTINCT m.key)
          FROM meu_backup_db.establishments e
          JOIN meu_backup_db.organization_modules om
            ON om.organization_id = e.organization_id AND om.is_enabled = TRUE
          JOIN meu_backup_db.modules m ON m.id = om.module_id AND m.is_active = TRUE
         WHERE e.legacy_bar_id = b.id
           AND (
             NOT EXISTS (
               SELECT 1 FROM meu_backup_db.establishment_modules em0
                WHERE em0.establishment_id = e.id
             )
             OR EXISTS (
               SELECT 1 FROM meu_backup_db.establishment_modules em
                WHERE em.establishment_id = e.id
                  AND em.module_id = m.id
                  AND em.is_enabled = TRUE
             )
           )
      ),
      '[]'::json
    )
  END
) AS enabled_modules
`;

const ENABLED_MODULES_FOR_ESTABLISHMENT_ALIAS_SQL = `
(
  SELECT CASE
    WHEN e.id IS NULL THEN NULL
    ELSE COALESCE(
      (
        SELECT json_agg(DISTINCT m.key)
          FROM meu_backup_db.organization_modules om
          JOIN meu_backup_db.modules m ON m.id = om.module_id AND m.is_active = TRUE
         WHERE om.organization_id = e.organization_id
           AND om.is_enabled = TRUE
           AND (
             NOT EXISTS (
               SELECT 1 FROM meu_backup_db.establishment_modules em0
                WHERE em0.establishment_id = e.id
             )
             OR EXISTS (
               SELECT 1 FROM meu_backup_db.establishment_modules em
                WHERE em.establishment_id = e.id
                  AND em.module_id = m.id
                  AND em.is_enabled = TRUE
             )
           )
      ),
      '[]'::json
    )
  END
) AS enabled_modules
`;

async function loadListFilterForRequest(pool, req) {
  const user = req && req.user;
  if (!user || !user.id) {
    return resolveEstablishmentListFilter(null, null);
  }
  const { loadUserScope } = require('./tenantScope');
  const scope = await loadUserScope(pool, user);
  return resolveEstablishmentListFilter(user, scope);
}

module.exports = {
  resolveEstablishmentListFilter,
  sqlPlaceIsolation,
  sqlBarIsolation,
  sqlEstablishmentTableIsolation,
  loadListFilterForRequest,
  ENABLED_MODULES_FOR_PLACE_SQL,
  ENABLED_MODULES_FOR_BAR_SQL,
  ENABLED_MODULES_FOR_ESTABLISHMENT_ALIAS_SQL,
};
