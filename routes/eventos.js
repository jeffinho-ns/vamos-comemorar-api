// routes/eventos.js

const express = require('express');
const router = express.Router();
const authenticateToken = require('../middleware/auth');
const authorizeRoles = require('../middleware/authorize');
const optionalAuth = require('../middleware/optionalAuth');
const tenantMiddleware = require('../tenancy/tenantMiddleware');
const requireModule = require('../tenancy/requireModule');
const requirePermission = require('../tenancy/requirePermission');
const { isSaasEnforced, isSaasObserving } = require('../tenancy/featureFlags');
const { resolveEntitlements, hasModule, hasPermission } = require('../tenancy/entitlements');
const EventosController = require('../controllers/EventosController');

function requireAnyModule(moduleKeys = []) {
  return async function anyModuleGate(req, res, next) {
    if (!isSaasEnforced() && !isSaasObserving()) return next();
    if (!req.user) return next();

    const pool = req.app && req.app.get ? req.app.get('pool') : null;
    if (!pool) {
      if (!isSaasEnforced()) return next();
      return res.status(500).json({ success: false, error: 'Pool indisponível.' });
    }

    try {
      const entitlements = req.entitlements || (await resolveEntitlements(pool, req.user));
      req.entitlements = entitlements;
      if (moduleKeys.some((moduleKey) => hasModule(entitlements, moduleKey))) {
        return next();
      }
    } catch (err) {
      console.error('[eventos:anyModule] erro:', err.message);
      if (!isSaasEnforced()) return next();
      return res.status(500).json({ success: false, error: 'Falha ao validar módulo.' });
    }

    if (isSaasObserving()) {
      console.warn(
        `[module:observe] BLOQUEARIA modulos='${moduleKeys.join('|')}' user=${req.user.id} ` +
          `rota=${req.method} ${req.originalUrl}`,
      );
      return next();
    }
    return res.status(403).json({ success: false, error: 'Módulo não contratado.' });
  };
}

function requireAnyPermission(permissionKeys = []) {
  return async function anyPermissionGate(req, res, next) {
    if (!isSaasEnforced() && !isSaasObserving()) return next();
    if (!req.user) return next();

    const pool = req.app && req.app.get ? req.app.get('pool') : null;
    if (!pool) {
      if (!isSaasEnforced()) return next();
      return res.status(500).json({ success: false, error: 'Pool indisponível.' });
    }

    try {
      const entitlements = req.entitlements || (await resolveEntitlements(pool, req.user));
      req.entitlements = entitlements;
      if (permissionKeys.some((permissionKey) => hasPermission(entitlements, permissionKey))) {
        return next();
      }
    } catch (err) {
      console.error('[eventos:anyPermission] erro:', err.message);
      if (!isSaasEnforced()) return next();
      return res.status(500).json({ success: false, error: 'Falha ao validar permissão.' });
    }

    if (isSaasObserving()) {
      console.warn(
        `[permission:observe] BLOQUEARIA perms='${permissionKeys.join('|')}' user=${req.user.id} ` +
          `rota=${req.method} ${req.originalUrl}`,
      );
      return next();
    }
    return res.status(403).json({ success: false, error: 'Sem permissão para eventos/check-in.' });
  };
}

module.exports = (pool, checkAndAwardPromoterGifts = null) => {
  const controller = new EventosController(pool, checkAndAwardPromoterGifts);
  router.use(optionalAuth);
  router.use(tenantMiddleware());
  router.use((req, res, next) => {
    if (req.method === 'GET') {
      return requireAnyModule(['eventos', 'checkin'])(req, res, next);
    }
    return requireModule('eventos')(req, res, next);
  });
  router.use((req, res, next) => {
    if (!req.user) return next();
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
      return requirePermission('eventos:update')(req, res, next);
    }
    return requireAnyPermission(['eventos:read', 'checkin:read'])(req, res, next);
  });

  /**
   * @route   GET /api/v1/eventos/todos
   * @desc    Lista TODOS os eventos para habilitar uso com listas
   * @access  Private (Admin, Gerente)
   */
  router.get(
    '/todos',
    authenticateToken,
    authorizeRoles('admin', 'gerente'),
    (req, res) => controller.getTodosEventos(req, res)
  );

  /**
   * @route   GET /api/v1/eventos/dashboard
   * @desc    Retorna dados consolidados para o dashboard de eventos
   * @access  Private (Admin, Gerente, Promoter)
   */
  router.get(
    '/dashboard',
    authenticateToken,
    authorizeRoles('admin', 'gerente', 'promoter'),
    (req, res) => controller.getDashboard(req, res)
  );

  /**
   * @route   GET /api/v1/eventos
   * @desc    Lista todos os eventos com filtros opcionais
   * @access  Private (Admin, Gerente, Promoter, Recepção)
   */
  router.get(
    '/',
    authenticateToken,
    authorizeRoles('admin', 'gerente', 'promoter', 'recepção', 'recepcao', 'atendente'),
    (req, res) => controller.getEventos(req, res)
  );

  /**
   * @route   GET /api/v1/eventos/:eventoId
   * @desc    Busca um evento específico com detalhes
   * @access  Private (Admin, Gerente, Promoter, Recepção)
   */
  router.get(
    '/:eventoId',
    authenticateToken,
    authorizeRoles('admin', 'gerente', 'promoter', 'recepção', 'recepcao', 'atendente'),
    (req, res) => controller.getEvento(req, res)
  );

  /**
   * @route   POST /api/v1/eventos
   * @desc    Cria um novo evento
   * @access  Private (Admin, Gerente)
   */
  router.post(
    '/',
    authenticateToken,
    authorizeRoles('admin', 'gerente'),
    (req, res) => controller.createEvento(req, res)
  );

  /**
   * @route   PUT /api/v1/eventos/:eventoId
   * @desc    Atualiza um evento existente
   * @access  Private (Admin, Gerente)
   */
  router.put(
    '/:eventoId',
    authenticateToken,
    authorizeRoles('admin', 'gerente'),
    (req, res) => controller.updateEvento(req, res)
  );

  /**
   * @route   PUT /api/v1/eventos/:eventoId/habilitar-listas
   * @desc    Habilita/desabilita evento para usar sistema de listas
   * @access  Private (Admin, Gerente)
   */
  router.put(
    '/:eventoId/habilitar-listas',
    authenticateToken,
    authorizeRoles('admin', 'gerente'),
    (req, res) => controller.habilitarParaListas(req, res)
  );

  /**
   * @route   GET /api/v1/eventos/:eventoId/listas
   * @desc    Retorna todas as listas de um evento e seus convidados
   * @access  Private (Admin, Gerente, Promoter)
   */
  router.get(
    '/:eventoId/listas',
    authenticateToken,
    authorizeRoles('admin', 'gerente', 'promoter'),
    (req, res) => controller.getListasEvento(req, res)
  );

  /**
   * @route   POST /api/v1/listas
   * @desc    Cria uma nova lista para um evento
   * @access  Private (Admin, Gerente, Promoter)
   */
  router.post(
    '/listas',
    authenticateToken,
    authorizeRoles('admin', 'gerente', 'promoter'),
    (req, res) => controller.createLista(req, res)
  );

  /**
   * @route   GET /api/v1/listas/:listaId/detalhes
   * @desc    Retorna detalhes completos de uma lista com convidados
   * @access  Private (Admin, Gerente, Promoter)
   */
  router.get(
    '/listas/:listaId/detalhes',
    authenticateToken,
    authorizeRoles('admin', 'gerente', 'promoter'),
    (req, res) => controller.getDetalhesLista(req, res)
  );

  /**
   * @route   POST /api/v1/listas/:listaId/convidado
   * @desc    Adiciona um convidado a uma lista (reutiliza estrutura de walk-ins)
   * @access  Private (Admin, Gerente, Promoter)
   */
  router.post(
    '/listas/:listaId/convidado',
    authenticateToken,
    authorizeRoles('admin', 'gerente', 'promoter'),
    (req, res) => controller.addConvidado(req, res)
  );

  /**
   * @route   GET /api/v1/eventos/:eventoId/checkins
   * @desc    Retorna check-ins consolidados de um evento (reservas, promoters, camarotes)
   * @access  Private (Admin, Gerente, Hostess, Promoter, Recepção)
   */
  router.get(
    '/:eventoId/checkins',
    authenticateToken,
    authorizeRoles('admin', 'gerente', 'hostess', 'promoter', 'recepção', 'recepcao', 'atendente'),
    (req, res) => controller.getCheckinsConsolidados(req, res)
  );

  /**
   * @route   PUT /api/v1/checkin/:listaConvidadoId
   * @desc    Atualiza o status de check-in de um convidado
   * @access  Private (Admin, Gerente, Promoter, Hostess, Recepção)
   */
  router.put(
    '/checkin/:listaConvidadoId',
    authenticateToken,
    authorizeRoles('admin', 'gerente', 'promoter', 'hostess', 'recepção', 'recepcao', 'atendente'),
    (req, res) => controller.updateCheckin(req, res)
  );

  /**
   * @route   GET /api/v1/promoters
   * @desc    Lista promoters com estatísticas de check-ins
   * @access  Private (Admin, Gerente)
   */
  router.get(
    '/promoters',
    authenticateToken,
    authorizeRoles('admin', 'gerente'),
    (req, res) => controller.getPromoters(req, res)
  );

  /**
   * @route   GET /api/v1/hostess
   * @desc    Lista hostess com filtros opcionais
   * @access  Private (Admin, Gerente)
   */
  router.get(
    '/hostess',
    authenticateToken,
    authorizeRoles('admin', 'gerente'),
    (req, res) => controller.getHostess(req, res)
  );

  /**
   * @route   GET /api/v1/beneficios
   * @desc    Lista benefícios disponíveis
   * @access  Private (Admin, Gerente, Promoter)
   */
  router.get(
    '/beneficios',
    authenticateToken,
    authorizeRoles('admin', 'gerente', 'promoter'),
    (req, res) => controller.getBeneficios(req, res)
  );

  return router;
};

