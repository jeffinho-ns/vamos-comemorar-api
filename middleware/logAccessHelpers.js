const { isSuperAdminUser } = require('../config/superAdmins');
const { loadUserScope } = require('../tenancy/tenantScope');

/**
 * IDs de estabelecimentos aos quais o usuário está vinculado
 * (memberships + UEP + organization_id — mesmo modelo do tenantScope).
 */
async function getEstablishmentScopeIds(pool, userId) {
  if (!userId) return [];
  const scope = await loadUserScope(pool, { id: userId, is_super_admin: false });
  return Array.isArray(scope.establishmentIds) ? scope.establishmentIds : [];
}

/**
 * Contexto para filtrar logs: super admin vê tudo; demais só o escopo (e próprios logs sem establishment_id).
 */
async function getActionLogsViewerContext(pool, req) {
  const superAdmin = isSuperAdminUser(req);
  const userId = req.user?.id;
  let establishmentIds = [];
  if (!superAdmin && userId != null) {
    establishmentIds = await getEstablishmentScopeIds(pool, userId);
  }
  return { superAdmin, userId, establishmentIds };
}

/**
 * Anexa filtro de escopo à cláusula WHERE (params mutáveis).
 * Super admins: sem filtro extra.
 * Demais utilizadores: apenas logs com establishment_id nos estabelecimentos permitidos
 * (sem linhas com establishment_id NULL de outros contextos).
 */
function appendEstablishmentScope(sql, params, paramIndex, ctx) {
  if (ctx.superAdmin) {
    return { sql, params, paramIndex };
  }
  if (!ctx.userId) {
    return { sql: `${sql} AND 1=0`, params, paramIndex };
  }
  if (!ctx.establishmentIds.length) {
    return { sql: `${sql} AND 1=0`, params, paramIndex };
  }
  const idxA = paramIndex;
  const nextSql = `${sql} AND establishment_id = ANY($${idxA}::int[])`;
  const nextParams = [...params, ctx.establishmentIds];
  return { sql: nextSql, params: nextParams, paramIndex: paramIndex + 1 };
}

/**
 * Valida filtro establishmentId da query contra o escopo (anti-ID na URL).
 */
function assertEstablishmentFilterAllowed(ctx, establishmentIdRaw) {
  if (establishmentIdRaw === undefined || establishmentIdRaw === null || establishmentIdRaw === '') {
    return { ok: true, establishmentId: null };
  }
  const establishmentId = parseInt(String(establishmentIdRaw), 10);
  if (Number.isNaN(establishmentId)) {
    return { ok: false, status: 400, error: 'establishmentId inválido' };
  }
  if (ctx.superAdmin) {
    return { ok: true, establishmentId };
  }
  if (!ctx.establishmentIds.includes(establishmentId)) {
    return { ok: false, status: 403, error: 'Acesso negado a este estabelecimento' };
  }
  return { ok: true, establishmentId };
}

module.exports = {
  getEstablishmentScopeIds,
  getActionLogsViewerContext,
  appendEstablishmentScope,
  assertEstablishmentFilterAllowed,
  isSuperAdminUser,
};
