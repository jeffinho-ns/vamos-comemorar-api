// routes/restaurantReservations.js

const express = require('express');
const router = express.Router();

module.exports = (pool) => {
  /**
   * @route   GET /api/restaurant-reservations
   * @desc    Lista todas as reservas do restaurante com filtros opcionais
   * @access  Private
   */
  router.get('/', async (req, res) => {
    try {
      const { date, status, area_id, establishment_id, limit, sort, order } = req.query;
      
      // Verificar se a tabela tem o campo establishment_id
      let hasEstablishmentId = false;
      try {
        const [columns] = await pool.execute('DESCRIBE restaurant_reservations');
        hasEstablishmentId = columns.some(col => col.Field === 'establishment_id');
      } catch (error) {
        console.log('⚠️ Erro ao verificar estrutura da tabela:', error.message);
      }
      
      let query;
      if (hasEstablishmentId) {
        query = `
          SELECT 
            rr.*,
            ra.name as area_name,
            u.name as created_by_name,
            p.name as establishment_name
          FROM restaurant_reservations rr
          LEFT JOIN restaurant_areas ra ON rr.area_id = ra.id
          LEFT JOIN users u ON rr.created_by = u.id
          LEFT JOIN places p ON rr.establishment_id = p.id
          WHERE 1=1
        `;
      } else {
        query = `
          SELECT 
            rr.*,
            ra.name as area_name,
            u.name as created_by_name,
            'Estabelecimento Padrão' as establishment_name
          FROM restaurant_reservations rr
          LEFT JOIN restaurant_areas ra ON rr.area_id = ra.id
          LEFT JOIN users u ON rr.created_by = u.id
          WHERE 1=1
        `;
      }
      
      const params = [];
      
      if (date) {
        query += ` AND rr.reservation_date = ?`;
        params.push(date);
      }
      
      if (status) {
        query += ` AND rr.status = ?`;
        params.push(status);
      }
      
      if (area_id) {
        query += ` AND rr.area_id = ?`;
        params.push(area_id);
      }
      
      if (establishment_id && hasEstablishmentId) {
        query += ` AND rr.establishment_id = ?`;
        params.push(establishment_id);
      }
      
      if (sort && order) {
        query += ` ORDER BY rr.${sort} ${order.toUpperCase()}`;
      } else {
        query += ` ORDER BY rr.reservation_date DESC, rr.reservation_time DESC`;
      }
      
      if (limit) {
        query += ` LIMIT ?`;
        params.push(parseInt(limit));
      }
      
      const [reservations] = await pool.execute(query, params);
      
      res.json({
        success: true,
        reservations: reservations
      });
      
    } catch (error) {
      console.error('❌ Erro ao buscar reservas:', error);
      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor'
      });
    }
  });

  /**
   * @route   GET /api/restaurant-reservations/:id
   * @desc    Busca uma reserva específica
   * @access  Private
   */
  router.get('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      
      const query = `
        SELECT 
          rr.*,
          ra.name as area_name,
          u.name as created_by_name,
          p.name as establishment_name
        FROM restaurant_reservations rr
        LEFT JOIN restaurant_areas ra ON rr.area_id = ra.id
        LEFT JOIN users u ON rr.created_by = u.id
        LEFT JOIN places p ON rr.establishment_id = p.id
        WHERE rr.id = ?
      `;
      
      const [reservations] = await pool.execute(query, [id]);
      
      if (reservations.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Reserva não encontrada'
        });
      }
      
      res.json({
        success: true,
        reservation: reservations[0]
      });
      
    } catch (error) {
      console.error('❌ Erro ao buscar reserva:', error);
      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor'
      });
    }
  });

  /**
   * @route   POST /api/restaurant-reservations
   * @desc    Cria uma nova reserva
   * @access  Private
   */
  router.post('/', async (req, res) => {
    try {
      const {
        client_name,
        client_phone,
        client_email,
        reservation_date,
        reservation_time,
        number_of_people,
        area_id,
        table_number,
        status = 'NOVA',
        origin = 'PESSOAL',
        notes,
        created_by,
        establishment_id = 1
      } = req.body;
      
      console.log('📥 Dados recebidos na API:', JSON.stringify(req.body, null, 2));
      
      // Validações básicas
      if (!client_name || !reservation_date || !reservation_time || !area_id) {
        return res.status(400).json({
          success: false,
          error: 'Campos obrigatórios: client_name, reservation_date, reservation_time, area_id'
        });
      }
      
      // Verificar se a tabela tem o campo establishment_id
      let hasEstablishmentId = false;
      try {
        const [columns] = await pool.execute('DESCRIBE restaurant_reservations');
        hasEstablishmentId = columns.some(col => col.Field === 'establishment_id');
        console.log('🔍 Campo establishment_id existe:', hasEstablishmentId);
      } catch (error) {
        console.log('⚠️ Erro ao verificar estrutura da tabela:', error.message);
      }
      
      let query, params;
      
      if (hasEstablishmentId) {
        query = `
          INSERT INTO restaurant_reservations (
            establishment_id, client_name, client_phone, client_email, reservation_date, 
            reservation_time, number_of_people, area_id, table_number, 
            status, origin, notes, created_by
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        params = [
          establishment_id, client_name, client_phone, client_email, reservation_date,
          reservation_time, number_of_people, area_id, table_number,
          status, origin, notes, created_by
        ];
      } else {
        query = `
          INSERT INTO restaurant_reservations (
            client_name, client_phone, client_email, reservation_date, 
            reservation_time, number_of_people, area_id, table_number, 
            status, origin, notes, created_by
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        params = [
          client_name, client_phone, client_email, reservation_date,
          reservation_time, number_of_people, area_id, table_number,
          status, origin, notes, created_by
        ];
      }
      
      const [result] = await pool.execute(query, params);
      
      // Buscar a reserva criada com dados completos
      let searchQuery;
      if (hasEstablishmentId) {
        searchQuery = `
          SELECT 
            rr.*,
            ra.name as area_name,
            u.name as created_by_name,
            p.name as establishment_name
          FROM restaurant_reservations rr
          LEFT JOIN restaurant_areas ra ON rr.area_id = ra.id
          LEFT JOIN users u ON rr.created_by = u.id
          LEFT JOIN places p ON rr.establishment_id = p.id
          WHERE rr.id = ?
        `;
      } else {
        searchQuery = `
          SELECT 
            rr.*,
            ra.name as area_name,
            u.name as created_by_name,
            'Estabelecimento Padrão' as establishment_name
          FROM restaurant_reservations rr
          LEFT JOIN restaurant_areas ra ON rr.area_id = ra.id
          LEFT JOIN users u ON rr.created_by = u.id
          WHERE rr.id = ?
        `;
      }
      
      const [newReservation] = await pool.execute(searchQuery, [result.insertId]);
      
      res.status(201).json({
        success: true,
        message: 'Reserva criada com sucesso',
        reservation: newReservation[0]
      });
      
    } catch (error) {
      console.error('❌ Erro ao criar reserva:', error);
      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor'
      });
    }
  });

  /**
   * @route   PUT /api/restaurant-reservations/:id
   * @desc    Atualiza uma reserva existente
   * @access  Private
   */
  router.put('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const {
        client_name,
        client_phone,
        client_email,
        reservation_date,
        reservation_time,
        number_of_people,
        area_id,
        table_number,
        status,
        origin,
        notes
      } = req.body;
      
      // Verificar se a reserva existe
      const [existingReservation] = await pool.execute(
        'SELECT id FROM restaurant_reservations WHERE id = ?',
        [id]
      );
      
      if (existingReservation.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Reserva não encontrada'
        });
      }
      
      const query = `
        UPDATE restaurant_reservations SET
          client_name = ?, client_phone = ?, client_email = ?, 
          reservation_date = ?, reservation_time = ?, number_of_people = ?,
          area_id = ?, table_number = ?, status = ?, origin = ?, notes = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `;
      
      const params = [
        client_name, client_phone, client_email, reservation_date,
        reservation_time, number_of_people, area_id, table_number,
        status, origin, notes, id
      ];
      
      await pool.execute(query, params);
      
      // Buscar a reserva atualizada
      const [updatedReservation] = await pool.execute(`
        SELECT 
          rr.*,
          ra.name as area_name,
          u.name as created_by_name,
          p.name as establishment_name
        FROM restaurant_reservations rr
        LEFT JOIN restaurant_areas ra ON rr.area_id = ra.id
        LEFT JOIN users u ON rr.created_by = u.id
        LEFT JOIN places p ON rr.establishment_id = p.id
        WHERE rr.id = ?
      `, [id]);
      
      res.json({
        success: true,
        message: 'Reserva atualizada com sucesso',
        reservation: updatedReservation[0]
      });
      
    } catch (error) {
      console.error('❌ Erro ao atualizar reserva:', error);
      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor'
      });
    }
  });

  /**
   * @route   DELETE /api/restaurant-reservations/:id
   * @desc    Deleta uma reserva
   * @access  Private
   */
  router.delete('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      
      // Verificar se a reserva existe
      const [existingReservation] = await pool.execute(
        'SELECT id FROM restaurant_reservations WHERE id = ?',
        [id]
      );
      
      if (existingReservation.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Reserva não encontrada'
        });
      }
      
      await pool.execute('DELETE FROM restaurant_reservations WHERE id = ?', [id]);
      
      res.json({
        success: true,
        message: 'Reserva deletada com sucesso'
      });
      
    } catch (error) {
      console.error('❌ Erro ao deletar reserva:', error);
      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor'
      });
    }
  });

  /**
   * @route   GET /api/restaurant-reservations/stats/dashboard
   * @desc    Busca estatísticas para o dashboard
   * @access  Private
   */
  router.get('/stats/dashboard', async (req, res) => {
    try {
      const today = new Date().toISOString().split('T')[0];
      
      // Total de reservas
      const [totalReservations] = await pool.execute(
        'SELECT COUNT(*) as count FROM restaurant_reservations'
      );
      
      // Reservas de hoje
      const [todayReservations] = await pool.execute(
        'SELECT COUNT(*) as count FROM restaurant_reservations WHERE reservation_date = ?',
        [today]
      );
      
      // Taxa de ocupação (simplificada)
      const [occupancyRate] = await pool.execute(`
        SELECT 
          (COUNT(CASE WHEN status IN ('CONFIRMADA', 'CONCLUIDA') THEN 1 END) * 100.0 / COUNT(*)) as rate
        FROM restaurant_reservations 
        WHERE reservation_date = ?
      `, [today]);
      
      res.json({
        success: true,
        stats: {
          totalReservations: totalReservations[0].count,
          todayReservations: todayReservations[0].count,
          occupancyRate: Math.round(occupancyRate[0].rate || 0)
        }
      });
      
    } catch (error) {
      console.error('❌ Erro ao buscar estatísticas:', error);
      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor'
      });
    }
  });

  return router;
};
