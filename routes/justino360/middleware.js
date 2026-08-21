'use strict';

const auth = require('../../middleware/auth');
const authorize = require('../../middleware/authorize');
const requireModule = require('../../tenancy/requireModule');
const {
  parseEstablishmentId,
  assertJustinoEstablishment,
  SEU_JUSTINO_ESTABLISHMENT_ID,
} = require('../../validators/justino360Validator');

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

function normalizeRole(user) {
  return String(user?.role || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

const DENIED = { access: false, manage: false, validate: false };

/**
 * Resolve acesso/gestão/validação em UMA query.
 * Admin e Super Admin passam direto; qualquer outro papel exige UEP ativa
 * no estabelecimento do Justino — inclusive gerente (sem UEP, nega).
 */
async function resolveJustinoPermissions(pool, user, establishmentId) {
  if (!user) return DENIED;

  const role = normalizeRole(user);
  if (user.is_super_admin === true || SUPER_ROLES.includes(role)) {
    return { access: true, manage: true, validate: true };
  }

  const userId = user.id || user.userId || null;
  const email = user.email || user.userEmail || '';
  if (!userId && !email) return DENIED;

  const { rows } = await pool.query(
    `SELECT can_access_justino360, can_manage_justino360, can_validate_justino360
       FROM user_establishment_permissions
      WHERE establishment_id = $1
        AND is_active = TRUE
        AND (($2::int IS NOT NULL AND user_id = $2::int)
             OR ($3 <> '' AND LOWER(user_email) = LOWER($3)))
      ORDER BY can_manage_justino360 DESC NULLS LAST, id DESC
      LIMIT 1`,
    [establishmentId, userId, email]
  );

  const row = rows[0];
  if (!row) return DENIED;

  // Gerência da casa administra o módulo; equipe depende das flags explícitas.
  const isGestor = GESTOR_ROLES.includes(role);
  const manage = Boolean(row.can_manage_justino360) || isGestor;

  return {
    access: manage || Boolean(row.can_access_justino360),
    manage,
    validate: manage || Boolean(row.can_validate_justino360),
  };
}

function resolveEstablishmentId(req) {
  return (
    parseEstablishmentId(req.query.establishment_id) ||
    parseEstablishmentId(req.body?.establishment_id) ||
    parseEstablishmentId(req.params.establishmentId) ||
    SEU_JUSTINO_ESTABLISHMENT_ID
  );
}

function justinoGate(pool) {
  return async function gate(req, res, next) {
    const establishmentId = resolveEstablishmentId(req);
    const assert = assertJustinoEstablishment(establishmentId);
    if (!assert.ok) {
      return res.status(assert.status).json({ success: false, message: assert.message });
    }
    req.j360EstablishmentId = establishmentId;

    try {
      const perms = await resolveJustinoPermissions(pool, req.user, establishmentId);
      if (!perms.access) {
        console.warn(
          `[justino360] acesso negado establishment_id=${establishmentId} ` +
            `user=${req.user?.id || req.user?.userId || 'anon'} rota=${req.method} ${req.originalUrl}`
        );
        return res.status(403).json({
          success: false,
          message: 'Sem permissão para acessar o Justino360.',
        });
      }
      req.j360CanManage = perms.manage;
      req.j360CanValidate = perms.validate;
      return next();
    } catch (err) {
      console.error(
        `[justino360] gate establishment_id=${establishmentId} ` +
          `user=${req.user?.id || req.user?.userId || 'anon'}: ${err.message}`
      );
      return res.status(500).json({ success: false, message: 'Falha ao validar acesso.' });
    }
  };
}

function requireManage(req, res, next) {
  if (req.j360CanManage) return next();
  return res.status(403).json({ success: false, message: 'Permissão de gestão necessária.' });
}

function requireValidate(req, res, next) {
  if (req.j360CanValidate || req.j360CanManage) return next();
  return res.status(403).json({ success: false, message: 'Permissão de validação necessária.' });
}

async function writeAudit(pool, { establishmentId, entityType, entityId, action, actorUserId, payload }) {
  try {
    await pool.query(
      `INSERT INTO j360_audit_log (establishment_id, entity_type, entity_id, action, actor_user_id, payload)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [establishmentId, entityType, entityId || null, action, actorUserId || null, payload ? JSON.stringify(payload) : null]
    );
  } catch (err) {
    console.error('[justino360] audit:', err.message);
  }
}

function applyCommonMiddleware(router, pool) {
  router.use(auth);
  router.use(authorize(...ALLOWED_ROLES));
  router.use(requireModule('justino360'));
  router.use(justinoGate(pool));
}

module.exports = {
  ALLOWED_ROLES,
  justinoGate,
  requireManage,
  requireValidate,
  applyCommonMiddleware,
  writeAudit,
  resolveEstablishmentId,
  resolveJustinoPermissions,
};
