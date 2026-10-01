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

const {
  RESERVA_ROOFTOP_BAR_ID,
  RESERVA_ROOFTOP_PLACE_ID,
  RESERVA_PINHEIROS_BAR_ID,
  RESERVA_PINHEIROS_PLACE_ID,
} = require('../services/reservaEstablishmentIds');

const {
  isCoordinatorEmail,
  loadCoordinatorPlaces,
} = require('./coordinatorEstablishments');

const isAdminRole = (user) => {
  const role = String(user && user.role ? user.role : '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  return role === 'admin' || role === 'administrador' || user?.is_super_admin === true;
};

function uniquePositiveIds(ids) {
  return [
    ...new Set(
      (ids || []).map(Number).filter((n) => Number.isFinite(n) && n > 0),
    ),
  ];
}

/** Place e bar da mesma casa Reserva (Rooftop 9/5, Pinheiros 21/18). */
function sameVenueIds(id) {
  const n = Number(id);
  if (n === RESERVA_ROOFTOP_PLACE_ID || n === RESERVA_ROOFTOP_BAR_ID) {
    return [RESERVA_ROOFTOP_PLACE_ID, RESERVA_ROOFTOP_BAR_ID];
  }
  if (n === RESERVA_PINHEIROS_PLACE_ID || n === RESERVA_PINHEIROS_BAR_ID) {
    return [RESERVA_PINHEIROS_PLACE_ID, RESERVA_PINHEIROS_BAR_ID];
  }
  return [n];
}

/** Bar legado sem place ainda autoriza o place que o Sistema de Reservas envia. */
function withSameVenuePlaces(ids) {
  const out = new Set(uniquePositiveIds(ids));
  if (out.has(RESERVA_ROOFTOP_BAR_ID)) out.add(RESERVA_ROOFTOP_PLACE_ID);
  if (out.has(RESERVA_PINHEIROS_BAR_ID)) out.add(RESERVA_PINHEIROS_PLACE_ID);
  return [...out];
}

async function finishScope(pool, scopedUser, organizationIds, establishmentIds) {
  let ids = withSameVenuePlaces(establishmentIds);
  const email = String(scopedUser && scopedUser.email ? scopedUser.email : '')
    .trim()
    .toLowerCase();
  if (isCoordinatorEmail(email)) {
    const places = await loadCoordinatorPlaces(pool);
    ids = uniquePositiveIds([...ids, ...places.map((place) => place.id)]);
  }
  return {
    isAdmin: false,
    organizationIds: uniquePositiveIds(organizationIds),
    establishmentIds: ids,
  };
}

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

async function loadActiveUepIds(pool, userId) {
  try {
    const { rows } = await pool.query(
      `SELECT DISTINCT establishment_id
         FROM user_establishment_permissions
        WHERE user_id = $1 AND is_active = TRUE`,
      [userId],
    );
    return uniquePositiveIds(rows.map((r) => r.establishment_id));
  } catch (_) {
    return [];
  }
}

/**
 * Carrega o escopo do usuário. Memberships e user_establishment_permissions
 * ativos são unidos: um vínculo SaaS incompleto não apaga a permissão legada
 * que o painel ainda mostra. Tolerante a schema incompleto (staging).
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
  if (user.is_super_admin === true) {
    return { isAdmin: true, organizationIds: [], establishmentIds: [] };
  }

  let email = String(user.email || '').trim().toLowerCase();
  if (!email) {
    try {
      const { rows } = await pool.query(
        `SELECT email FROM users WHERE id = $1 LIMIT 1`,
        [user.id],
      );
      email = String(rows[0]?.email || '').trim().toLowerCase();
    } catch (_) {
      email = '';
    }
  }
  const scopedUser = email ? { ...user, email } : user;

  // 1) Tenta o modelo novo (memberships) — inclusive account_admin com users.role = admin
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

      const legacyIds = await loadActiveUepIds(pool, user.id);
      return finishScope(pool, scopedUser, organizationIds, [
        ...establishmentIds,
        ...legacyIds,
      ]);
    }
  } catch (_) {
    // tabela memberships ainda não existe — segue para o legado
  }

  // 2) Fallback legado: user_establishment_permissions
  let establishmentIds = [];
  let organizationIds = [];
  try {
    const { rows } = await pool.query(
      `SELECT DISTINCT establishment_id
         FROM user_establishment_permissions
        WHERE user_id = $1 AND is_active = TRUE`,
      [user.id],
    );
    establishmentIds = [...new Set(rows.map((r) => Number(r.establishment_id)).filter(Boolean))];
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
  } catch (_) {
    establishmentIds = [];
    organizationIds = [];
  }

  if (organizationIds.length > 0 || establishmentIds.length > 0) {
    return finishScope(pool, scopedUser, organizationIds, establishmentIds);
  }

  // 3) organization_id em users (account admins provisionados sem UEP)
  try {
    const { rows } = await pool.query(
      `SELECT organization_id FROM users WHERE id = $1 AND organization_id IS NOT NULL LIMIT 1`,
      [user.id],
    );
    const orgId = Number(rows[0]?.organization_id);
    if (Number.isFinite(orgId) && orgId > 0) {
      const opIds = await operationalIdsForOrganizations(pool, [orgId]);
      return finishScope(pool, scopedUser, [orgId], opIds);
    }
  } catch (_) {
    /* ignore */
  }

  // 4) role=admin SEM membership/UEP/org NÃO é mais bypass global.
  // Só is_super_admin (tratado no início) vê todas as organizações.
  // Fail-closed: sem vínculo de tenant → escopo vazio (não vê casas de ninguém),
  // salvo o acesso explícito da coordenadora de reservas ao Reserva Rooftop.
  return finishScope(pool, scopedUser, [], []);
}

function canAccessEstablishment(scope, establishmentId) {
  if (!scope) return false;
  if (scope.isAdmin) return true;
  const id = Number(establishmentId);
  if (!Number.isFinite(id) || id <= 0) return false;
  const ids = Array.isArray(scope.establishmentIds) ? scope.establishmentIds : [];
  return sameVenueIds(id).some((alias) => ids.includes(alias));
}

module.exports = {
  isAdminRole,
  loadUserScope,
  canAccessEstablishment,
  operationalEstablishmentIdFromRow,
};
