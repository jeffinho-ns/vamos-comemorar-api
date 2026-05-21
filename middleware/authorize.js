// middleware/authorize.js

function normalizeRoleKey(role) {
  return String(role || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function authorizeRoles(...permittedRoles) {
  const permittedNormalized = new Set(
    permittedRoles.map((role) => normalizeRoleKey(role))
  );

  return (req, res, next) => {
    const user = req.user;

    if (!user) {
      return res.status(401).json({ message: 'Usuário não autenticado' });
    }

    const userRole = user.role;
    const userRoleNorm = normalizeRoleKey(userRole);

    const isPromoterListAllowed =
      userRole === 'promoter-list' &&
      (permittedRoles.includes('promoter') ||
        permittedNormalized.has('promoter'));

    if (!permittedNormalized.has(userRoleNorm) && !isPromoterListAllowed) {
      return res.status(403).json({ message: 'Acesso negado: permissão insuficiente' });
    }

    next(); // usuário tem permissão
  };
}

module.exports = authorizeRoles;