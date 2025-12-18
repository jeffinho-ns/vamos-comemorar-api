// routes/eventos.js

const express = require('express');
const router = express.Router();
const authenticateToken = require('../middleware/auth');
const authorizeRoles = require('../middleware/authorize');
const EventosController = require('../controllers/EventosController');

module.exports = (pool, checkAndAwardPromoterGifts = null) => {
  const controller = new EventosController(pool, checkAndAwardPromoterGifts);

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
    authorizeRoles('admin', 'gerente', 'promoter', 'recepção'),
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
    authorizeRoles('admin', 'gerente', 'promoter', 'recepção'),
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
    authorizeRoles('admin', 'gerente', 'hostess', 'promoter', 'recepção'),
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
    authorizeRoles('admin', 'gerente', 'promoter', 'hostess', 'recepção'),
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

