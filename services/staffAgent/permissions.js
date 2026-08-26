'use strict';

/**
 * Autorização por tool do Staff Agent (role + UEP da casa).
 */

const { getPhase1ToolByName } = require('./phase1ToolCatalog');

const ADMIN_ROLES = new Set([
  'admin',
  'administrador',
  'gerente',
  'account_admin',
  'recepcao',
  'recepção',
  'atendente',
  'hostess',
]);

function normalizeRole(role) {
  return String(role || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

async function loadUepRow(pool, userId, establishmentId) {
  const { rows } = await pool.query(
    `SELECT *
       FROM user_establishment_permissions
      WHERE user_id = $1
        AND establishment_id = $2
        AND COALESCE(is_active, TRUE) = TRUE
      LIMIT 1`,
    [userId, establishmentId]
  );
  return rows[0] || null;
}

function hasMinRole(userRole, minRoles) {
  if (!Array.isArray(minRoles) || minRoles.length === 0) return true;
  const role = normalizeRole(userRole);
  if (role === 'admin' || role === 'administrador' || role === 'account_admin') return true;
  if (userRole && String(userRole).includes('super')) return true;
  return minRoles.some((r) => normalizeRole(r) === role);
}

function uepAllows(uep, minUepAny) {
  if (!Array.isArray(minUepAny) || minUepAny.length === 0) return true;
  if (!uep) return false;
  return minUepAny.some((flag) => Boolean(uep[flag]));
}

/**
 * Admin/gerente/superadmin: liberado se role ok.
 * Demais: precisam de UEP compatível na casa.
 */
async function assertCanUseTool(pool, { user, establishmentId, toolName }) {
  const tool = getPhase1ToolByName(toolName);
  if (!tool) {
    const err = new Error(`Tool desconhecida: ${toolName}`);
    err.code = 'unknown_tool';
    throw err;
  }

  const role = user?.role || user?.userRole;
  const isPrivileged =
    normalizeRole(role) === 'admin' ||
    normalizeRole(role) === 'administrador' ||
    normalizeRole(role) === 'gerente' ||
    normalizeRole(role) === 'account_admin' ||
    Boolean(user?.is_super_admin || user?.isSuperAdmin);

  if (!hasMinRole(role, tool.minRoles) && !isPrivileged) {
    const err = new Error('Seu cargo não pode usar esta ação.');
    err.code = 'forbidden_role';
    throw err;
  }

  if (isPrivileged) {
    return { tool, uep: null, privileged: true };
  }

  const uep = await loadUepRow(pool, user.id || user.userId, establishmentId);
  if (!uepAllows(uep, tool.minUepAny)) {
    const err = new Error('Sem permissão nesta casa para esta ação.');
    err.code = 'forbidden_uep';
    throw err;
  }

  return { tool, uep, privileged: false };
}

function isStaffRole(role) {
  const n = normalizeRole(role);
  return ADMIN_ROLES.has(n) || n.includes('admin') || n.includes('gerente');
}

module.exports = {
  assertCanUseTool,
  isStaffRole,
  loadUepRow,
  normalizeRole,
};
