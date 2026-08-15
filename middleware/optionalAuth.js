'use strict';

const jwt = require('jsonwebtoken');
const SECRET_KEY = process.env.JWT_SECRET || 'chave_secreta';

/**
 * Autenticação opcional: se houver Bearer válido, popula req.user;
 * se não houver token (ou for inválido), segue anônimo.
 */
function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization || req.headers.Authorization;
  const token =
    authHeader && String(authHeader).startsWith('Bearer ')
      ? String(authHeader).slice(7).trim()
      : null;

  if (!token) return next();

  jwt.verify(token, SECRET_KEY, (err, user) => {
    if (!err && user) req.user = user;
    next();
  });
}

module.exports = optionalAuth;
