'use strict';

/**
 * queryScope — restringe uma query SQL ao escopo de estabelecimentos do usuário
 * AUTENTICADO (req.tenant), de forma aditiva.
 *
 * Isolamento de organização é SEMPRE ativo quando req.tenant está populado
 * (independente de SAAS_MODE — billing/módulos ficam nas flags; cross-org não).
 *
 *   - admin / super admin (tenant.isAdmin) => no-op (vê tudo).
 *   - anônimo (sem req.tenant)             => no-op (rota pública).
 *   - autenticado COM escopo               => AND <col> IN (ids).
 *   - autenticado SEM escopo               => AND <col> = -1 (não vaza).
 *
 * Depende de req.tenant (populado pelo tenantMiddleware).
 */

/**
 * @param {object} req            requisição Express (espera req.tenant)
 * @param {string} column         coluna qualificada, ex.: 'rr.establishment_id'
 * @param {number} startIndex     próximo índice de placeholder ($N)
 * @returns {{ sql: string, params: number[], nextIndex: number }}
 */
function establishmentScopeClause(req, column, startIndex) {
  const tenant = req && req.tenant;
  if (!tenant || tenant.isAdmin) {
    return { sql: '', params: [], nextIndex: startIndex };
  }
  const ids = Array.isArray(tenant.establishmentIds)
    ? [...new Set(tenant.establishmentIds.map(Number).filter((n) => Number.isFinite(n) && n > 0))]
    : [];

  if (ids.length === 0) {
    return { sql: ` AND ${column} = -1`, params: [], nextIndex: startIndex };
  }

  const placeholders = ids.map((_, i) => `$${startIndex + i}`).join(', ');
  return { sql: ` AND ${column} IN (${placeholders})`, params: ids, nextIndex: startIndex + ids.length };
}

/**
 * Checagem pós-fetch: o estabelecimento do recurso está no escopo?
 * Anônimo / admin / sem tenant => true (política da rota).
 *
 * @param {object} req
 * @param {number|string} establishmentId
 * @returns {boolean}
 */
function canReadEstablishment(req, establishmentId) {
  const tenant = req && req.tenant;
  if (!tenant || tenant.isAdmin) return true;
  const id = Number(establishmentId);
  if (!Number.isFinite(id) || id <= 0) return true;
  const ids = Array.isArray(tenant.establishmentIds) ? tenant.establishmentIds.map(Number) : [];
  return ids.includes(id);
}

/**
 * Responde 404 se o usuário escopado não pode ler/mutar o estabelecimento.
 * @returns {boolean} true = pode continuar; false = já respondeu 404
 */
function denyIfCannotReadEstablishment(req, res, establishmentId, notFoundMessage = 'Reserva não encontrada') {
  if (canReadEstablishment(req, establishmentId)) return true;
  res.status(404).json({ success: false, error: notFoundMessage });
  return false;
}

module.exports = { establishmentScopeClause, canReadEstablishment, denyIfCannotReadEstablishment };
