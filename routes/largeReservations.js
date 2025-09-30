// routes/largeReservations.js

const express = require('express');
const router = express.Router();
const NotificationService = require('../services/notificationService');

module.exports = (pool) => {
  /**
   * @route   GET /api/large-reservations
   * @desc    Lista todas as reservas grandes com filtros opcionais
   * @access  Private
   */
  router.get('/', async (req, res) => {
    try {
      const { date, status, area_id, establishment_id, limit, sort, order } = req.query;

      let query = `
        SELECT
          lr.*,
          ra.name as area_name,
          u.name as created_by_name,
          COALESCE(p.name, b.name) as establishment_name
        FROM large_reservations lr
        LEFT JOIN restaurant_areas ra ON lr.area_id = ra.id
        LEFT JOIN users u ON lr.created_by = u.id
        LEFT JOIN places p ON lr.establishment_id = p.id
        LEFT JOIN bars b ON lr.establishment_id = b.id
        WHERE 1=1
      `;

      const params = [];

      if (date) {
        query += ` AND lr.reservation_date = ?`;
        params.push(date);
      }

      if (status) {
        query += ` AND lr.status = ?`;
        params.push(status);
      }

      if (area_id) {
        query += ` AND lr.area_id = ?`;
        params.push(area_id);
      }

      if (establishment_id) {
        query += ` AND lr.establishment_id = ?`;
        params.push(establishment_id);
        console.log('🔍 Filtrando reservas grandes por establishment_id:', establishment_id);
      }

      if (sort && order) {
        query += ` ORDER BY lr.${sort} ${order.toUpperCase()}`;
      } else {
        query += ` ORDER BY lr.reservation_date DESC, lr.reservation_time DESC`;
      }

      if (limit) {
        query += ` LIMIT ?`;
        params.push(parseInt(limit));
      }

      const [reservations] = await pool.execute(query, params);

      console.log(`✅ ${reservations.length} reservas grandes encontradas`);

      res.json({
        success: true,
        reservations: reservations
      });

    } catch (error) {
      console.error('❌ Erro ao buscar reservas grandes:', error);
      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor'
      });
    }
  });

  /**
   * @route   GET /api/large-reservations/:id
   * @desc    Busca uma reserva grande específica
   * @access  Private
   */
  router.get('/:id', async (req, res) => {
    try {
      const { id } = req.params;

      const query = `
        SELECT
          lr.*,
          ra.name as area_name,
          u.name as created_by_name,
          COALESCE(p.name, b.name) as establishment_name
        FROM large_reservations lr
        LEFT JOIN restaurant_areas ra ON lr.area_id = ra.id
        LEFT JOIN users u ON lr.created_by = u.id
        LEFT JOIN places p ON lr.establishment_id = p.id
        LEFT JOIN bars b ON lr.establishment_id = b.id
        WHERE lr.id = ?
      `;

      const [reservations] = await pool.execute(query, [id]);

      if (reservations.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Reserva grande não encontrada'
        });
      }

      res.json({
        success: true,
        reservation: reservations[0]
      });

    } catch (error) {
      console.error('❌ Erro ao buscar reserva grande:', error);
      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor'
      });
    }
  });

  /**
   * @route   POST /api/large-reservations
   * @desc    Cria uma nova reserva grande
   * @access  Private
   */
  router.post('/', async (req, res) => {
    try {
      console.log('📥 Dados recebidos na API de reservas grandes:', JSON.stringify(req.body, null, 2));

      const {
        client_name,
        client_phone,
        client_email,
        data_nascimento_cliente,
        reservation_date,
        reservation_time,
        number_of_people,
        area_id,
        selected_tables,
        status = 'NOVA',
        origin = 'CLIENTE',
        notes,
        admin_notes,
        created_by,
        establishment_id
      } = req.body;

      // Validações básicas
      if (!client_name || !reservation_date || !reservation_time || !number_of_people) {
        return res.status(400).json({
          success: false,
          error: 'Campos obrigatórios: client_name, reservation_date, reservation_time, number_of_people'
        });
      }

      // Validar se é realmente uma reserva grande (acima de 15 pessoas)
      if (number_of_people <= 15) {
        return res.status(400).json({
          success: false,
          error: 'Esta rota é apenas para reservas grandes (acima de 15 pessoas)'
        });
      }

      // Validação do establishment_id
      if (establishment_id === null || establishment_id === undefined) {
        return res.status(400).json({
          success: false,
          error: 'establishment_id é obrigatório para criar a reserva.'
        });
      }

      // Converter selected_tables para JSON se for array
      let selectedTablesJson = null;
      if (selected_tables && Array.isArray(selected_tables)) {
        selectedTablesJson = JSON.stringify(selected_tables);
      } else if (selected_tables && typeof selected_tables === 'string') {
        selectedTablesJson = selected_tables;
      }

      // Inserir reserva grande no banco de dados
      const insertQuery = `
        INSERT INTO large_reservations (
          client_name, client_phone, client_email, data_nascimento_cliente, reservation_date,
          reservation_time, number_of_people, area_id, selected_tables,
          status, origin, notes, admin_notes, created_by, establishment_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      const insertParams = [
        client_name || null,
        client_phone || null,
        client_email || null,
        data_nascimento_cliente || null,
        reservation_date || null,
        reservation_time || null,
        number_of_people || null,
        area_id || null,
        selectedTablesJson,
        status || 'NOVA',
        origin || 'CLIENTE',
        notes || null,
        admin_notes || null,
        created_by || null,
        establishment_id
      ];

      console.log('📝 Parâmetros de inserção:', insertParams);
      
      const [result] = await pool.execute(insertQuery, insertParams);
      const reservationId = result.insertId;

      // Buscar a reserva criada com dados completos
      const [newReservation] = await pool.execute(`
        SELECT
          lr.*,
          ra.name as area_name,
          u.name as created_by_name,
          COALESCE(p.name, b.name) as establishment_name
        FROM large_reservations lr
        LEFT JOIN restaurant_areas ra ON lr.area_id = ra.id
        LEFT JOIN users u ON lr.created_by = u.id
        LEFT JOIN places p ON lr.establishment_id = p.id
        LEFT JOIN bars b ON lr.establishment_id = b.id
        WHERE lr.id = ?
      `, [reservationId]);

      // Enviar notificações se for reserva de cliente
      if (origin === 'CLIENTE') {
        const notificationService = new NotificationService();
        
        // Enviar email de confirmação
        if (client_email) {
          const emailResult = await notificationService.sendLargeReservationConfirmationEmail(newReservation[0]);
          if (emailResult.success) {
            await pool.execute(
              'UPDATE large_reservations SET email_sent = 1 WHERE id = ?',
              [reservationId]
            );
            console.log('✅ Email de confirmação enviado');
          }
        }

        // Enviar WhatsApp de confirmação
        if (client_phone) {
          const whatsappResult = await notificationService.sendLargeReservationConfirmationWhatsApp(newReservation[0]);
          if (whatsappResult.success) {
            await pool.execute(
              'UPDATE large_reservations SET whatsapp_sent = 1 WHERE id = ?',
              [reservationId]
            );
            console.log('✅ WhatsApp de confirmação enviado');
          }
        }

        // Enviar notificação para admin
        await notificationService.sendAdminNotification(newReservation[0]);
      }

      res.status(201).json({
        success: true,
        message: 'Reserva grande criada com sucesso',
        reservation: newReservation[0]
      });

    } catch (error) {
      console.error('❌ Erro ao criar reserva grande:', error);
      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor'
      });
    }
  });

  /**
   * @route   PUT /api/large-reservations/:id
   * @desc    Atualiza uma reserva grande existente
   * @access  Private
   */
  router.put('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const {
        client_name,
        client_phone,
        client_email,
        data_nascimento_cliente,
        reservation_date,
        reservation_time,
        number_of_people,
        area_id,
        selected_tables,
        status,
        origin,
        notes,
        admin_notes,
        check_in_time,
        check_out_time
      } = req.body;

      // Verificar se a reserva existe
      const [existingReservation] = await pool.execute(
        'SELECT id FROM large_reservations WHERE id = ?',
        [id]
      );

      if (existingReservation.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Reserva grande não encontrada'
        });
      }

      // Construir query dinamicamente baseado nos campos fornecidos
      let updateFields = [];
      let params = [];

      if (client_name !== undefined) {
        updateFields.push('client_name = ?');
        params.push(client_name);
      }
      if (client_phone !== undefined) {
        updateFields.push('client_phone = ?');
        params.push(client_phone);
      }
      if (client_email !== undefined) {
        updateFields.push('client_email = ?');
        params.push(client_email);
      }
      if (data_nascimento_cliente !== undefined) {
        updateFields.push('data_nascimento_cliente = ?');
        params.push(data_nascimento_cliente);
      }
      if (reservation_date !== undefined) {
        updateFields.push('reservation_date = ?');
        params.push(reservation_date);
      }
      if (reservation_time !== undefined) {
        updateFields.push('reservation_time = ?');
        params.push(reservation_time);
      }
      if (number_of_people !== undefined) {
        updateFields.push('number_of_people = ?');
        params.push(number_of_people);
      }
      if (area_id !== undefined) {
        updateFields.push('area_id = ?');
        params.push(area_id);
      }
      if (selected_tables !== undefined) {
        const selectedTablesJson = Array.isArray(selected_tables) 
          ? JSON.stringify(selected_tables) 
          : selected_tables;
        updateFields.push('selected_tables = ?');
        params.push(selectedTablesJson);
      }
      if (status !== undefined) {
        updateFields.push('status = ?');
        params.push(status);
      }
      if (origin !== undefined) {
        updateFields.push('origin = ?');
        params.push(origin);
      }
      if (notes !== undefined) {
        updateFields.push('notes = ?');
        params.push(notes);
      }
      if (admin_notes !== undefined) {
        updateFields.push('admin_notes = ?');
        params.push(admin_notes);
      }
      if (check_in_time !== undefined) {
        updateFields.push('check_in_time = ?');
        params.push(check_in_time);
      }
      if (check_out_time !== undefined) {
        updateFields.push('check_out_time = ?');
        params.push(check_out_time);
      }

      // Sempre atualizar o timestamp
      updateFields.push('updated_at = CURRENT_TIMESTAMP');
      params.push(id);

      const query = `
        UPDATE large_reservations SET
          ${updateFields.join(', ')}
        WHERE id = ?
      `;

      await pool.execute(query, params);

      // Buscar a reserva atualizada
      const [updatedReservation] = await pool.execute(`
        SELECT
          lr.*,
          ra.name as area_name,
          u.name as created_by_name,
          COALESCE(p.name, b.name) as establishment_name
        FROM large_reservations lr
        LEFT JOIN restaurant_areas ra ON lr.area_id = ra.id
        LEFT JOIN users u ON lr.created_by = u.id
        LEFT JOIN places p ON lr.establishment_id = p.id
        LEFT JOIN bars b ON lr.establishment_id = b.id
        WHERE lr.id = ?
      `, [id]);

      res.json({
        success: true,
        message: 'Reserva grande atualizada com sucesso',
        reservation: updatedReservation[0]
      });

    } catch (error) {
      console.error('❌ Erro ao atualizar reserva grande:', error);
      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor'
      });
    }
  });

  /**
   * @route   DELETE /api/large-reservations/:id
   * @desc    Deleta uma reserva grande
   * @access  Private
   */
  router.delete('/:id', async (req, res) => {
    try {
      const { id } = req.params;

      // Verificar se a reserva existe
      const [existingReservation] = await pool.execute(
        'SELECT id FROM large_reservations WHERE id = ?',
        [id]
      );

      if (existingReservation.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Reserva grande não encontrada'
        });
      }

      await pool.execute('DELETE FROM large_reservations WHERE id = ?', [id]);

      res.json({
        success: true,
        message: 'Reserva grande deletada com sucesso'
      });

    } catch (error) {
      console.error('❌ Erro ao deletar reserva grande:', error);
      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor'
      });
    }
  });

  /**
   * @route   GET /api/large-reservations/capacity/check
   * @desc    Verifica capacidade disponível para uma reserva grande
   * @access  Private
   */
  router.get('/capacity/check', async (req, res) => {
    try {
      const { date, establishment_id, new_reservation_people } = req.query;

      if (!date || !establishment_id) {
        return res.status(400).json({
          success: false,
          error: 'Parâmetros obrigatórios: date, establishment_id'
        });
      }

      // Calcular capacidade total do estabelecimento
      const [areas] = await pool.execute(
        'SELECT SUM(capacity_dinner) as total_capacity FROM restaurant_areas'
      );
      const totalCapacity = areas[0].total_capacity || 0;

      // Contar pessoas das reservas ativas para a data (reservas normais + grandes)
      const [activeReservations] = await pool.execute(`
        SELECT SUM(number_of_people) as total_people
        FROM (
          SELECT number_of_people FROM restaurant_reservations
          WHERE reservation_date = ? AND establishment_id = ? AND status IN ('confirmed', 'checked-in')
          UNION ALL
          SELECT number_of_people FROM large_reservations
          WHERE reservation_date = ? AND establishment_id = ? AND status IN ('CONFIRMADA', 'CHECKED_IN')
        ) as all_reservations
      `, [date, establishment_id, date, establishment_id]);

      const currentPeople = activeReservations[0].total_people || 0;
      const newPeople = parseInt(new_reservation_people) || 0;
      const totalWithNew = currentPeople + newPeople;

      // Verificar se há pessoas na lista de espera
      const [waitlistCount] = await pool.execute(
        'SELECT COUNT(*) as count FROM waitlist WHERE status = "AGUARDANDO"'
      );
      const hasWaitlist = waitlistCount[0].count > 0;

      const canMakeReservation = !hasWaitlist && totalWithNew <= totalCapacity;

      res.json({
        success: true,
        capacity: {
          totalCapacity,
          currentPeople,
          newPeople,
          totalWithNew,
          availableCapacity: totalCapacity - currentPeople,
          hasWaitlist,
          canMakeReservation,
          occupancyPercentage: totalCapacity > 0 ? Math.round((currentPeople / totalCapacity) * 100) : 0
        }
      });

    } catch (error) {
      console.error('❌ Erro ao verificar capacidade:', error);
      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor'
      });
    }
  });

  /**
   * @route   GET /api/large-reservations/stats/dashboard
   * @desc    Busca estatísticas das reservas grandes para o dashboard
   * @access  Private
   */
  router.get('/stats/dashboard', async (req, res) => {
    try {
      const today = new Date().toISOString().split('T')[0];

      // Total de reservas grandes
      const [totalReservations] = await pool.execute(
        'SELECT COUNT(*) as count FROM large_reservations'
      );

      // Reservas grandes de hoje
      const [todayReservations] = await pool.execute(
        'SELECT COUNT(*) as count FROM large_reservations WHERE reservation_date = ?',
        [today]
      );

      // Taxa de ocupação (simplificada)
      const [occupancyRate] = await pool.execute(`
        SELECT
          (COUNT(CASE WHEN status IN ('CONFIRMADA', 'CHECKED_IN') THEN 1 END) * 100.0 / COUNT(*)) as rate
        FROM large_reservations
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
