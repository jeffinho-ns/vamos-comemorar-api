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

module.exports = { establishmentScopeClause };
