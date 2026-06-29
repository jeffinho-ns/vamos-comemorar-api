'use strict';

/**
 * tenantMiddleware — injeta req.tenant a partir do token/escopo do usuário.
 *
 * SEGURANÇA POR DESIGN (NÃO QUEBRA PRODUÇÃO):
 *   - SAAS_MODE off      => no-op total (next()).
 *   - SAAS_MODE observe  => resolve o tenant e LOGA o que seria bloqueado,
 *                           mas NUNCA bloqueia (modo observação do plano).
 *   - SAAS_MODE on       => exige tenant resolvido; bloqueia acesso cruzado.
 *
 * Este arquivo NÃO está montado no server.js. É plugável depois, rota a rota,
 * começando em 'observe'. Espera que `authenticateToken` já tenha populado
 * req.user (id, email, role) e usa o pool de req.app.get('pool').
 */

const { isSaasEnforced, isSaasObserving, isFailOpen } = require('./featureFlags');
const { loadUserScope, canAccessEstablishment } = require('./tenantScope');

function getPool(req) {
  return req.app && typeof req.app.get === 'function' ? req.app.get('pool') : null;
}

/** Lê o establishment_id pretendido da requisição (query/body/params). */
function readRequestedEstablishmentId(req) {
  const raw =
    (req.query && (req.query.establishment_id || req.query.establishmentId)) ??
    (req.body && (req.body.establishment_id || req.body.establishmentId)) ??
    (req.params && (req.params.establishment_id || req.params.id_place));
  const id = Number(raw);
  return Number.isFinite(id) && id > 0 ? id : null;
}

function tenantMiddleware(options = {}) {
  const { requireEstablishment = false } = options;

  return async function tenant(req, res, next) {
    // Desligado: não faz absolutamente nada.
    if (isFailOpen() && !isSaasObserving()) return next();

    const pool = getPool(req);
    if (!pool || !req.user) {
      // Sem contexto suficiente: em observe/off nunca bloqueia.
      if (!isSaasEnforced()) return next();
      return res.status(401).json({ success: false, error: 'Autenticação necessária.' });
    }

    let scope;
    try {
      scope = await loadUserScope(pool, req.user);
    } catch (err) {
      console.error('[tenant] erro ao carregar escopo:', err.message);
      if (!isSaasEnforced()) return next();
      return res.status(500).json({ success: false, error: 'Falha ao resolver tenant.' });
    }

    const requestedEst = readRequestedEstablishmentId(req);
    req.tenant = {
      isAdmin: scope.isAdmin,
      organizationIds: scope.organizationIds,
      establishmentIds: scope.establishmentIds,
      establishmentId: requestedEst,
    };

    // Validação anti-ID-na-URL (o establishment pedido está no escopo?)
    const allowed =
      scope.isAdmin ||
      requestedEst == null ||
      canAccessEstablishment(scope, requestedEst);

    const missingRequired = requireEstablishment && requestedEst == null && !scope.isAdmin;

    if (!allowed || missingRequired) {
      const reason = missingRequired ? 'establishment_id ausente' : 'establishment fora do escopo';
      if (isSaasObserving()) {
        console.warn(
          `[tenant:observe] BLOQUEARIA user=${req.user.id} (${req.user.email}) ` +
          `est=${requestedEst} rota=${req.method} ${req.originalUrl} — ${reason}`,
        );
        return next(); // observação: não bloqueia
      }
      return res.status(403).json({ success: false, error: 'Acesso negado ao estabelecimento.' });
    }

    return next();
  };
}

module.exports = tenantMiddleware;
