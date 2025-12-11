const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');

module.exports = (pool) => {
  /**
   * @route   GET /api/establishment-permissions
   * @desc    Lista todas as permissões (com filtros opcionais)
   * @access  Private (Admin)
   */
  router.get('/', auth, async (req, res) => {
    try {
      const { user_id, establishment_id, user_email, is_active } = req.query;
      
      let query = `
        SELECT 
          uep.*,
          u.name as user_name,
          p.name as establishment_name
        FROM user_establishment_permissions uep
        LEFT JOIN users u ON uep.user_id = u.id
        LEFT JOIN places p ON uep.establishment_id = p.id
        WHERE 1=1
      `;
      
      const params = [];
      let paramIndex = 1;
      
      if (user_id) {
        query += ` AND uep.user_id = $${paramIndex++}`;
        params.push(user_id);
      }
      
      if (establishment_id) {
        query += ` AND uep.establishment_id = $${paramIndex++}`;
        params.push(establishment_id);
      }
      
      if (user_email) {
        query += ` AND uep.user_email ILIKE $${paramIndex++}`;
        params.push(`%${user_email}%`);
      }
      
      if (is_active !== undefined) {
        query += ` AND uep.is_active = $${paramIndex++}`;
        params.push(is_active === 'true');
      }
      
      query += ` ORDER BY uep.user_email, uep.establishment_id`;
      
      const result = await pool.query(query, params);
      
      res.json({
        success: true,
        data: result.rows,
        count: result.rows.length
      });
    } catch (error) {
      console.error('❌ Erro ao buscar permissões:', error);
      res.status(500).json({
        success: false,
        error: 'Erro ao buscar permissões',
        details: error.message
      });
    }
  });

  /**
   * @route   GET /api/establishment-permissions/my-permissions
   * @desc    Busca permissões do usuário logado
   * @access  Private
   */
  router.get('/my-permissions', auth, async (req, res) => {
    try {
      const userId = req.user.id;
      const userEmail = req.user.email || req.user.userEmail;
      
      const query = `
        SELECT 
          uep.*,
          p.name as establishment_name,
          p.id as establishment_id
        FROM user_establishment_permissions uep
        LEFT JOIN places p ON uep.establishment_id = p.id
        WHERE uep.user_id = $1 AND uep.is_active = TRUE
        ORDER BY p.name
      `;
      
      const result = await pool.query(query, [userId]);
      
      res.json({
        success: true,
        data: result.rows,
        userEmail: userEmail
      });
    } catch (error) {
      console.error('❌ Erro ao buscar permissões do usuário:', error);
      res.status(500).json({
        success: false,
        error: 'Erro ao buscar permissões',
        details: error.message
      });
    }
  });

  /**
   * @route   GET /api/establishment-permissions/:id
   * @desc    Busca uma permissão específica
   * @access  Private (Admin)
   */
  router.get('/:id', auth, async (req, res) => {
    try {
      const { id } = req.params;
      
      const query = `
        SELECT 
          uep.*,
          u.name as user_name,
          p.name as establishment_name
        FROM user_establishment_permissions uep
        LEFT JOIN users u ON uep.user_id = u.id
        LEFT JOIN places p ON uep.establishment_id = p.id
        WHERE uep.id = $1
      `;
      
      const result = await pool.query(query, [id]);
      
      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Permissão não encontrada'
        });
      }
      
      res.json({
        success: true,
        data: result.rows[0]
      });
    } catch (error) {
      console.error('❌ Erro ao buscar permissão:', error);
      res.status(500).json({
        success: false,
        error: 'Erro ao buscar permissão',
        details: error.message
      });
    }
  });

  /**
   * @route   POST /api/establishment-permissions
   * @desc    Cria uma nova permissão
   * @access  Private (Admin)
   */
  router.post('/', auth, async (req, res) => {
    try {
      const {
        user_id,
        user_email,
        establishment_id,
        can_edit_os,
        can_edit_operational_detail,
        can_view_os,
        can_download_os,
        can_view_operational_detail,
        can_create_os,
        can_create_operational_detail,
        can_manage_reservations,
        can_manage_checkins,
        can_view_reports,
        is_active
      } = req.body;
      
      // Validar campos obrigatórios
      if (!user_id || !user_email || !establishment_id) {
        return res.status(400).json({
          success: false,
          error: 'user_id, user_email e establishment_id são obrigatórios'
        });
      }
      
      // Verificar se já existe permissão para este usuário e estabelecimento
      const checkQuery = `
        SELECT id FROM user_establishment_permissions
        WHERE user_id = $1 AND establishment_id = $2
      `;
      const checkResult = await pool.query(checkQuery, [user_id, establishment_id]);
      
      if (checkResult.rows.length > 0) {
        return res.status(409).json({
          success: false,
          error: 'Permissão já existe para este usuário e estabelecimento'
        });
      }
      
      const insertQuery = `
        INSERT INTO user_establishment_permissions (
          user_id, user_email, establishment_id,
          can_edit_os, can_edit_operational_detail,
          can_view_os, can_download_os, can_view_operational_detail,
          can_create_os, can_create_operational_detail,
          can_manage_reservations, can_manage_checkins, can_view_reports,
          is_active, created_by
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15
        ) RETURNING *
      `;
      
      const values = [
        user_id,
        user_email,
        establishment_id,
        can_edit_os || false,
        can_edit_operational_detail || false,
        can_view_os !== undefined ? can_view_os : true,
        can_download_os !== undefined ? can_download_os : true,
        can_view_operational_detail !== undefined ? can_view_operational_detail : true,
        can_create_os || false,
        can_create_operational_detail || false,
        can_manage_reservations || false,
        can_manage_checkins || false,
        can_view_reports || false,
        is_active !== undefined ? is_active : true,
        req.user.id
      ];
      
      const result = await pool.query(insertQuery, values);
      
      // Log de auditoria
      await pool.query(
        `INSERT INTO permission_audit_logs (
          user_id, user_email, action_type, permission_id,
          target_user_id, target_user_email, establishment_id,
          permission_changes, ip_address, user_agent
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          req.user.id,
          req.user.email || req.user.userEmail,
          'CREATE',
          result.rows[0].id,
          user_id,
          user_email,
          establishment_id,
          JSON.stringify(req.body),
          req.ip,
          req.get('user-agent')
        ]
      );
      
      res.status(201).json({
        success: true,
        data: result.rows[0],
        message: 'Permissão criada com sucesso'
      });
    } catch (error) {
      console.error('❌ Erro ao criar permissão:', error);
      res.status(500).json({
        success: false,
        error: 'Erro ao criar permissão',
        details: error.message
      });
    }
  });

  /**
   * @route   PUT /api/establishment-permissions/:id
   * @desc    Atualiza uma permissão
   * @access  Private (Admin)
   */
  router.put('/:id', auth, async (req, res) => {
    try {
      const { id } = req.params;
      
      // Buscar permissão atual para comparar mudanças
      const currentQuery = `SELECT * FROM user_establishment_permissions WHERE id = $1`;
      const currentResult = await pool.query(currentQuery, [id]);
      
      if (currentResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Permissão não encontrada'
        });
      }
      
      const current = currentResult.rows[0];
      
      const {
        can_edit_os,
        can_edit_operational_detail,
        can_view_os,
        can_download_os,
        can_view_operational_detail,
        can_create_os,
        can_create_operational_detail,
        can_manage_reservations,
        can_manage_checkins,
        can_view_reports,
        is_active
      } = req.body;
      
      // Detectar mudanças
      const changes = {};
      if (can_edit_os !== undefined && can_edit_os !== current.can_edit_os) {
        changes.can_edit_os = { from: current.can_edit_os, to: can_edit_os };
      }
      if (can_edit_operational_detail !== undefined && can_edit_operational_detail !== current.can_edit_operational_detail) {
        changes.can_edit_operational_detail = { from: current.can_edit_operational_detail, to: can_edit_operational_detail };
      }
      // Adicionar outras mudanças...
      
      const updateQuery = `
        UPDATE user_establishment_permissions SET
          can_edit_os = COALESCE($1, can_edit_os),
          can_edit_operational_detail = COALESCE($2, can_edit_operational_detail),
          can_view_os = COALESCE($3, can_view_os),
          can_download_os = COALESCE($4, can_download_os),
          can_view_operational_detail = COALESCE($5, can_view_operational_detail),
          can_create_os = COALESCE($6, can_create_os),
          can_create_operational_detail = COALESCE($7, can_create_operational_detail),
          can_manage_reservations = COALESCE($8, can_manage_reservations),
          can_manage_checkins = COALESCE($9, can_manage_checkins),
          can_view_reports = COALESCE($10, can_view_reports),
          is_active = COALESCE($11, is_active),
          updated_by = $12,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $13
        RETURNING *
      `;
      
      const values = [
        can_edit_os,
        can_edit_operational_detail,
        can_view_os,
        can_download_os,
        can_view_operational_detail,
        can_create_os,
        can_create_operational_detail,
        can_manage_reservations,
        can_manage_checkins,
        can_view_reports,
        is_active,
        req.user.id,
        id
      ];
      
      const result = await pool.query(updateQuery, values);
      
      // Log de auditoria
      if (Object.keys(changes).length > 0) {
        await pool.query(
          `INSERT INTO permission_audit_logs (
            user_id, user_email, action_type, permission_id,
            target_user_id, target_user_email, establishment_id,
            permission_changes, ip_address, user_agent
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [
            req.user.id,
            req.user.email || req.user.userEmail,
            'UPDATE',
            id,
            current.user_id,
            current.user_email,
            current.establishment_id,
            JSON.stringify(changes),
            req.ip,
            req.get('user-agent')
          ]
        );
      }
      
      res.json({
        success: true,
        data: result.rows[0],
        message: 'Permissão atualizada com sucesso'
      });
    } catch (error) {
      console.error('❌ Erro ao atualizar permissão:', error);
      res.status(500).json({
        success: false,
        error: 'Erro ao atualizar permissão',
        details: error.message
      });
    }
  });

  /**
   * @route   DELETE /api/establishment-permissions/:id
   * @desc    Remove uma permissão (soft delete)
   * @access  Private (Admin)
   */
  router.delete('/:id', auth, async (req, res) => {
    try {
      const { id } = req.params;
      
      // Buscar permissão antes de deletar
      const currentQuery = `SELECT * FROM user_establishment_permissions WHERE id = $1`;
      const currentResult = await pool.query(currentQuery, [id]);
      
      if (currentResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Permissão não encontrada'
        });
      }
      
      const current = currentResult.rows[0];
      
      // Soft delete (marcar como inativo)
      const deleteQuery = `
        UPDATE user_establishment_permissions 
        SET is_active = FALSE, updated_by = $1, updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
        RETURNING *
      `;
      
      const result = await pool.query(deleteQuery, [req.user.id, id]);
      
      // Log de auditoria
      await pool.query(
        `INSERT INTO permission_audit_logs (
          user_id, user_email, action_type, permission_id,
          target_user_id, target_user_email, establishment_id,
          permission_changes, ip_address, user_agent
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          req.user.id,
          req.user.email || req.user.userEmail,
          'DELETE',
          id,
          current.user_id,
          current.user_email,
          current.establishment_id,
          JSON.stringify({ deleted: true }),
          req.ip,
          req.get('user-agent')
        ]
      );
      
      res.json({
        success: true,
        data: result.rows[0],
        message: 'Permissão removida com sucesso'
      });
    } catch (error) {
      console.error('❌ Erro ao remover permissão:', error);
      res.status(500).json({
        success: false,
        error: 'Erro ao remover permissão',
        details: error.message
      });
    }
  });

  /**
   * @route   GET /api/establishment-permissions/audit-logs
   * @desc    Lista logs de auditoria de permissões
   * @access  Private (Admin)
   */
  router.get('/audit-logs', auth, async (req, res) => {
    try {
      const { user_id, target_user_id, establishment_id, action_type, limit = 100 } = req.query;
      
      let query = `
        SELECT 
          pal.*,
          u.name as user_name,
          tu.name as target_user_name,
          p.name as establishment_name
        FROM permission_audit_logs pal
        LEFT JOIN users u ON pal.user_id = u.id
        LEFT JOIN users tu ON pal.target_user_id = tu.id
        LEFT JOIN places p ON pal.establishment_id = p.id
        WHERE 1=1
      `;
      
      const params = [];
      let paramIndex = 1;
      
      if (user_id) {
        query += ` AND pal.user_id = $${paramIndex++}`;
        params.push(user_id);
      }
      
      if (target_user_id) {
        query += ` AND pal.target_user_id = $${paramIndex++}`;
        params.push(target_user_id);
      }
      
      if (establishment_id) {
        query += ` AND pal.establishment_id = $${paramIndex++}`;
        params.push(establishment_id);
      }
      
      if (action_type) {
        query += ` AND pal.action_type = $${paramIndex++}`;
        params.push(action_type);
      }
      
      query += ` ORDER BY pal.created_at DESC LIMIT $${paramIndex++}`;
      params.push(parseInt(limit));
      
      const result = await pool.query(query, params);
      
      res.json({
        success: true,
        data: result.rows,
        count: result.rows.length
      });
    } catch (error) {
      console.error('❌ Erro ao buscar logs de auditoria:', error);
      res.status(500).json({
        success: false,
        error: 'Erro ao buscar logs de auditoria',
        details: error.message
      });
    }
  });

  return router;
};

