const express = require('express');
const router = express.Router();
const authenticateToken = require('../middleware/auth');
const { logAction } = require('../middleware/actionLogger');

module.exports = (pool) => {
  /**
   * @route   POST /api/action-logs
   * @desc    Registra uma nova ação do usuário
   * @access  Private
   */
  router.post('/', authenticateToken, async (req, res) => {
    try {
      const {
        actionType,
        actionDescription,
        resourceType,
        resourceId,
        establishmentId,
        establishmentName,
        status,
        additionalData
      } = req.body;

      // Validações básicas
      if (!actionType || !actionDescription) {
        return res.status(400).json({
          success: false,
          error: 'actionType e actionDescription são obrigatórios'
        });
      }

      // Extrai informações do usuário autenticado
      const ipAddress = req.ip || req.connection.remoteAddress;
      const userAgent = req.get('user-agent');

      // Busca informações completas do usuário
      const [users] = await pool.execute(
        'SELECT id, name, email, role FROM users WHERE id = ?',
        [req.user.id]
      );

      if (users.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Usuário não encontrado'
        });
      }

      const user = users[0];

      // Registra a ação
      await logAction(pool, {
        userId: user.id,
        userName: user.name,
        userEmail: user.email,
        userRole: user.role,
        actionType,
        actionDescription,
        resourceType,
        resourceId,
        establishmentId,
        establishmentName,
        ipAddress,
        userAgent,
        requestMethod: req.method,
        requestUrl: req.originalUrl,
        status: status || 'success',
        additionalData
      });

      res.status(201).json({
        success: true,
        message: 'Ação registrada com sucesso'
      });

    } catch (error) {
      console.error('Erro ao registrar ação:', error);
      res.status(500).json({
        success: false,
        error: 'Erro ao registrar ação'
      });
    }
  });

  /**
   * @route   GET /api/action-logs
   * @desc    Busca logs de ações com filtros
   * @access  Private (Admin only)
   */
  router.get('/', authenticateToken, async (req, res) => {
    try {
      // Verifica se o usuário é admin
      if (req.user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          error: 'Acesso negado. Apenas administradores podem visualizar os logs.'
        });
      }

      const {
        userId,
        userRole,
        actionType,
        resourceType,
        establishmentId,
        startDate,
        endDate,
        limit = 100,
        offset = 0,
        search
      } = req.query;

      // Constrói a query dinamicamente baseado nos filtros
      let query = `
        SELECT 
          id,
          user_id,
          user_name,
          user_email,
          user_role,
          action_type,
          action_description,
          resource_type,
          resource_id,
          establishment_id,
          establishment_name,
          ip_address,
          user_agent,
          request_method,
          request_url,
          status,
          additional_data,
          created_at
        FROM action_logs
        WHERE 1=1
      `;

      const params = [];

      // Filtro por usuário
      if (userId) {
        query += ' AND user_id = ?';
        params.push(userId);
      }

      // Filtro por role
      if (userRole) {
        query += ' AND user_role = ?';
        params.push(userRole);
      }

      // Filtro por tipo de ação
      if (actionType) {
        query += ' AND action_type = ?';
        params.push(actionType);
      }

      // Filtro por tipo de recurso
      if (resourceType) {
        query += ' AND resource_type = ?';
        params.push(resourceType);
      }

      // Filtro por estabelecimento
      if (establishmentId) {
        query += ' AND establishment_id = ?';
        params.push(establishmentId);
      }

      // Filtro por data inicial
      if (startDate) {
        query += ' AND created_at >= ?';
        params.push(startDate);
      }

      // Filtro por data final
      if (endDate) {
        query += ' AND created_at <= ?';
        params.push(endDate);
      }

      // Busca textual
      if (search) {
        query += ' AND (user_name LIKE ? OR user_email LIKE ? OR action_description LIKE ?)';
        const searchTerm = `%${search}%`;
        params.push(searchTerm, searchTerm, searchTerm);
      }

      // Ordenação e paginação
      query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
      params.push(parseInt(limit), parseInt(offset));

      // Executa a query
      const [logs] = await pool.execute(query, params);

      // Query para contar total de registros (sem paginação)
      let countQuery = `SELECT COUNT(*) as total FROM action_logs WHERE 1=1`;
      const countParams = [];

      if (userId) {
        countQuery += ' AND user_id = ?';
        countParams.push(userId);
      }
      if (userRole) {
        countQuery += ' AND user_role = ?';
        countParams.push(userRole);
      }
      if (actionType) {
        countQuery += ' AND action_type = ?';
        countParams.push(actionType);
      }
      if (resourceType) {
        countQuery += ' AND resource_type = ?';
        countParams.push(resourceType);
      }
      if (establishmentId) {
        countQuery += ' AND establishment_id = ?';
        countParams.push(establishmentId);
      }
      if (startDate) {
        countQuery += ' AND created_at >= ?';
        countParams.push(startDate);
      }
      if (endDate) {
        countQuery += ' AND created_at <= ?';
        countParams.push(endDate);
      }
      if (search) {
        countQuery += ' AND (user_name LIKE ? OR user_email LIKE ? OR action_description LIKE ?)';
        const searchTerm = `%${search}%`;
        countParams.push(searchTerm, searchTerm, searchTerm);
      }

      const [countResult] = await pool.execute(countQuery, countParams);
      const total = countResult[0].total;

      // Parse additional_data JSON
      const logsWithParsedData = logs.map(log => ({
        ...log,
        additional_data: log.additional_data ? JSON.parse(log.additional_data) : null
      }));

      res.json({
        success: true,
        logs: logsWithParsedData,
        pagination: {
          total,
          limit: parseInt(limit),
          offset: parseInt(offset),
          hasMore: (parseInt(offset) + parseInt(limit)) < total
        }
      });

    } catch (error) {
      console.error('Erro ao buscar logs:', error);
      res.status(500).json({
        success: false,
        error: 'Erro ao buscar logs'
      });
    }
  });

  /**
   * @route   GET /api/action-logs/stats
   * @desc    Retorna estatísticas dos logs
   * @access  Private (Admin only)
   */
  router.get('/stats', authenticateToken, async (req, res) => {
    try {
      // Verifica se o usuário é admin
      if (req.user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          error: 'Acesso negado. Apenas administradores podem visualizar estatísticas.'
        });
      }

      const { startDate, endDate } = req.query;

      let dateFilter = '';
      const params = [];

      if (startDate) {
        dateFilter += ' AND created_at >= ?';
        params.push(startDate);
      }
      if (endDate) {
        dateFilter += ' AND created_at <= ?';
        params.push(endDate);
      }

      // Total de ações
      const [totalActions] = await pool.execute(
        `SELECT COUNT(*) as total FROM action_logs WHERE 1=1 ${dateFilter}`,
        params
      );

      // Ações por tipo
      const [actionsByType] = await pool.execute(
        `SELECT action_type, COUNT(*) as count 
         FROM action_logs 
         WHERE 1=1 ${dateFilter}
         GROUP BY action_type 
         ORDER BY count DESC`,
        params
      );

      // Ações por role
      const [actionsByRole] = await pool.execute(
        `SELECT user_role, COUNT(*) as count 
         FROM action_logs 
         WHERE 1=1 ${dateFilter}
         GROUP BY user_role 
         ORDER BY count DESC`,
        params
      );

      // Top usuários mais ativos
      const [topUsers] = await pool.execute(
        `SELECT user_name, user_email, user_role, COUNT(*) as count 
         FROM action_logs 
         WHERE 1=1 ${dateFilter}
         GROUP BY user_id, user_name, user_email, user_role 
         ORDER BY count DESC 
         LIMIT 10`,
        params
      );

      // Ações recentes (últimas 24h)
      const [recentActions] = await pool.execute(
        `SELECT COUNT(*) as count 
         FROM action_logs 
         WHERE created_at >= NOW() - INTERVAL 24 HOUR`
      );

      res.json({
        success: true,
        stats: {
          totalActions: totalActions[0].total,
          recentActions24h: recentActions[0].count,
          actionsByType,
          actionsByRole,
          topUsers
        }
      });

    } catch (error) {
      console.error('Erro ao buscar estatísticas:', error);
      res.status(500).json({
        success: false,
        error: 'Erro ao buscar estatísticas'
      });
    }
  });

  /**
   * @route   GET /api/action-logs/users
   * @desc    Lista todos os usuários que têm logs (para filtro)
   * @access  Private (Admin only)
   */
  router.get('/users', authenticateToken, async (req, res) => {
    try {
      if (req.user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          error: 'Acesso negado'
        });
      }

      const [users] = await pool.execute(`
        SELECT DISTINCT user_id, user_name, user_email, user_role
        FROM action_logs
        ORDER BY user_name
      `);

      res.json({
        success: true,
        users
      });

    } catch (error) {
      console.error('Erro ao buscar usuários:', error);
      res.status(500).json({
        success: false,
        error: 'Erro ao buscar usuários'
      });
    }
  });

  return router;
};


