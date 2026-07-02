'use strict';

const jwt = require('jsonwebtoken');
const { buildTokenPayload } = require('../tenancy/jwtClaims');
const { logAction } = require('../middleware/actionLogger');

const SECRET_KEY = process.env.JWT_SECRET || 'chave_secreta';

async function listImpersonationCandidates(pool, { organizationId, search } = {}) {
  const params = [];
  let where = `WHERE COALESCE(u.is_super_admin, FALSE) = FALSE`;

  if (organizationId) {
    params.push(Number(organizationId));
    where += ` AND (
      EXISTS (
        SELECT 1 FROM meu_backup_db.memberships m
         WHERE m.user_id = u.id AND m.organization_id = $${params.length} AND m.is_active = TRUE
      )
      OR EXISTS (
        SELECT 1 FROM user_establishment_permissions uep
         JOIN meu_backup_db.establishments e ON e.legacy_place_id = uep.establishment_id
            OR e.legacy_bar_id = uep.establishment_id
         WHERE uep.user_id = u.id AND e.organization_id = $${params.length}
      )
    )`;
  }

  if (search) {
    params.push(`%${String(search).trim().toLowerCase()}%`);
    where += ` AND (LOWER(u.email) LIKE $${params.length} OR LOWER(u.name) LIKE $${params.length})`;
  }

  const { rows } = await pool.query(
    `SELECT u.id, u.name, u.email, u.role
       FROM users u
      ${where}
      ORDER BY u.name
      LIMIT 50`,
    params,
  );
  return rows;
}

async function startImpersonation(pool, adminUser, targetUserId, meta = {}) {
  const targetRes = await pool.query(
    `SELECT id, name, email, role, COALESCE(is_super_admin, FALSE) AS is_super_admin
       FROM users WHERE id = $1`,
    [targetUserId],
  );
  if (!targetRes.rows.length) throw new Error('Usuário alvo não encontrado.');
  const target = targetRes.rows[0];
  if (target.is_super_admin) throw new Error('Não é permitido impersonar outro super admin.');
  if (Number(target.id) === Number(adminUser.id)) {
    throw new Error('Você já está logado como este usuário.');
  }

  const adminRes = await pool.query(
    `SELECT id, name, email, role, COALESCE(is_super_admin, FALSE) AS is_super_admin
       FROM users WHERE id = $1`,
    [adminUser.id],
  );
  const admin = adminRes.rows[0];
  if (!admin?.is_super_admin) throw new Error('Apenas super admins podem impersonar.');

  const payload = await buildTokenPayload(pool, target, {
    impersonator_id: admin.id,
    impersonator_email: admin.email,
    impersonator_name: admin.name,
  });

  const token = jwt.sign(payload, SECRET_KEY, { expiresIn: '4h' });

  await logAction(pool, {
    userId: admin.id,
    userName: admin.name || admin.email,
    userEmail: admin.email,
    userRole: admin.role || 'admin',
    actionType: 'superadmin_impersonate_start',
    actionDescription: `Super admin impersonou ${target.name || target.email} (id ${target.id})`,
    resourceType: 'user',
    resourceId: target.id,
    ipAddress: meta.ipAddress || null,
    userAgent: meta.userAgent || null,
    requestMethod: meta.requestMethod || 'POST',
    requestUrl: meta.requestUrl || null,
    status: 'success',
    additionalData: {
      targetUserId: target.id,
      targetEmail: target.email,
      targetRole: target.role,
    },
  });

  return {
    token,
    user: {
      id: target.id,
      name: target.name,
      email: target.email,
      role: target.role,
    },
    impersonator: {
      id: admin.id,
      name: admin.name,
      email: admin.email,
    },
  };
}

async function endImpersonation(pool, currentUser, meta = {}) {
  const impersonatorId = currentUser?.impersonator_id;
  if (!impersonatorId) throw new Error('Sessão não está em modo impersonate.');

  const adminRes = await pool.query(
    `SELECT id, name, email, role, COALESCE(is_super_admin, FALSE) AS is_super_admin
       FROM users WHERE id = $1`,
    [impersonatorId],
  );
  if (!adminRes.rows.length || !adminRes.rows[0].is_super_admin) {
    throw new Error('Super admin original não encontrado.');
  }
  const admin = adminRes.rows[0];

  const payload = await buildTokenPayload(pool, admin);
  const token = jwt.sign(payload, SECRET_KEY, { expiresIn: '7d' });

  await logAction(pool, {
    userId: admin.id,
    userName: admin.name || admin.email,
    userEmail: admin.email,
    userRole: admin.role || 'admin',
    actionType: 'superadmin_impersonate_end',
    actionDescription: `Super admin encerrou impersonate de ${currentUser.email || currentUser.id}`,
    resourceType: 'user',
    resourceId: currentUser.id,
    ipAddress: meta.ipAddress || null,
    userAgent: meta.userAgent || null,
    requestMethod: meta.requestMethod || 'POST',
    requestUrl: meta.requestUrl || null,
    status: 'success',
    additionalData: {
      impersonatedUserId: currentUser.id,
      impersonatedEmail: currentUser.email,
    },
  });

  return {
    token,
    user: {
      id: admin.id,
      name: admin.name,
      email: admin.email,
      role: admin.role,
      is_super_admin: true,
    },
  };
}

module.exports = {
  listImpersonationCandidates,
  startImpersonation,
  endImpersonation,
};
