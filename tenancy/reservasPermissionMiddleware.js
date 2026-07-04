'use strict';

/**
 * Middleware RBAC para rotas do módulo reservas.
 * Anônimo (formulário público /reservar) passa direto; autenticado exige permissão fina.
 */

const requirePermission = require('./requirePermission');

function permissionForMethod(method) {
  if (method === 'POST') return 'reservas:create';
  if (method === 'DELETE') return 'reservas:delete';
  if (method === 'PUT' || method === 'PATCH') return 'reservas:update';
  return 'reservas:read';
}

function reservasPermissionMiddleware(req, res, next) {
  if (!req.user) return next();
  return requirePermission(permissionForMethod(req.method))(req, res, next);
}

module.exports = reservasPermissionMiddleware;
module.exports.permissionForMethod = permissionForMethod;
