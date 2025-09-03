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
      const query = `
        SELECT 
          ra.*,
          COUNT(rr.id) as active_reservations,
          COUNT(wi.id) as active_walk_ins
        FROM restaurant_areas ra
        LEFT JOIN restaurant_reservations rr ON ra.id = rr.area_id 
          AND rr.status IN ('NOVA', 'CONFIRMADA') 
          AND rr.reservation_date = CURDATE()
        LEFT JOIN walk_ins wi ON ra.id = wi.area_id 
          AND wi.status = 'ATIVO'
        WHERE ra.is_active = 1
        GROUP BY ra.id
        ORDER BY ra.name ASC
      `;
      
      const [areas] = await pool.execute(query);
      
      res.json({
        success: true,
        areas: areas
      });
      
    } catch (error) {
      console.error('❌ Erro ao buscar áreas:', error);
      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor'
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
          AND rr.reservation_date = CURDATE()
        LEFT JOIN walk_ins wi ON ra.id = wi.area_id 
          AND wi.status = 'ATIVO'
        WHERE ra.id = ? AND ra.is_active = 1
        GROUP BY ra.id
      `;
      
      const [areas] = await pool.execute(query, [id]);
      
      if (areas.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Área não encontrada'
        });
      }
      
      res.json({
        success: true,
        area: areas[0]
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
      const [existingArea] = await pool.execute(
        'SELECT id FROM restaurant_areas WHERE name = ?',
        [name]
      );
      
      if (existingArea.length > 0) {
        return res.status(400).json({
          success: false,
          error: 'Já existe uma área com este nome'
        });
      }
      
      const query = `
        INSERT INTO restaurant_areas (
          name, description, capacity_lunch, capacity_dinner, is_active
        ) VALUES (?, ?, ?, ?, ?)
      `;
      
      const params = [name, description, capacity_lunch, capacity_dinner, is_active];
      
      const [result] = await pool.execute(query, params);
      
      // Buscar a área criada
      const [newArea] = await pool.execute(
        'SELECT * FROM restaurant_areas WHERE id = ?',
        [result.insertId]
      );
      
      res.status(201).json({
        success: true,
        message: 'Área criada com sucesso',
        area: newArea[0]
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
      const [existingArea] = await pool.execute(
        'SELECT id FROM restaurant_areas WHERE id = ?',
        [id]
      );
      
      if (existingArea.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Área não encontrada'
        });
      }
      
      // Verificar se já existe outra área com o mesmo nome
      if (name) {
        const [duplicateArea] = await pool.execute(
          'SELECT id FROM restaurant_areas WHERE name = ? AND id != ?',
          [name, id]
        );
        
        if (duplicateArea.length > 0) {
          return res.status(400).json({
            success: false,
            error: 'Já existe uma área com este nome'
          });
        }
      }
      
      const query = `
        UPDATE restaurant_areas SET
          name = COALESCE(?, name),
          description = COALESCE(?, description),
          capacity_lunch = COALESCE(?, capacity_lunch),
          capacity_dinner = COALESCE(?, capacity_dinner),
          is_active = COALESCE(?, is_active),
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `;
      
      const params = [name, description, capacity_lunch, capacity_dinner, is_active, id];
      
      await pool.execute(query, params);
      
      // Buscar a área atualizada
      const [updatedArea] = await pool.execute(
        'SELECT * FROM restaurant_areas WHERE id = ?',
        [id]
      );
      
      res.json({
        success: true,
        message: 'Área atualizada com sucesso',
        area: updatedArea[0]
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
      const [existingArea] = await pool.execute(
        'SELECT id FROM restaurant_areas WHERE id = ?',
        [id]
      );
      
      if (existingArea.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Área não encontrada'
        });
      }
      
      // Verificar se há reservas ou passantes ativos nesta área
      const [activeReservations] = await pool.execute(
        'SELECT COUNT(*) as count FROM restaurant_reservations WHERE area_id = ? AND status IN ("NOVA", "CONFIRMADA")',
        [id]
      );
      
      const [activeWalkIns] = await pool.execute(
        'SELECT COUNT(*) as count FROM walk_ins WHERE area_id = ? AND status = "ATIVO"',
        [id]
      );
      
      if (activeReservations[0].count > 0 || activeWalkIns[0].count > 0) {
        return res.status(400).json({
          success: false,
          error: 'Não é possível deletar uma área com reservas ou passantes ativos'
        });
      }
      
      // Soft delete - marcar como inativa
      await pool.execute(
        'UPDATE restaurant_areas SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
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
      const [area] = await pool.execute(
        'SELECT * FROM restaurant_areas WHERE id = ? AND is_active = 1',
        [id]
      );
      
      if (area.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Área não encontrada'
        });
      }
      
      // Contar reservas confirmadas para a data
      const [reservations] = await pool.execute(
        'SELECT COUNT(*) as count, SUM(number_of_people) as total_people FROM restaurant_reservations WHERE area_id = ? AND reservation_date = ? AND status IN ("NOVA", "CONFIRMADA")',
        [id, date]
      );
      
      // Contar passantes ativos
      const [walkIns] = await pool.execute(
        'SELECT COUNT(*) as count, SUM(number_of_people) as total_people FROM walk_ins WHERE area_id = ? AND DATE(arrival_time) = ? AND status = "ATIVO"',
        [id, date]
      );
      
      const areaData = area[0];
      const reservationCount = reservations[0].count;
      const reservationPeople = reservations[0].total_people || 0;
      const walkInCount = walkIns[0].count;
      const walkInPeople = walkIns[0].total_people || 0;
      
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
