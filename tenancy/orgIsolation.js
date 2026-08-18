'use strict';

/**
 * Isolamento de organização sempre ativo (independente de SAAS_MODE).
 * Super Admin vê tudo; demais usuários só as casas da própria empresa.
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
      if (!canAccessOperationalEstablishment(actor, establishmentId)) {
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

module.exports = {
  resolveActorScope,
  canAccessOperationalEstablishment,
  requireScopedEstablishment,
  sqlEstablishmentInScope,
};
