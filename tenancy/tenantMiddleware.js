'use strict';

/**
 * tenantMiddleware — injeta req.tenant a partir do token/escopo do usuário.
 *
 * Isolamento de organização: SEMPRE ativo para usuários autenticados
 * (não depende de SAAS_MODE). SAAS_MODE continua controlando módulos/billing
 * em requireModule / requirePermission / entitlements.
 *
 *   - Sem req.user (anônimo) => next() — rotas públicas seguem.
 *   - Autenticado            => resolve escopo e bloqueia establishment_id fora do escopo.
 */

const { isSaasObserving, isSaasEnforced } = require('./featureFlags');
const { loadUserScope, canAccessEstablishment } = require('./tenantScope');
const { runWithRequestTenant } = require('./requestContext');

function getPool(req) {
  return req.app && typeof req.app.get === 'function' ? req.app.get('pool') : null;
}

/** Lê o establishment_id pretendido da requisição (query/body/params). */
function readRequestedEstablishmentId(req, options = {}) {
  const fromQuery =
    !options.ignoreQueryEstablishmentId &&
    req.query &&
    (req.query.establishment_id || req.query.establishmentId);
  const raw =
    fromQuery ??
    (req.body && (req.body.establishment_id || req.body.establishmentId)) ??
    (req.params && (req.params.establishment_id || req.params.id_place));
  const id = Number(raw);
  return Number.isFinite(id) && id > 0 ? id : null;
}

function tenantMiddleware(options = {}) {
  const { requireEstablishment = false, ignoreQueryEstablishmentId = false } = options;

  return async function tenant(req, res, next) {
    const pool = getPool(req);

    // Não impõe autenticação: anônimos seguem (política da rota).
    if (!pool || !req.user) return next();

    let scope;
    try {
      scope = await loadUserScope(pool, req.user);
    } catch (err) {
      console.error('[tenant] erro ao carregar escopo:', err.message);
      return res.status(500).json({ success: false, error: 'Falha ao resolver tenant.' });
    }

    const requestedEst = readRequestedEstablishmentId(req, { ignoreQueryEstablishmentId });
    const tokenOrgId = Number(req.user.organization_id);
    const primaryOrganizationId =
      scope.organizationIds[0] ??
      (Number.isFinite(tokenOrgId) && tokenOrgId > 0 ? tokenOrgId : null);

    if (
      isSaasObserving() &&
      Number.isFinite(tokenOrgId) &&
      tokenOrgId > 0 &&
      scope.organizationIds.length > 0 &&
      !scope.organizationIds.includes(tokenOrgId)
    ) {
      console.warn(
        `[tenant:observe] JWT organization_id=${tokenOrgId} diverge do escopo DB ` +
          `[${scope.organizationIds.join(',')}] user=${req.user.id}`,
      );
    }

    // Super admin: loadUserScope retorna isAdmin true.
    const isAdmin = scope.isAdmin === true || req.user.is_super_admin === true;

    req.tenant = {
      isAdmin,
      organizationIds: scope.organizationIds,
      establishmentIds: scope.establishmentIds,
      establishmentId: requestedEst,
      primaryOrganizationId,
    };

    const allowed =
      isAdmin ||
      requestedEst == null ||
      canAccessEstablishment({ ...scope, isAdmin }, requestedEst);

    const missingRequired = requireEstablishment && requestedEst == null && !isAdmin;

    if (!allowed || missingRequired) {
      const reason = missingRequired ? 'establishment_id ausente' : 'establishment fora do escopo';
      // Isolamento cross-org sempre bloqueia (mesmo em observe).
      // Observe só loga contexto extra; não libera acesso a outra org.
      if (isSaasObserving() && !isSaasEnforced()) {
        console.warn(
          `[tenant] BLOQUEIO isolamento user=${req.user.id} (${req.user.email}) ` +
            `est=${requestedEst} rota=${req.method} ${req.originalUrl} — ${reason}`,
        );
      }
      return res.status(403).json({ success: false, error: 'Acesso negado ao estabelecimento.' });
    }

    return runWithRequestTenant(
      {
        organizationId: primaryOrganizationId,
        isAdmin,
        userId: req.user.id,
      },
      () => next(),
    );
  };
}

module.exports = tenantMiddleware;
