// middleware/authorize.js

function authorizeRoles(...permittedRoles) {
    return (req, res, next) => {
      const user = req.user;
  
      if (!user) {
        return res.status(401).json({ message: 'Usuário não autenticado' });
      }
  
      if (!permittedRoles.includes(user.role)) {
        return res.status(403).json({ message: 'Acesso negado: permissão insuficiente' });
      }
  
      next(); // usuário tem permissão
    };
  }
  
  module.exports = authorizeRoles;
  