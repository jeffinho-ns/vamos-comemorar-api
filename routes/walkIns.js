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
      // Verificar se a tabela walk_ins existe, se não, criar
      try {
        const [tables] = await pool.execute("SHOW TABLES LIKE 'walk_ins'");
        
        if (tables.length === 0) {
          console.log('📝 Criando tabela walk_ins...');
          
          await pool.execute(`
            CREATE TABLE walk_ins (
              id int(11) NOT NULL AUTO_INCREMENT,
              establishment_id int(11) DEFAULT NULL,
              client_name varchar(255) NOT NULL,
              client_phone varchar(20) DEFAULT NULL,
              number_of_people int(11) NOT NULL,
              arrival_time timestamp NULL DEFAULT CURRENT_TIMESTAMP,
              area_id int(11) DEFAULT NULL,
              table_number varchar(50) DEFAULT NULL,
              status varchar(50) DEFAULT 'ATIVO',
              notes text DEFAULT NULL,
              created_by int(11) DEFAULT NULL,
              created_at timestamp NULL DEFAULT CURRENT_TIMESTAMP,
              updated_at timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
              PRIMARY KEY (id),
              KEY idx_establishment_id (establishment_id),
              KEY idx_status (status),
              KEY idx_arrival_time (arrival_time)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
          `);
          
          console.log('✅ Tabela walk_ins criada com sucesso!');
        }
      } catch (tableError) {
        console.log('⚠️ Erro ao verificar/criar tabela walk_ins:', tableError.message);
      }

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
      
      if (status) {
        query += ` AND wi.status = ?`;
        params.push(status);
      }
      
      if (area_id) {
        query += ` AND wi.area_id = ?`;
        params.push(area_id);
      }
      
      if (date) {
        query += ` AND DATE(wi.arrival_time) = ?`;
        params.push(date);
      }
      
      if (sort && order) {
        query += ` ORDER BY wi.${sort} ${order.toUpperCase()}`;
      } else {
        query += ` ORDER BY wi.arrival_time DESC`;
      }
      
      if (limit) {
        query += ` LIMIT ?`;
        params.push(parseInt(limit));
      }
      
      const [walkIns] = await pool.execute(query, params);
      
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
        WHERE wi.id = ?
      `;
      
      const [walkIns] = await pool.execute(query, [id]);
      
      if (walkIns.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Passante não encontrado'
        });
      }
      
      res.json({
        success: true,
        walkIn: walkIns[0]
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
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `;
      
      const params = [
        client_name, client_phone, number_of_people, area_id,
        table_number, status, notes, created_by
      ];
      
      const [result] = await pool.execute(query, params);
      
      // Buscar o passante criado com dados completos
      const [newWalkIn] = await pool.execute(`
        SELECT 
          wi.*,
          ra.name as area_name,
          u.name as created_by_name
        FROM walk_ins wi
        LEFT JOIN restaurant_areas ra ON wi.area_id = ra.id
        LEFT JOIN users u ON wi.created_by = u.id
        WHERE wi.id = ?
      `, [result.insertId]);
      
      res.status(201).json({
        success: true,
        message: 'Passante criado com sucesso',
        walkIn: newWalkIn[0]
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
      const [existingWalkIn] = await pool.execute(
        'SELECT id FROM walk_ins WHERE id = ?',
        [id]
      );
      
      if (existingWalkIn.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Passante não encontrado'
        });
      }
      
      const query = `
        UPDATE walk_ins SET
          client_name = ?, client_phone = ?, number_of_people = ?,
          area_id = ?, table_number = ?, status = ?, notes = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `;
      
      const params = [
        client_name, client_phone, number_of_people, area_id,
        table_number, status, notes, id
      ];
      
      await pool.execute(query, params);
      
      // Buscar o passante atualizado
      const [updatedWalkIn] = await pool.execute(`
        SELECT 
          wi.*,
          ra.name as area_name,
          u.name as created_by_name
        FROM walk_ins wi
        LEFT JOIN restaurant_areas ra ON wi.area_id = ra.id
        LEFT JOIN users u ON wi.created_by = u.id
        WHERE wi.id = ?
      `, [id]);
      
      res.json({
        success: true,
        message: 'Passante atualizado com sucesso',
        walkIn: updatedWalkIn[0]
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
      const [existingWalkIn] = await pool.execute(
        'SELECT id FROM walk_ins WHERE id = ?',
        [id]
      );
      
      if (existingWalkIn.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Passante não encontrado'
        });
      }
      
      await pool.execute('DELETE FROM walk_ins WHERE id = ?', [id]);
      
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
      const [activeWalkIns] = await pool.execute(
        'SELECT COUNT(*) as count FROM walk_ins WHERE status = "ATIVO"'
      );
      
      res.json({
        success: true,
        stats: {
          activeWalkIns: activeWalkIns[0].count
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

