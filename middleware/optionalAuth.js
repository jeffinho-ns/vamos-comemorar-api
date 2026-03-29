const jwt = require('jsonwebtoken');
const SECRET_KEY = process.env.JWT_SECRET || 'chave_secreta';

/**
 * Se houver Bearer token válido, define req.user; caso contrário segue sem erro.
 */
function optionalAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) {
    return next();
  }
  jwt.verify(token, SECRET_KEY, (err, user) => {
    if (!err && user) {
      req.user = user;
    }
    next();
  });
}

module.exports = optionalAuth;
