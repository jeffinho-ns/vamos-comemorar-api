// routes/walkIns.js

const express = require('express');
const router = express.Router();

module.exports = (pool) => {
  /**
   * @route   GET /api/walk-ins
   * @desc    Lista todos os passantes com filtros opcionais
   * @access  Private
   */
  router.get('/', async (req, res) => {
    try {
      // Tabela walk_ins já deve existir no PostgreSQL

      const { status, area_id, date, limit, sort, order } = req.query;
      
      let query = `
        SELECT 
          wi.*,
          ra.name as area_name,
          u.name as created_by_name
        FROM walk_ins wi
        LEFT JOIN restaurant_areas ra ON wi.area_id = ra.id
        LEFT JOIN users u ON wi.created_by = u.id
        WHERE 1=1
      `;
      
      const params = [];
      let paramIndex = 1;
      
      if (status) {
        query += ` AND wi.status = $${paramIndex++}`;
        params.push(status);
      }
      
      if (area_id) {
        query += ` AND wi.area_id = $${paramIndex++}`;
        params.push(area_id);
      }
      
      if (date) {
        query += ` AND DATE(wi.arrival_time) = $${paramIndex++}`;
        params.push(date);
      }
      
      if (sort && order) {
        query += ` ORDER BY wi."${sort}" ${order.toUpperCase()}`;
      } else {
        query += ` ORDER BY wi.arrival_time DESC`;
      }
      
      if (limit) {
        query += ` LIMIT $${paramIndex++}`;
        params.push(parseInt(limit));
      }
      
      const walkInsResult = await pool.query(query, params);
      const walkIns = walkInsResult.rows;
      
      res.json({
        success: true,
        walkIns: walkIns
      });
      
    } catch (error) {
      console.error('❌ Erro ao buscar passantes:', error);
      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor'
      });
    }
  });

  /**
   * @route   GET /api/walk-ins/:id
   * @desc    Busca um passante específico
   * @access  Private
   */
  router.get('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      
      const query = `
        SELECT 
          wi.*,
          ra.name as area_name,
          u.name as created_by_name
        FROM walk_ins wi
        LEFT JOIN restaurant_areas ra ON wi.area_id = ra.id
        LEFT JOIN users u ON wi.created_by = u.id
        WHERE wi.id = $1
      `;
      
      const walkInsResult = await pool.query(query, [id]);
      
      if (walkInsResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Passante não encontrado'
        });
      }
      
      res.json({
        success: true,
        walkIn: walkInsResult.rows[0]
      });
      
    } catch (error) {
      console.error('❌ Erro ao buscar passante:', error);
      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor'
      });
    }
  });

  /**
   * @route   POST /api/walk-ins
   * @desc    Cria um novo passante
   * @access  Private
   */
  router.post('/', async (req, res) => {
    try {
      const {
        client_name,
        client_phone,
        number_of_people,
        area_id,
        table_number,
        status = 'ATIVO',
        notes,
        created_by
      } = req.body;
      
      // Validações básicas
      if (!client_name || !area_id) {
        return res.status(400).json({
          success: false,
          error: 'Campos obrigatórios: client_name, area_id'
        });
      }
      
      const query = `
        INSERT INTO walk_ins (
          client_name, client_phone, number_of_people, area_id, 
          table_number, status, notes, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id
      `;
      
      const params = [
        client_name, client_phone, number_of_people, area_id,
        table_number, status, notes, created_by
      ];
      
      const result = await pool.query(query, params);
      
      // Buscar o passante criado com dados completos
      const newWalkInResult = await pool.query(`
        SELECT 
          wi.*,
          ra.name as area_name,
          u.name as created_by_name
        FROM walk_ins wi
        LEFT JOIN restaurant_areas ra ON wi.area_id = ra.id
        LEFT JOIN users u ON wi.created_by = u.id
        WHERE wi.id = $1
      `, [result.rows[0].id]);
      
      res.status(201).json({
        success: true,
        message: 'Passante criado com sucesso',
        walkIn: newWalkInResult.rows[0]
      });
      
    } catch (error) {
      console.error('❌ Erro ao criar passante:', error);
      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor'
      });
    }
  });

  /**
   * @route   PUT /api/walk-ins/:id
   * @desc    Atualiza um passante existente
   * @access  Private
   */
  router.put('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const {
        client_name,
        client_phone,
        number_of_people,
        area_id,
        table_number,
        status,
        notes
      } = req.body;
      
      // Verificar se o passante existe
      const existingWalkInResult = await pool.query(
        'SELECT id FROM walk_ins WHERE id = $1',
        [id]
      );
      
      if (existingWalkInResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Passante não encontrado'
        });
      }
      
      const query = `
        UPDATE walk_ins SET
          client_name = $1, client_phone = $2, number_of_people = $3,
          area_id = $4, table_number = $5, status = $6, notes = $7,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $8
      `;
      
      const params = [
        client_name, client_phone, number_of_people, area_id,
        table_number, status, notes, id
      ];
      
      await pool.query(query, params);
      
      // Buscar o passante atualizado
      const updatedWalkInResult = await pool.query(`
        SELECT 
          wi.*,
          ra.name as area_name,
          u.name as created_by_name
        FROM walk_ins wi
        LEFT JOIN restaurant_areas ra ON wi.area_id = ra.id
        LEFT JOIN users u ON wi.created_by = u.id
        WHERE wi.id = $1
      `, [id]);
      
      res.json({
        success: true,
        message: 'Passante atualizado com sucesso',
        walkIn: updatedWalkInResult.rows[0]
      });
      
    } catch (error) {
      console.error('❌ Erro ao atualizar passante:', error);
      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor'
      });
    }
  });

  /**
   * @route   DELETE /api/walk-ins/:id
   * @desc    Deleta um passante
   * @access  Private
   */
  router.delete('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      
      // Verificar se o passante existe
      const existingWalkInResult = await pool.query(
        'SELECT id FROM walk_ins WHERE id = $1',
        [id]
      );
      
      if (existingWalkInResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Passante não encontrado'
        });
      }
      
      await pool.query('DELETE FROM walk_ins WHERE id = $1', [id]);
      
      res.json({
        success: true,
        message: 'Passante deletado com sucesso'
      });
      
    } catch (error) {
      console.error('❌ Erro ao deletar passante:', error);
      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor'
      });
    }
  });

  /**
   * @route   GET /api/walk-ins/stats/active
   * @desc    Busca estatísticas de passantes ativos
   * @access  Private
   */
  router.get('/stats/active', async (req, res) => {
    try {
      const activeWalkInsResult = await pool.query(
        "SELECT COUNT(*) as count FROM walk_ins WHERE status = 'ATIVO'"
      );
      
      res.json({
        success: true,
        stats: {
          activeWalkIns: parseInt(activeWalkInsResult.rows[0].count)
        }
      });
      
    } catch (error) {
      console.error('❌ Erro ao buscar estatísticas de passantes:', error);
      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor'
      });
    }
  });

  return router;
};

