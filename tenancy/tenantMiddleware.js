'use strict';

/**
 * tenantMiddleware — injeta req.tenant a partir do token/escopo do usuário.
 *
 * SEGURANÇA POR DESIGN (NÃO QUEBRA PRODUÇÃO):
 *   - SAAS_MODE off      => no-op total (next()).
 *   - SAAS_MODE observe  => resolve o tenant e LOGA o que seria bloqueado,
 *                           mas NUNCA bloqueia (modo observação do plano).
 *   - SAAS_MODE on       => restringe usuários AUTENTICADOS ao seu escopo
 *                           (bloqueia acesso cruzado). NÃO impõe login: requisições
 *                           anônimas seguem normalmente (rotas públicas continuam
 *                           funcionando — ex.: criação pública de reserva).
 *
 * Este arquivo NÃO está montado no server.js. É plugável depois, rota a rota,
 * começando em 'observe'. Espera que `authenticateToken` já tenha populado
 * req.user (id, email, role) e usa o pool de req.app.get('pool').
 */

const { isSaasEnforced, isSaasObserving, isFailOpen } = require('./featureFlags');
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
    // Desligado: não faz absolutamente nada.
    if (isFailOpen() && !isSaasObserving()) return next();

    const pool = getPool(req);

    // IMPORTANTE: o tenancy NÃO impõe autenticação. Requisições anônimas seguem
    // (a rota mantém sua própria política — ex.: criação pública de reserva).
    // Só restringimos requisições AUTENTICADAS ao escopo do usuário. Exigir token
    // em rotas hoje públicas é um passo separado (adicionar authenticateToken),
    // feito depois para não quebrar o fluxo público.
    if (!pool || !req.user) return next();

    let scope;
    try {
      scope = await loadUserScope(pool, req.user);
    } catch (err) {
      console.error('[tenant] erro ao carregar escopo:', err.message);
      if (!isSaasEnforced()) return next();
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

    req.tenant = {
      isAdmin: scope.isAdmin,
      organizationIds: scope.organizationIds,
      establishmentIds: scope.establishmentIds,
      establishmentId: requestedEst,
      primaryOrganizationId,
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

    return runWithRequestTenant(
      {
        organizationId: primaryOrganizationId,
        isAdmin: scope.isAdmin,
        userId: req.user.id,
      },
      () => next(),
    );
  };
}

module.exports = tenantMiddleware;
