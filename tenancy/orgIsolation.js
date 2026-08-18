'use strict';

/**
 * Isolamento de organização sempre ativo (independente de SAAS_MODE).
 * Super Admin vê tudo; demais usuários só as casas da própria empresa.
 *
 * Place id ≠ bar id no cardápio (ex.: Sitio Ilha place 10 / bar 15).
 * Use resolveAccessibleBarIds / canAccessBarId nas rotas de cardápio.
 */

const { loadUserScope } = require('./tenantScope');

async function resolveActorScope(pool, user) {
  if (!user || !user.id) {
    return { isSuperAdmin: false, organizationIds: [], establishmentIds: [] };
  }
  if (user.is_super_admin === true) {
    return { isSuperAdmin: true, organizationIds: [], establishmentIds: [] };
  }
  const scope = await loadUserScope(pool, user);
  return {
    isSuperAdmin: false,
    organizationIds: scope.organizationIds || [],
    establishmentIds: scope.establishmentIds || [],
  };
}

function canAccessOperationalEstablishment(actorScope, establishmentId) {
  if (!actorScope) return false;
  if (actorScope.isSuperAdmin) return true;
  const id = Number(establishmentId);
  if (!Number.isFinite(id) || id <= 0) return false;
  return (actorScope.establishmentIds || []).includes(id);
}

/**
 * IDs de `bars` acessíveis ao ator (inclui legacy_bar_id da org e
 * mapeamento place→bar). null = Super Admin (sem filtro).
 */
async function resolveAccessibleBarIds(pool, actorScope) {
  if (!actorScope || actorScope.isSuperAdmin) return null;

  const ids = new Set(
    (actorScope.establishmentIds || [])
      .map(Number)
      .filter((n) => Number.isFinite(n) && n > 0),
  );
  const orgIds = (actorScope.organizationIds || [])
    .map(Number)
    .filter((n) => Number.isFinite(n) && n > 0);

  try {
    if (orgIds.length > 0) {
      const { rows } = await pool.query(
        `SELECT legacy_bar_id, legacy_place_id
           FROM meu_backup_db.establishments
          WHERE organization_id = ANY($1::int[])
            AND (legacy_bar_id IS NOT NULL OR legacy_place_id IS NOT NULL)`,
        [orgIds],
      );
      for (const row of rows) {
        const barId = Number(row.legacy_bar_id);
        const placeId = Number(row.legacy_place_id);
        if (Number.isFinite(barId) && barId > 0) ids.add(barId);
        if (Number.isFinite(placeId) && placeId > 0) ids.add(placeId);
      }
    }

    const seedIds = [...ids];
    if (seedIds.length > 0) {
      const { rows } = await pool.query(
        `SELECT legacy_bar_id
           FROM meu_backup_db.establishments
          WHERE legacy_place_id = ANY($1::int[])
            AND legacy_bar_id IS NOT NULL`,
        [seedIds],
      );
      for (const row of rows) {
        const barId = Number(row.legacy_bar_id);
        if (Number.isFinite(barId) && barId > 0) ids.add(barId);
      }
    }
  } catch (_) {
    /* schema incompleto */
  }

  return [...ids];
}

async function canAccessBarId(pool, actorScope, barId) {
  if (!actorScope) return false;
  if (actorScope.isSuperAdmin) return true;
  const id = Number(barId);
  if (!Number.isFinite(id) || id <= 0) return false;
  if ((actorScope.establishmentIds || []).includes(id)) return true;
  const accessible = await resolveAccessibleBarIds(pool, actorScope);
  return Array.isArray(accessible) && accessible.includes(id);
}

/**
 * Middleware factory: exige auth + establishment_id no body/query/params acessível.
 * Se não houver establishment_id, apenas garante usuário autenticado.
 */
function requireScopedEstablishment(pool, { from = 'auto' } = {}) {
  return async (req, res, next) => {
    try {
      if (!req.user || !req.user.id) {
        return res.status(401).json({ success: false, error: 'Não autenticado' });
      }
      const actor = await resolveActorScope(pool, req.user);
      req.actorScope = actor;
      if (actor.isSuperAdmin) return next();

      let establishmentId;
      if (from === 'query') establishmentId = req.query.establishment_id;
      else if (from === 'body') establishmentId = req.body?.establishment_id;
      else if (from === 'params') establishmentId = req.params.establishment_id || req.params.id;
      else {
        establishmentId =
          req.query.establishment_id ??
          req.body?.establishment_id ??
          req.params.establishment_id;
      }

      if (establishmentId == null || establishmentId === '') {
        return next();
      }
      if (!(await canAccessBarId(pool, actor, establishmentId))) {
        return res.status(404).json({ success: false, error: 'Não encontrado' });
      }
      return next();
    } catch (err) {
      console.error('[orgIsolation]', err);
      return res.status(500).json({ success: false, error: 'Erro de autorização' });
    }
  };
}

function sqlEstablishmentInScope(actorScope, column, startIndex) {
  if (!actorScope || actorScope.isSuperAdmin) {
    return { sql: '', params: [], nextIndex: startIndex };
  }
  const ids = actorScope.establishmentIds || [];
  if (ids.length === 0) {
    return { sql: ' AND FALSE', params: [], nextIndex: startIndex };
  }
  return {
    sql: ` AND ${column} = ANY($${startIndex}::int[])`,
    params: [ids],
    nextIndex: startIndex + 1,
  };
}

function sqlBarIdsInScope(barIds, column, startIndex) {
  if (barIds == null) {
    return { sql: '', params: [], nextIndex: startIndex };
  }
  if (!Array.isArray(barIds) || barIds.length === 0) {
    return { sql: ' AND FALSE', params: [], nextIndex: startIndex };
  }
  return {
    sql: ` AND ${column} = ANY($${startIndex}::int[])`,
    params: [barIds],
    nextIndex: startIndex + 1,
  };
}

module.exports = {
  resolveActorScope,
  canAccessOperationalEstablishment,
  resolveAccessibleBarIds,
  canAccessBarId,
  requireScopedEstablishment,
  sqlEstablishmentInScope,
  sqlBarIdsInScope,
};
