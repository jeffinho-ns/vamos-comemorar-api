'use strict';

const auth = require('../../middleware/auth');
const authorize = require('../../middleware/authorize');
const requireModule = require('../../tenancy/requireModule');
const { resolveOrganizationIdForUser } = require('../../tenancy/resolveOrganizationId');
const {
  parseEstablishmentId,
  GRUPO_IDEIA_ORG_SLUG,
} = require('../../validators/rhIdeiaValidator');

const ALLOWED_ROLES = [
  'admin',
  'gerente',
  'subgerente',
  'administrador',
  'recepção',
  'recepcao',
  'atendente',
  'colaborador',
  'funcionario',
];

const SUPER_ROLES = ['admin', 'administrador'];
const GESTOR_ROLES = [...SUPER_ROLES, 'gerente', 'subgerente'];

const DENIED = { access: false, manage: false, validate: false };

function normalizeRole(user) {
  return String(user?.role || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/**
 * UEP agregada em todas as unidades da org — qualquer flag ativa libera.
 */
async function resolveRhIdeiaPermissions(pool, user, organizationId) {
  if (!user) return DENIED;

  const role = normalizeRole(user);
  if (user.is_super_admin === true || SUPER_ROLES.includes(role)) {
    return { access: true, manage: true, validate: true };
  }

  const userId = user.id || user.userId || null;
  const email = user.email || user.userEmail || '';
  if (!userId && !email) return DENIED;

  const { rows } = await pool.query(
    `SELECT
       BOOL_OR(uep.can_access_rh_ideia) AS can_access_rh_ideia,
       BOOL_OR(uep.can_manage_rh_ideia) AS can_manage_rh_ideia,
       BOOL_OR(uep.can_validate_rh_ideia) AS can_validate_rh_ideia
       FROM user_establishment_permissions uep
       JOIN establishments e ON e.id = uep.establishment_id
      WHERE e.organization_id = $1
        AND uep.is_active = TRUE
        AND (($2::int IS NOT NULL AND uep.user_id = $2::int)
             OR ($3 <> '' AND LOWER(uep.user_email) = LOWER($3)))`,
    [organizationId, userId, email]
  );

  const row = rows[0];
  if (!row) return DENIED;

  const isGestor = GESTOR_ROLES.includes(role);
  const manage = Boolean(row.can_manage_rh_ideia) || isGestor;

  return {
    access: manage || Boolean(row.can_access_rh_ideia),
    manage,
    validate: manage || Boolean(row.can_validate_rh_ideia),
  };
}

async function resolveUserEstablishmentIds(pool, user, organizationId) {
  const userId = user?.id || user?.userId;
  const email = user?.email || user?.userEmail || '';
  if (!userId && !email) return [];

  const { rows } = await pool.query(
    `SELECT DISTINCT uep.establishment_id
       FROM user_establishment_permissions uep
       JOIN establishments e ON e.id = uep.establishment_id
      WHERE e.organization_id = $1
        AND uep.is_active = TRUE
        AND uep.can_access_rh_ideia = TRUE
        AND (($2::int IS NOT NULL AND uep.user_id = $2::int)
             OR ($3 <> '' AND LOWER(uep.user_email) = LOWER($3)))`,
    [organizationId, userId || null, email]
  );
  return rows.map((r) => r.establishment_id);
}

async function assertOrgSlug(pool, organizationId) {
  const { rows } = await pool.query(`SELECT slug FROM organizations WHERE id = $1`, [organizationId]);
  return rows[0]?.slug === GRUPO_IDEIA_ORG_SLUG;
}

function resolveEstablishmentFilter(req) {
  return (
    parseEstablishmentId(req.query.establishment_id) ||
    parseEstablishmentId(req.body?.establishment_id) ||
    null
  );
}

function rhIdeiaOrgGate(pool) {
  return async function gate(req, res, next) {
    try {
      const organizationId = await resolveOrganizationIdForUser(pool, req.user);
      if (!organizationId) {
        console.warn(
          `[rh-ideia] org não resolvida user=${req.user?.id || 'anon'} rota=${req.method} ${req.originalUrl}`
        );
        return res.status(403).json({
          success: false,
          message: 'Ideia RH disponível apenas para o Grupo Ideia.',
        });
      }

      const isSuper = req.user?.is_super_admin === true;
      if (!isSuper) {
        const allowed = await assertOrgSlug(pool, organizationId);
        if (!allowed) {
          console.warn(
            `[rh-ideia] org fora do grupo organization_id=${organizationId} ` +
              `user=${req.user?.id || 'anon'} rota=${req.method} ${req.originalUrl}`
          );
          return res.status(403).json({
            success: false,
            message: 'Ideia RH disponível apenas para o Grupo Ideia.',
          });
        }
      }

      const perms = await resolveRhIdeiaPermissions(pool, req.user, organizationId);
      if (!perms.access) {
        console.warn(
          `[rh-ideia] acesso negado organization_id=${organizationId} ` +
            `user=${req.user?.id || 'anon'} rota=${req.method} ${req.originalUrl}`
        );
        return res.status(403).json({
          success: false,
          message: 'Sem permissão para acessar o Ideia RH.',
        });
      }

      req.iriOrganizationId = organizationId;
      req.iriEstablishmentFilter = resolveEstablishmentFilter(req);
      req.iriCanManage = perms.manage;
      req.iriCanValidate = perms.validate;
      req.iriUserEstablishmentIds = await resolveUserEstablishmentIds(pool, req.user, organizationId);

      return next();
    } catch (err) {
      console.error(
        `[rh-ideia] gate user=${req.user?.id || 'anon'}: ${err.message}`
      );
      return res.status(500).json({ success: false, message: 'Falha ao validar acesso.' });
    }
  };
}

function requireManage(req, res, next) {
  if (req.iriCanManage) return next();
  return res.status(403).json({ success: false, message: 'Permissão de gestão necessária.' });
}

function requireValidate(req, res, next) {
  if (req.iriCanValidate || req.iriCanManage) return next();
  return res.status(403).json({ success: false, message: 'Permissão de validação necessária.' });
}

async function writeAudit(pool, { organizationId, establishmentId, entityType, entityId, action, actorUserId, payload }) {
  try {
    await pool.query(
      `INSERT INTO iri_audit_log
        (organization_id, establishment_id, entity_type, entity_id, action, actor_user_id, payload)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        organizationId,
        establishmentId || null,
        entityType,
        entityId || null,
        action,
        actorUserId || null,
        payload ? JSON.stringify(payload) : null,
      ]
    );
  } catch (err) {
    console.error('[rh-ideia] audit:', err.message);
  }
}

function applyCommonMiddleware(router, pool) {
  router.use(auth);
  router.use(authorize(...ALLOWED_ROLES));
  router.use(requireModule('rh_ideia'));
  router.use(rhIdeiaOrgGate(pool));
}

module.exports = {
  ALLOWED_ROLES,
  GRUPO_IDEIA_ORG_SLUG,
  rhIdeiaOrgGate,
  requireManage,
  requireValidate,
  applyCommonMiddleware,
  writeAudit,
  resolveRhIdeiaPermissions,
  resolveUserEstablishmentIds,
  assertOrgSlug,
};
