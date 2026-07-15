'use strict';

/**
 * Verifica se o acesso de um usuário deve ser bloqueado por suspensão da organização.
 *
 * Regras:
 * - Super admin nunca é bloqueado.
 * - Bloqueia se `users.organization_id` aponta para organização com status 'suspended'.
 * - Bloqueia se o usuário tem ao menos um membership ativo e TODAS as organizações
 *   desses memberships estão suspensas (uma org ativa é suficiente para liberar).
 * - Tolerante a falha: qualquer erro (ex.: tabela inexistente) libera o login e loga warn.
 */
async function isUserOrganizationSuspended(pool, userId) {
  try {
    const userRes = await pool.query(
      `SELECT organization_id, COALESCE(is_super_admin, FALSE) AS is_super_admin
         FROM users
        WHERE id = $1`,
      [userId],
    );
    if (!userRes.rows.length) return false;

    const user = userRes.rows[0];
    if (user.is_super_admin) return false;

    if (user.organization_id) {
      const orgRes = await pool.query(
        `SELECT status FROM meu_backup_db.organizations WHERE id = $1`,
        [user.organization_id],
      );
      if (orgRes.rows.length && orgRes.rows[0].status === 'suspended') {
        return true;
      }
    }

    const membershipRes = await pool.query(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE o.status = 'suspended')::int AS suspended
         FROM meu_backup_db.memberships m
         JOIN meu_backup_db.organizations o ON o.id = m.organization_id
        WHERE m.user_id = $1
          AND m.is_active = TRUE`,
      [userId],
    );
    const { total, suspended } = membershipRes.rows[0] || { total: 0, suspended: 0 };
    return Number(total) > 0 && Number(suspended) === Number(total);
  } catch (err) {
    console.warn(
      `[organizationSuspension] Falha ao verificar suspensão do usuário ${userId}; liberando login:`,
      err.message,
    );
    return false;
  }
}

module.exports = { isUserOrganizationSuspended };
