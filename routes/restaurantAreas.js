// routes/restaurantAreas.js

const express = require('express');
const router = express.Router();

module.exports = (pool) => {
  /**
   * @route   GET /api/restaurant-areas
   * @desc    Lista todas as áreas do restaurante
   * @access  Private
   */
  router.get('/', async (req, res) => {
    try {
      console.log('🔍 Iniciando busca de áreas...');
      
      // Tabela restaurant_areas já deve existir no PostgreSQL
      console.log('🔍 Executando consulta de áreas...');
      const query = `
        SELECT 
          ra.*,
          0 as active_reservations,
          0 as active_walk_ins
        FROM restaurant_areas ra
        WHERE ra.is_active = TRUE
        ORDER BY ra.name ASC
      `;
      
      const areasResult = await pool.query(query);
      const areas = areasResult.rows;
      console.log('📊 Áreas encontradas:', areas.length);
      
      res.json({
        success: true,
        areas: areas
      });
      
    } catch (error) {
      console.error('❌ Erro ao buscar áreas:', error);
      console.error('❌ Stack trace:', error.stack);
      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor: ' + error.message
      });
    }
  });

  /**
   * @route   GET /api/restaurant-areas/:id
   * @desc    Busca uma área específica
   * @access  Private
   */
  router.get('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      
      const query = `
        SELECT 
          ra.*,
          COUNT(rr.id) as active_reservations,
          COUNT(wi.id) as active_walk_ins
        FROM restaurant_areas ra
        LEFT JOIN restaurant_reservations rr ON ra.id = rr.area_id 
          AND rr.status IN ('NOVA', 'CONFIRMADA') 
          AND rr.reservation_date = CURRENT_DATE
        LEFT JOIN walk_ins wi ON ra.id = wi.area_id 
          AND wi.status = 'ATIVO'
        WHERE ra.id = $1 AND ra.is_active = TRUE
        GROUP BY ra.id
      `;
      
      const areasResult = await pool.query(query, [id]);
      
      if (areasResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Área não encontrada'
        });
      }
      
      res.json({
        success: true,
        area: areasResult.rows[0]
      });
      
    } catch (error) {
      console.error('❌ Erro ao buscar área:', error);
      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor'
      });
    }
  });

  /**
   * @route   POST /api/restaurant-areas
   * @desc    Cria uma nova área
   * @access  Private
   */
  router.post('/', async (req, res) => {
    try {
      const {
        name,
        description,
        capacity_lunch = 0,
        capacity_dinner = 0,
        is_active = 1
      } = req.body;
      
      // Validações básicas
      if (!name) {
        return res.status(400).json({
          success: false,
          error: 'Campo obrigatório: name'
        });
      }
      
      // Verificar se já existe uma área com o mesmo nome
      const existingAreaResult = await pool.query(
        'SELECT id FROM restaurant_areas WHERE name = $1',
        [name]
      );
      
      if (existingAreaResult.rows.length > 0) {
        return res.status(400).json({
          success: false,
          error: 'Já existe uma área com este nome'
        });
      }
      
      const query = `
        INSERT INTO restaurant_areas (
          name, description, capacity_lunch, capacity_dinner, is_active
        ) VALUES ($1, $2, $3, $4, $5) RETURNING id
      `;
      
      // Converter is_active para boolean (PostgreSQL)
      const isActiveBoolean = is_active === 1 || is_active === true || is_active === '1';
      const params = [name, description, capacity_lunch, capacity_dinner, isActiveBoolean];
      
      const result = await pool.query(query, params);
      
      // Buscar a área criada
      const newAreaResult = await pool.query(
        'SELECT * FROM restaurant_areas WHERE id = $1',
        [result.rows[0].id]
      );
      
      res.status(201).json({
        success: true,
        message: 'Área criada com sucesso',
        area: newAreaResult.rows[0]
      });
      
    } catch (error) {
      console.error('❌ Erro ao criar área:', error);
      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor'
      });
    }
  });

  /**
   * @route   PUT /api/restaurant-areas/:id
   * @desc    Atualiza uma área existente
   * @access  Private
   */
  router.put('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const {
        name,
        description,
        capacity_lunch,
        capacity_dinner,
        is_active
      } = req.body;
      
      // Verificar se a área existe
      const existingAreaResult = await pool.query(
        'SELECT id FROM restaurant_areas WHERE id = $1',
        [id]
      );
      
      if (existingAreaResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Área não encontrada'
        });
      }
      
      // Verificar se já existe outra área com o mesmo nome
      if (name) {
        const duplicateAreaResult = await pool.query(
          'SELECT id FROM restaurant_areas WHERE name = $1 AND id != $2',
          [name, id]
        );
        
        if (duplicateAreaResult.rows.length > 0) {
          return res.status(400).json({
            success: false,
            error: 'Já existe uma área com este nome'
          });
        }
      }
      
      const updates = [];
      const params = [];
      let paramIndex = 1;
      
      if (name !== undefined) { updates.push(`name = $${paramIndex++}`); params.push(name); }
      if (description !== undefined) { updates.push(`description = $${paramIndex++}`); params.push(description); }
      if (capacity_lunch !== undefined) { updates.push(`capacity_lunch = $${paramIndex++}`); params.push(capacity_lunch); }
      if (capacity_dinner !== undefined) { updates.push(`capacity_dinner = $${paramIndex++}`); params.push(capacity_dinner); }
      if (is_active !== undefined) { 
        const isActiveBoolean = is_active === 1 || is_active === true || is_active === '1';
        updates.push(`is_active = $${paramIndex++}`); 
        params.push(isActiveBoolean); 
      }
      updates.push('updated_at = CURRENT_TIMESTAMP');
      params.push(id);
      
      const query = `UPDATE restaurant_areas SET ${updates.join(', ')} WHERE id = $${paramIndex}`;
      await pool.query(query, params);
      
      // Buscar a área atualizada
      const updatedAreaResult = await pool.query(
        'SELECT * FROM restaurant_areas WHERE id = $1',
        [id]
      );
      
      res.json({
        success: true,
        message: 'Área atualizada com sucesso',
        area: updatedAreaResult.rows[0]
      });
      
    } catch (error) {
      console.error('❌ Erro ao atualizar área:', error);
      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor'
      });
    }
  });

  /**
   * @route   DELETE /api/restaurant-areas/:id
   * @desc    Deleta uma área (soft delete)
   * @access  Private
   */
  router.delete('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      
      // Verificar se a área existe
      const existingAreaResult = await pool.query(
        'SELECT id FROM restaurant_areas WHERE id = $1',
        [id]
      );
      
      if (existingAreaResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Área não encontrada'
        });
      }
      
      // Verificar se há reservas ou passantes ativos nesta área
      const activeReservationsResult = await pool.query(
        "SELECT COUNT(*) as count FROM restaurant_reservations WHERE area_id = $1 AND status IN ('NOVA', 'CONFIRMADA')",
        [id]
      );
      
      const activeWalkInsResult = await pool.query(
        "SELECT COUNT(*) as count FROM walk_ins WHERE area_id = $1 AND status = 'ATIVO'",
        [id]
      );
      
      if (parseInt(activeReservationsResult.rows[0].count) > 0 || parseInt(activeWalkInsResult.rows[0].count) > 0) {
        return res.status(400).json({
          success: false,
          error: 'Não é possível deletar uma área com reservas ou passantes ativos'
        });
      }
      
      // Soft delete - marcar como inativa
      await pool.query(
        'UPDATE restaurant_areas SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
        [id]
      );
      
      res.json({
        success: true,
        message: 'Área desativada com sucesso'
      });
      
    } catch (error) {
      console.error('❌ Erro ao deletar área:', error);
      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor'
      });
    }
  });

  /**
   * @route   GET /api/restaurant-areas/:id/availability
   * @desc    Verifica disponibilidade de uma área em uma data específica
   * @access  Private
   */
  router.get('/:id/availability', async (req, res) => {
    try {
      const { id } = req.params;
      const { date } = req.query;
      
      if (!date) {
        return res.status(400).json({
          success: false,
          error: 'Parâmetro obrigatório: date'
        });
      }
      
      // Buscar informações da área
      const areaResult = await pool.query(
        'SELECT * FROM restaurant_areas WHERE id = $1 AND is_active = TRUE',
        [id]
      );
      
      if (areaResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Área não encontrada'
        });
      }
      
      // Contar reservas confirmadas para a data
      const reservationsResult = await pool.query(
        "SELECT COUNT(*) as count, SUM(number_of_people) as total_people FROM restaurant_reservations WHERE area_id = $1 AND reservation_date = $2 AND status IN ('NOVA', 'CONFIRMADA')",
        [id, date]
      );
      
      // Contar passantes ativos
      const walkInsResult = await pool.query(
        "SELECT COUNT(*) as count, SUM(number_of_people) as total_people FROM walk_ins WHERE area_id = $1 AND DATE(arrival_time) = $2 AND status = 'ATIVO'",
        [id, date]
      );
      
      const areaData = areaResult.rows[0];
      const reservationCount = parseInt(reservationsResult.rows[0].count);
      const reservationPeople = parseInt(reservationsResult.rows[0].total_people) || 0;
      const walkInCount = parseInt(walkInsResult.rows[0].count);
      const walkInPeople = parseInt(walkInsResult.rows[0].total_people) || 0;
      
      // Calcular capacidade disponível (usando capacidade do almoço como padrão)
      const totalCapacity = areaData.capacity_lunch;
      const totalOccupied = reservationPeople + walkInPeople;
      const availableCapacity = Math.max(0, totalCapacity - totalOccupied);
      
      res.json({
        success: true,
        availability: {
          area: areaData,
          date: date,
          totalCapacity: totalCapacity,
          totalOccupied: totalOccupied,
          availableCapacity: availableCapacity,
          reservations: {
            count: reservationCount,
            people: reservationPeople
          },
          walkIns: {
            count: walkInCount,
            people: walkInPeople
          }
        }
      });
      
    } catch (error) {
      console.error('❌ Erro ao verificar disponibilidade:', error);
      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor'
      });
    }
  });

  return router;
};

