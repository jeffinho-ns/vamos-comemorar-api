'use strict';

/**
 * queryScope — restringe uma query SQL ao escopo de estabelecimentos do usuário
 * AUTENTICADO, de forma aditiva e INERTE.
 *
 * SEGURANÇA POR DESIGN:
 *   - SAAS_MODE != on            => no-op total (não altera a query).
 *   - admin / super admin        => no-op (vê tudo).
 *   - anônimo (sem req.tenant)   => no-op (rota mantém sua política pública).
 *   - autenticado COM escopo     => AND <col> IN (ids do usuário).
 *   - autenticado SEM escopo     => AND <col> = -1 (não vaza nada).
 *
 * Depende de req.tenant (populado pelo tenantMiddleware). Use junto da listagem
 * para que o "enforce" entregue isolamento de LEITURA, não só bloqueio de ID.
 */

const { isSaasEnforced } = require('./featureFlags');

/**
 * @param {object} req            requisição Express (espera req.tenant)
 * @param {string} column         coluna qualificada, ex.: 'rr.establishment_id'
 * @param {number} startIndex     próximo índice de placeholder ($N)
 * @returns {{ sql: string, params: number[], nextIndex: number }}
 */
function establishmentScopeClause(req, column, startIndex) {
  const tenant = req && req.tenant;
  if (!isSaasEnforced() || !tenant || tenant.isAdmin) {
    return { sql: '', params: [], nextIndex: startIndex };
  }
  const ids = Array.isArray(tenant.establishmentIds)
    ? [...new Set(tenant.establishmentIds.map(Number).filter((n) => Number.isFinite(n) && n > 0))]
    : [];

  if (ids.length === 0) {
    // Usuário autenticado porém sem nenhum estabelecimento no escopo: não vaza nada.
    return { sql: ` AND ${column} = -1`, params: [], nextIndex: startIndex };
  }

  const placeholders = ids.map((_, i) => `$${startIndex + i}`).join(', ');
  return { sql: ` AND ${column} IN (${placeholders})`, params: ids, nextIndex: startIndex + ids.length };
}

/**
 * Checagem pós-fetch para recursos buscados por id (ex.: GET /:id): o
 * estabelecimento do recurso está no escopo do usuário autenticado?
 *
 * INERTE quando SAAS_MODE != on (sempre true). Admin e anônimo (sem req.tenant)
 * também retornam true — a rota mantém sua política. Use para responder 404
 * (não revelar existência) quando um usuário escopado tenta ler recurso de outra casa.
 *
 * @param {object} req
 * @param {number|string} establishmentId   id operacional do recurso
 * @returns {boolean}
 */
function canReadEstablishment(req, establishmentId) {
  if (!isSaasEnforced()) return true;
  const tenant = req && req.tenant;
  if (!tenant || tenant.isAdmin) return true;
  const id = Number(establishmentId);
  if (!Number.isFinite(id) || id <= 0) return true; // sem vínculo de casa: não bloqueia
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
