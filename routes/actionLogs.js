const express = require('express');
const router = express.Router();
const authenticateToken = require('../middleware/auth');
const { logAction } = require('../middleware/actionLogger');
const {
  getActionLogsViewerContext,
  appendEstablishmentScope,
  assertEstablishmentFilterAllowed
} = require('../middleware/logAccessHelpers');

function parseAdditionalData(raw) {
  if (raw == null) return null;
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function appendActionCategoryFilter(sql, params, paramIndex, actionCategory) {
  const cat = String(actionCategory).toLowerCase().trim();
  const map = {
    create: `(action_type ILIKE '%create%' OR action_type = 'create')`,
    update: `(action_type ILIKE '%update%' OR action_type = 'update')`,
    delete: `(action_type ILIKE '%delete%' OR action_type = 'delete')`,
    view: `(action_type ILIKE '%view%' OR action_type ILIKE 'page_view%')`
  };
  if (!map[cat]) return { sql, params, paramIndex };
  return {
    sql: `${sql} AND ${map[cat]}`,
    params,
    paramIndex
  };
}

module.exports = (pool) => {
  /**
   * @route   POST /api/action-logs
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

      if (!actionType || !actionDescription) {
        return res.status(400).json({
          success: false,
          error: 'actionType e actionDescription são obrigatórios'
        });
      }

      const ipAddress = req.ip || req.connection?.remoteAddress;
      const userAgent = req.get('user-agent');

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
   */
  router.get('/', authenticateToken, async (req, res) => {
    try {
      const ctx = await getActionLogsViewerContext(pool, req);

      if (!ctx.superAdmin && !ctx.establishmentIds.length) {
        return res.status(403).json({
          success: false,
          error: 'Sem permissão para visualizar logs. É necessário vínculo com um estabelecimento.'
        });
      }

      const filterCheck = assertEstablishmentFilterAllowed(ctx, req.query.establishmentId);
      if (!filterCheck.ok) {
        return res.status(filterCheck.status).json({
          success: false,
          error: filterCheck.error
        });
      }

      const {
        userId,
        userRole,
        actionType,
        resourceType,
        startDate,
        endDate,
        limit = 100,
        offset = 0,
        search,
        actionCategory
      } = req.query;

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

      let params = [];
      let paramIndex = 1;

      let scoped = appendEstablishmentScope(query, params, paramIndex, ctx);
      query = scoped.sql;
      params = scoped.params;
      paramIndex = scoped.paramIndex;

      if (filterCheck.establishmentId != null) {
        query += ` AND establishment_id = $${paramIndex++}`;
        params.push(filterCheck.establishmentId);
      }

      if (userId) {
        query += ` AND user_id = $${paramIndex++}`;
        params.push(userId);
      }

      if (userRole) {
        const roles = userRole.split(',').map((r) => r.trim());
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

      if (actionType) {
        query += ` AND action_type = $${paramIndex++}`;
        params.push(actionType);
      }

      if (resourceType) {
        query += ` AND resource_type = $${paramIndex++}`;
        params.push(resourceType);
      }

      if (actionCategory) {
        const ac = appendActionCategoryFilter(query, params, paramIndex, actionCategory);
        query = ac.sql;
        params = ac.params;
        paramIndex = ac.paramIndex;
      }

      if (startDate) {
        query += ` AND created_at >= $${paramIndex++}::timestamp`;
        params.push(`${startDate}T00:00:00`);
      }

      if (endDate) {
        query += ` AND created_at <= $${paramIndex++}::timestamp`;
        params.push(`${endDate}T23:59:59.999`);
      }

      if (search) {
        query += ` AND (user_name ILIKE $${paramIndex++} OR user_email ILIKE $${paramIndex++} OR action_description ILIKE $${paramIndex++})`;
        const searchTerm = `%${search}%`;
        params.push(searchTerm, searchTerm, searchTerm);
      }

      query += ` ORDER BY created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
      params.push(parseInt(limit, 10), parseInt(offset, 10));

      const logsResult = await pool.query(query, params);

      let countQuery = `SELECT COUNT(*) as total FROM action_logs WHERE 1=1`;
      let countParams = [];
      let countParamIndex = 1;

      let countScoped = appendEstablishmentScope(countQuery, countParams, countParamIndex, ctx);
      countQuery = countScoped.sql;
      countParams = countScoped.params;
      countParamIndex = countScoped.paramIndex;

      if (filterCheck.establishmentId != null) {
        countQuery += ` AND establishment_id = $${countParamIndex++}`;
        countParams.push(filterCheck.establishmentId);
      }

      if (userId) {
        countQuery += ` AND user_id = $${countParamIndex++}`;
        countParams.push(userId);
      }

      if (userRole) {
        const roles = userRole.split(',').map((r) => r.trim());
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

      if (actionCategory) {
        const ac = appendActionCategoryFilter(countQuery, countParams, countParamIndex, actionCategory);
        countQuery = ac.sql;
        countParams = ac.params;
        countParamIndex = ac.paramIndex;
      }

      if (startDate) {
        countQuery += ` AND created_at >= $${countParamIndex++}::timestamp`;
        countParams.push(`${startDate}T00:00:00`);
      }

      if (endDate) {
        countQuery += ` AND created_at <= $${countParamIndex++}::timestamp`;
        countParams.push(`${endDate}T23:59:59.999`);
      }

      if (search) {
        countQuery += ` AND (user_name ILIKE $${countParamIndex++} OR user_email ILIKE $${countParamIndex++} OR action_description ILIKE $${countParamIndex++})`;
        const searchTerm = `%${search}%`;
        countParams.push(searchTerm, searchTerm, searchTerm);
      }

      const countResult = await pool.query(countQuery, countParams);
      const total = parseInt(countResult.rows[0].total, 10);

      const logsWithParsedData = logsResult.rows.map((log) => ({
        ...log,
        additional_data: parseAdditionalData(log.additional_data)
      }));

      res.json({
        success: true,
        logs: logsWithParsedData,
        pagination: {
          total,
          limit: parseInt(limit, 10),
          offset: parseInt(offset, 10),
          hasMore: parseInt(offset, 10) + parseInt(limit, 10) < total
        },
        viewer: {
          isSuperAdmin: ctx.superAdmin,
          establishmentIds: ctx.superAdmin ? null : ctx.establishmentIds
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
   */
  router.get('/stats', authenticateToken, async (req, res) => {
    try {
      const ctx = await getActionLogsViewerContext(pool, req);

      if (!ctx.superAdmin && !ctx.establishmentIds.length) {
        return res.status(403).json({
          success: false,
          error: 'Sem permissão para visualizar estatísticas.'
        });
      }

      const filterCheck = assertEstablishmentFilterAllowed(ctx, req.query.establishmentId);
      if (!filterCheck.ok) {
        return res.status(filterCheck.status).json({
          success: false,
          error: filterCheck.error
        });
      }

      const { startDate, endDate } = req.query;

      let scopeWhere = '';
      const params = [];
      let paramIndex = 1;

      if (!ctx.superAdmin) {
        scopeWhere += ` AND establishment_id = ANY($${paramIndex}::int[])`;
        params.push(ctx.establishmentIds);
        paramIndex += 1;
      }

      if (filterCheck.establishmentId != null) {
        scopeWhere += ` AND establishment_id = $${paramIndex++}`;
        params.push(filterCheck.establishmentId);
      }

      if (startDate) {
        scopeWhere += ` AND created_at >= $${paramIndex++}::timestamp`;
        params.push(`${startDate}T00:00:00`);
      }

      if (endDate) {
        scopeWhere += ` AND created_at <= $${paramIndex++}::timestamp`;
        params.push(`${endDate}T23:59:59.999`);
      }

      const totalActionsResult = await pool.query(
        `SELECT COUNT(*) as total FROM action_logs WHERE 1=1 ${scopeWhere}`,
        params
      );

      const actionsByTypeResult = await pool.query(
        `SELECT action_type, COUNT(*)::int as count 
         FROM action_logs 
         WHERE 1=1 ${scopeWhere}
         GROUP BY action_type 
         ORDER BY count DESC`,
        params
      );

      const actionsByRoleResult = await pool.query(
        `SELECT user_role, COUNT(*)::int as count 
         FROM action_logs 
         WHERE 1=1 ${scopeWhere}
         GROUP BY user_role 
         ORDER BY count DESC`,
        params
      );

      const topUsersResult = await pool.query(
        `SELECT user_name, user_email, user_role, COUNT(*)::int as count 
         FROM action_logs 
         WHERE 1=1 ${scopeWhere}
         GROUP BY user_id, user_name, user_email, user_role 
         ORDER BY count DESC 
         LIMIT 10`,
        params
      );

      const recentParams = ctx.superAdmin ? [] : [ctx.establishmentIds];
      const recentScope = ctx.superAdmin
        ? ''
        : ` AND establishment_id = ANY($1::int[])`;

      const recentActionsResult = await pool.query(
        `SELECT COUNT(*)::int as count 
         FROM action_logs 
         WHERE created_at >= NOW() - INTERVAL '24 hours'
         ${recentScope}`,
        recentParams
      );

      res.json({
        success: true,
        stats: {
          totalActions: parseInt(totalActionsResult.rows[0].total, 10),
          recentActions24h: parseInt(recentActionsResult.rows[0].count, 10),
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
   * Todos os utilizadores com registo em user_establishment_permissions (ativos, com establishment_id),
   * independentemente de já terem gerado linhas em action_logs.
   */
  router.get('/users', authenticateToken, async (req, res) => {
    try {
      const ctx = await getActionLogsViewerContext(pool, req);

      if (!ctx.superAdmin && !ctx.establishmentIds.length) {
        return res.status(403).json({
          success: false,
          error: 'Sem permissão'
        });
      }

      let usersResult;

      if (ctx.superAdmin) {
        usersResult = await pool.query(`
          SELECT DISTINCT ON (u.id)
            u.id AS user_id,
            u.name AS user_name,
            u.email AS user_email,
            u.role AS user_role
          FROM users u
          INNER JOIN user_establishment_permissions uep
            ON uep.user_id = u.id
            AND uep.is_active = TRUE
            AND uep.establishment_id IS NOT NULL
          ORDER BY u.id, u.name NULLS LAST, u.email
        `);
      } else {
        usersResult = await pool.query(
          `
          SELECT DISTINCT ON (u.id)
            u.id AS user_id,
            u.name AS user_name,
            u.email AS user_email,
            u.role AS user_role
          FROM users u
          INNER JOIN user_establishment_permissions uep
            ON uep.user_id = u.id
            AND uep.is_active = TRUE
            AND uep.establishment_id IS NOT NULL
          WHERE uep.establishment_id = ANY($1::int[])
          ORDER BY u.id, u.name NULLS LAST, u.email
        `,
          [ctx.establishmentIds]
        );
      }

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
