'use strict';

const authenticateToken = require('./auth');

/**
 * Exige JWT válido + users.is_super_admin (ou claim is_super_admin no token).
 */
async function requireSuperAdmin(req, res, next) {
  if (!req.user?.id) {
    return res.status(401).json({ success: false, error: 'Autenticação necessária.' });
  }

  if (req.user.is_super_admin === true) {
    return next();
  }

  const pool = req.app?.get?.('pool');
  if (!pool) {
    return res.status(500).json({ success: false, error: 'Pool indisponível.' });
  }

  try {
    const { rows } = await pool.query(
      `SELECT COALESCE(is_super_admin, FALSE) AS is_super_admin FROM users WHERE id = $1`,
      [req.user.id],
    );
    if (rows[0]?.is_super_admin) {
      req.user.is_super_admin = true;
      return next();
    }
  } catch (err) {
    console.error('[requireSuperAdmin] erro:', err.message);
    return res.status(500).json({ success: false, error: 'Falha ao validar super admin.' });
  }

  return res.status(403).json({ success: false, error: 'Acesso restrito a super admins.' });
}

function superAdminRouter(router) {
  router.use(authenticateToken);
  router.use(requireSuperAdmin);
  return router;
}

module.exports = { requireSuperAdmin, superAdminRouter };
