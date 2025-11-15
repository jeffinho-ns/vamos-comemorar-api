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
      const usersResult = await pool.query(
        'SELECT id, name, email, role FROM users WHERE id = $1',
        [req.user.id]
      );

      if (usersResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Usuário não encontrado'
        });
      }

      const user = usersResult.rows[0];

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
      let paramIndex = 1;

      // Filtro por usuário
      if (userId) {
        query += ` AND user_id = $${paramIndex++}`;
        params.push(userId);
      }

      // Filtro por role (aceita múltiplos valores separados por vírgula)
      if (userRole) {
        const roles = userRole.split(',').map(r => r.trim());
        if (roles.length === 1) {
          query += ` AND user_role = $${paramIndex++}`;
          params.push(roles[0]);
        } else {
          const placeholders = roles.map((_, i) => `$${paramIndex + i}`).join(',');
          query += ` AND user_role IN (${placeholders})`;
          params.push(...roles);
          paramIndex += roles.length;
        }
      }

      // Filtro por tipo de ação
      if (actionType) {
        query += ` AND action_type = $${paramIndex++}`;
        params.push(actionType);
      }

      // Filtro por tipo de recurso
      if (resourceType) {
        query += ` AND resource_type = $${paramIndex++}`;
        params.push(resourceType);
      }

      // Filtro por estabelecimento
      if (establishmentId) {
        query += ` AND establishment_id = $${paramIndex++}`;
        params.push(establishmentId);
      }

      // Filtro por data inicial
      if (startDate) {
        query += ` AND created_at >= $${paramIndex++}`;
        params.push(startDate);
      }

      // Filtro por data final
      if (endDate) {
        query += ` AND created_at <= $${paramIndex++}`;
        params.push(endDate);
      }

      // Busca textual
      if (search) {
        query += ` AND (user_name ILIKE $${paramIndex++} OR user_email ILIKE $${paramIndex++} OR action_description ILIKE $${paramIndex++})`;
        const searchTerm = `%${search}%`;
        params.push(searchTerm, searchTerm, searchTerm);
      }

      // Ordenação e paginação
      query += ` ORDER BY created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
      params.push(parseInt(limit), parseInt(offset));

      // Executa a query
      const logsResult = await pool.query(query, params);

      // Query para contar total de registros (sem paginação)
      let countQuery = `SELECT COUNT(*) as total FROM action_logs WHERE 1=1`;
      const countParams = [];
      let countParamIndex = 1;

      if (userId) {
        countQuery += ` AND user_id = $${countParamIndex++}`;
        countParams.push(userId);
      }
      if (userRole) {
        const roles = userRole.split(',').map(r => r.trim());
        if (roles.length === 1) {
          countQuery += ` AND user_role = $${countParamIndex++}`;
          countParams.push(roles[0]);
        } else {
          const placeholders = roles.map((_, i) => `$${countParamIndex + i}`).join(',');
          countQuery += ` AND user_role IN (${placeholders})`;
          countParams.push(...roles);
          countParamIndex += roles.length;
        }
      }
      if (actionType) {
        countQuery += ` AND action_type = $${countParamIndex++}`;
        countParams.push(actionType);
      }
      if (resourceType) {
        countQuery += ` AND resource_type = $${countParamIndex++}`;
        countParams.push(resourceType);
      }
      if (establishmentId) {
        countQuery += ` AND establishment_id = $${countParamIndex++}`;
        countParams.push(establishmentId);
      }
      if (startDate) {
        countQuery += ` AND created_at >= $${countParamIndex++}`;
        countParams.push(startDate);
      }
      if (endDate) {
        countQuery += ` AND created_at <= $${countParamIndex++}`;
        countParams.push(endDate);
      }
      if (search) {
        countQuery += ` AND (user_name ILIKE $${countParamIndex++} OR user_email ILIKE $${countParamIndex++} OR action_description ILIKE $${countParamIndex++})`;
        const searchTerm = `%${search}%`;
        countParams.push(searchTerm, searchTerm, searchTerm);
      }

      const countResult = await pool.query(countQuery, countParams);
      const total = parseInt(countResult.rows[0].total);

      // Parse additional_data JSON
      const logsWithParsedData = logsResult.rows.map(log => ({
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
      let paramIndex = 1;

      if (startDate) {
        dateFilter += ` AND created_at >= $${paramIndex++}`;
        params.push(startDate);
      }
      if (endDate) {
        dateFilter += ` AND created_at <= $${paramIndex++}`;
        params.push(endDate);
      }

      // Total de ações
      const totalActionsResult = await pool.query(
        `SELECT COUNT(*) as total FROM action_logs WHERE 1=1 ${dateFilter}`,
        params
      );

      // Ações por tipo
      const actionsByTypeResult = await pool.query(
        `SELECT action_type, COUNT(*) as count 
         FROM action_logs 
         WHERE 1=1 ${dateFilter}
         GROUP BY action_type 
         ORDER BY count DESC`,
        params
      );

      // Ações por role
      const actionsByRoleResult = await pool.query(
        `SELECT user_role, COUNT(*) as count 
         FROM action_logs 
         WHERE 1=1 ${dateFilter}
         GROUP BY user_role 
         ORDER BY count DESC`,
        params
      );

      // Top usuários mais ativos
      const topUsersResult = await pool.query(
        `SELECT user_name, user_email, user_role, COUNT(*) as count 
         FROM action_logs 
         WHERE 1=1 ${dateFilter}
         GROUP BY user_id, user_name, user_email, user_role 
         ORDER BY count DESC 
         LIMIT 10`,
        params
      );

      // Ações recentes (últimas 24h)
      const recentActionsResult = await pool.query(
        `SELECT COUNT(*) as count 
         FROM action_logs 
         WHERE created_at >= NOW() - INTERVAL '24 hours'`
      );

      res.json({
        success: true,
        stats: {
          totalActions: parseInt(totalActionsResult.rows[0].total),
          recentActions24h: parseInt(recentActionsResult.rows[0].count),
          actionsByType: actionsByTypeResult.rows,
          actionsByRole: actionsByRoleResult.rows,
          topUsers: topUsersResult.rows
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

      const usersResult = await pool.query(`
        SELECT DISTINCT user_id, user_name, user_email, user_role
        FROM action_logs
        ORDER BY user_name
      `);

      res.json({
        success: true,
        users: usersResult.rows
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


