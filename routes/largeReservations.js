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
      const { date, status, area_id, establishment_id, limit, sort, order, include_cancelled } = req.query;

      let query = `
        SELECT
          lr.id,
          lr.establishment_id,
          lr.client_name,
          lr.client_phone,
          lr.client_email,
          lr.data_nascimento_cliente,
          lr.reservation_date,
          lr.reservation_time,
          lr.number_of_people,
          lr.area_id,
          lr.selected_tables,
          lr.status::TEXT as status,
          lr.origin::TEXT as origin,
          lr.notes,
          lr.admin_notes,
          lr.created_by,
          lr.check_in_time,
          lr.check_out_time,
          lr.email_sent,
          lr.whatsapp_sent,
          lr.created_at,
          lr.updated_at,
          lr.checked_in,
          lr.checkin_time,
          lr.event_type,
          lr.evento_id,
          ra.name as area_name,
          u.name as created_by_name,
          COALESCE(CAST(p.name AS TEXT), CAST(b.name AS TEXT)) as establishment_name
        FROM large_reservations lr
        LEFT JOIN restaurant_areas ra ON lr.area_id = ra.id
        LEFT JOIN users u ON lr.created_by = u.id
        LEFT JOIN places p ON lr.establishment_id = p.id
        LEFT JOIN bars b ON lr.establishment_id = b.id
        WHERE 1=1
      `;
      const params = [];
      let paramIndex = 1;
      
      // Por padrão, excluir reservas canceladas, a menos que include_cancelled=true
      if (include_cancelled !== 'true') {
        query += ` AND lr.status::TEXT NOT IN ('CANCELADA')`;
      }
      
      if (date) {
        query += ` AND lr.reservation_date = $${paramIndex++}`;
        params.push(date);
      }
      if (status) {
        // Normalizar status para maiúsculo (ENUM aceita apenas valores específicos)
        const normalizedStatus = status.toUpperCase();
        query += ` AND lr.status::TEXT = $${paramIndex++}`;
        params.push(normalizedStatus);
      }
      if (area_id) {
        query += ` AND lr.area_id = $${paramIndex++}`;
        params.push(area_id);
      }
      if (establishment_id) {
        query += ` AND lr.establishment_id = $${paramIndex++}`;
        params.push(establishment_id);
        console.log('🔍 Filtrando reservas grandes por establishment_id:', establishment_id);
      }
      if (sort && order) {
        query += ` ORDER BY lr.${sort} ${order.toUpperCase()}`;
      } else {
        query += ` ORDER BY lr.reservation_date DESC, lr.reservation_time DESC`;
      }
      if (limit) {
        query += ` LIMIT $${paramIndex++}`;
        params.push(parseInt(limit));
      }
      const result = await pool.query(query, params);
      const reservations = result.rows;
      console.log(`✅ ${reservations.length} reservas grandes encontradas (canceladas excluídas: ${include_cancelled !== 'true'})`);
      res.json({
        success: true,
        reservations: reservations
      });
    } catch (error) {
      console.error('❌ Erro ao buscar reservas grandes:', error);
      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor',
        message: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
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
          lr.id,
          lr.establishment_id,
          lr.client_name,
          lr.client_phone,
          lr.client_email,
          lr.data_nascimento_cliente,
          lr.reservation_date,
          lr.reservation_time,
          lr.number_of_people,
          lr.area_id,
          lr.selected_tables,
          lr.status::TEXT as status,
          lr.origin::TEXT as origin,
          lr.notes,
          lr.admin_notes,
          lr.created_by,
          lr.check_in_time,
          lr.check_out_time,
          lr.email_sent,
          lr.whatsapp_sent,
          lr.created_at,
          lr.updated_at,
          lr.checked_in,
          lr.checkin_time,
          lr.event_type,
          lr.evento_id,
          ra.name as area_name,
          u.name as created_by_name,
          COALESCE(CAST(p.name AS TEXT), CAST(b.name AS TEXT)) as establishment_name
        FROM large_reservations lr
        LEFT JOIN restaurant_areas ra ON lr.area_id = ra.id
        LEFT JOIN users u ON lr.created_by = u.id
        LEFT JOIN places p ON lr.establishment_id = p.id
        LEFT JOIN bars b ON lr.establishment_id = b.id
        WHERE lr.id = $1
      `;
      const result = await pool.query(query, [id]);
      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Reserva grande não encontrada'
        });
      }
      res.json({
        success: true,
        reservation: result.rows[0]
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
        client_name, client_phone, client_email, data_nascimento_cliente,
        reservation_date, reservation_time, number_of_people, area_id,
        selected_tables, status = 'NOVA', origin = 'CLIENTE',
        notes, admin_notes, created_by, establishment_id,
        send_email, send_whatsapp, event_type
      } = req.body;

      // Validações
      if (!client_name || !reservation_date || !reservation_time || !number_of_people || establishment_id === undefined) {
        return res.status(400).json({ success: false, error: 'Campos essenciais faltando (nome, data, hora, pessoas, estabelecimento).' });
      }
      if (Number(number_of_people) < 11) {
        return res.status(400).json({ success: false, error: 'Esta rota é apenas para reservas com 11+ pessoas.' });
      }

      // Inserção no Banco de Dados
      const insertQuery = `
        INSERT INTO large_reservations (
          client_name, client_phone, client_email, data_nascimento_cliente, reservation_date,
          reservation_time, number_of_people, area_id, selected_tables,
          status, origin, notes, admin_notes, created_by, establishment_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) RETURNING id
      `;

      // ### CORREÇÃO DEFINITIVA AQUI ###
      // Garantimos que todos os campos que podem ser nulos recebam `null` ao invés de `undefined`.
      const insertParams = [
        client_name,
        client_phone || null,
        client_email || null,
        data_nascimento_cliente || null,
        reservation_date,
        reservation_time,
        number_of_people,
        area_id || null, // Garante que area_id também seja nulo se não vier
        selected_tables ? JSON.stringify(selected_tables) : null,
        (status || 'NOVA').toUpperCase(),
        (origin || 'CLIENTE').toUpperCase(),
        notes || null,
        admin_notes || null,
        created_by || null,
        establishment_id
      ];
      
      const result = await pool.query(insertQuery, insertParams);
      const reservationId = result.rows[0].id;

      // O restante do código para buscar a reserva, criar a lista e enviar notificações continua o mesmo.
      const newReservationResult = await pool.query(`
        SELECT
          lr.id,
          lr.establishment_id,
          lr.client_name,
          lr.client_phone,
          lr.client_email,
          lr.data_nascimento_cliente,
          lr.reservation_date,
          lr.reservation_time,
          lr.number_of_people,
          lr.area_id,
          lr.selected_tables,
          lr.status::TEXT as status,
          lr.origin::TEXT as origin,
          lr.notes,
          lr.admin_notes,
          lr.created_by,
          lr.check_in_time,
          lr.check_out_time,
          lr.email_sent,
          lr.whatsapp_sent,
          lr.created_at,
          lr.updated_at,
          lr.checked_in,
          lr.checkin_time,
          lr.event_type,
          lr.evento_id,
          ra.name as area_name,
          u.name as created_by_name,
          COALESCE(CAST(p.name AS TEXT), CAST(b.name AS TEXT)) as establishment_name
        FROM large_reservations lr
        LEFT JOIN restaurant_areas ra ON lr.area_id = ra.id
        LEFT JOIN users u ON lr.created_by = u.id
        LEFT JOIN places p ON lr.establishment_id = p.id
        LEFT JOIN bars b ON lr.establishment_id = b.id
        WHERE lr.id = $1
      `, [reservationId]);

      if (!newReservationResult || newReservationResult.rows.length === 0) {
        console.error(`🚨 FALHA CRÍTICA: Reserva com ID ${reservationId} foi inserida mas não pôde ser recuperada.`);
        return res.status(500).json({ success: false, error: 'Falha ao processar a reserva após a criação.' });
      }
      const newReservation = newReservationResult.rows[0];

      let guestListLink = null;
      const reservationDateObj = new Date(reservation_date + 'T00:00:00');
      const dayOfWeek = reservationDateObj.getDay();
      if (dayOfWeek === 5 || dayOfWeek === 6) { // Sexta ou Sábado
        const detectedEventType = (dayOfWeek === 5) ? 'lista_sexta' : (event_type || null);
        const token = require('crypto').randomBytes(24).toString('hex');
        const expiresAt = `${reservation_date} 23:59:59`;

        await pool.query(
          `INSERT INTO guest_lists (reservation_id, reservation_type, event_type, shareable_link_token, expires_at) VALUES ($1, 'large', $2, $3, $4)`,
          [reservationId, detectedEventType, token, expiresAt]
        );
        const baseUrl = process.env.PUBLIC_BASE_URL || 'https://agilizaiapp.com.br';
        guestListLink = `${baseUrl}/lista/${token}`;
      }
      
      const notificationService = new NotificationService();
      if (send_email && client_email) {
        try { await notificationService.sendLargeReservationConfirmationEmail(newReservation); console.log('✅ Email enviado.'); } 
        catch(e) { console.error('❌ Falha ao enviar email:', e.message); }
      }
      if (send_whatsapp && client_phone) {
        try { await notificationService.sendLargeReservationConfirmationWhatsApp(newReservation); console.log('✅ WhatsApp enviado.'); } 
        catch(e) { console.error('❌ Falha ao enviar WhatsApp:', e.message); }
      }
      try { await notificationService.sendAdminNotification(newReservation); console.log('✅ Notificação para admin enviada.'); } 
      catch (e) { console.error('❌ Falha ao notificar admin:', e.message); }

      const responseBody = {
        success: true,
        message: 'Reserva grande criada com sucesso',
        reservation: newReservation
      };
      if (guestListLink) {
        responseBody.guest_list_link = guestListLink;
      }
      res.status(201).json(responseBody);

    } catch (error) {
      console.error('❌ Erro ao criar reserva grande:', error);
      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor',
        details: error.message
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
      const existingResult = await pool.query(
        'SELECT id FROM large_reservations WHERE id = $1',
        [id]
      );

      if (existingResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Reserva grande não encontrada'
        });
      }

      // Construir query dinamicamente baseado nos campos fornecidos
      let updateFields = [];
      let params = [];
      let paramIndex = 1;

      if (client_name !== undefined) {
        updateFields.push(`client_name = $${paramIndex++}`);
        params.push(client_name);
      }
      if (client_phone !== undefined) {
        updateFields.push(`client_phone = $${paramIndex++}`);
        params.push(client_phone);
      }
      if (client_email !== undefined) {
        updateFields.push(`client_email = $${paramIndex++}`);
        params.push(client_email);
      }
      if (data_nascimento_cliente !== undefined) {
        updateFields.push(`data_nascimento_cliente = $${paramIndex++}`);
        params.push(data_nascimento_cliente);
      }
      if (reservation_date !== undefined) {
        updateFields.push(`reservation_date = $${paramIndex++}`);
        params.push(reservation_date);
      }
      if (reservation_time !== undefined) {
        updateFields.push(`reservation_time = $${paramIndex++}`);
        params.push(reservation_time);
      }
      if (number_of_people !== undefined) {
        updateFields.push(`number_of_people = $${paramIndex++}`);
        params.push(number_of_people);
      }
      if (area_id !== undefined) {
        updateFields.push(`area_id = $${paramIndex++}`);
        params.push(area_id);
      }
      if (selected_tables !== undefined) {
        const selectedTablesJson = Array.isArray(selected_tables) 
          ? JSON.stringify(selected_tables) 
          : selected_tables;
        updateFields.push(`selected_tables = $${paramIndex++}`);
        params.push(selectedTablesJson);
      }
      if (status !== undefined) {
        updateFields.push(`status = $${paramIndex++}`);
        params.push(status);
      }
      if (origin !== undefined) {
        updateFields.push(`origin = $${paramIndex++}`);
        params.push(origin);
      }
      if (notes !== undefined) {
        updateFields.push(`notes = $${paramIndex++}`);
        params.push(notes);
      }
      if (admin_notes !== undefined) {
        updateFields.push(`admin_notes = $${paramIndex++}`);
        params.push(admin_notes);
      }
      if (check_in_time !== undefined) {
        updateFields.push(`check_in_time = $${paramIndex++}`);
        params.push(check_in_time);
      }
      if (check_out_time !== undefined) {
        updateFields.push(`check_out_time = $${paramIndex++}`);
        params.push(check_out_time);
      }

      // Sempre atualizar o timestamp
      updateFields.push('updated_at = CURRENT_TIMESTAMP');
      params.push(id);

      const query = `
        UPDATE large_reservations SET
          ${updateFields.join(', ')}
        WHERE id = $${paramIndex}
      `;

      await pool.query(query, params);

      // Buscar a reserva atualizada
      const updatedResult = await pool.query(`
        SELECT
          lr.*,
          ra.name as area_name,
          u.name as created_by_name,
          COALESCE(CAST(p.name AS TEXT), CAST(b.name AS TEXT)) as establishment_name
        FROM large_reservations lr
        LEFT JOIN restaurant_areas ra ON lr.area_id = ra.id
        LEFT JOIN users u ON lr.created_by = u.id
        LEFT JOIN places p ON lr.establishment_id = p.id
        LEFT JOIN bars b ON lr.establishment_id = b.id
        WHERE lr.id = $1
      `, [id]);

      res.json({
        success: true,
        message: 'Reserva grande atualizada com sucesso',
        reservation: updatedResult.rows[0]
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
      const existingResult = await pool.query(
        'SELECT id FROM large_reservations WHERE id = $1',
        [id]
      );

      if (existingResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Reserva grande não encontrada'
        });
      }

      await pool.query('DELETE FROM large_reservations WHERE id = $1', [id]);

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
      const areasResult = await pool.query(
        'SELECT SUM(capacity_dinner) as total_capacity FROM restaurant_areas'
      );
      const totalCapacity = parseInt(areasResult.rows[0]?.total_capacity) || 0;

      // Contar pessoas das reservas ativas para a data (reservas normais + grandes)
      const activeReservationsResult = await pool.query(`
        SELECT SUM(number_of_people) as total_people
        FROM (
          SELECT number_of_people FROM restaurant_reservations
          WHERE reservation_date = $1 AND establishment_id = $2 AND status IN ('confirmed', 'checked-in')
          UNION ALL
          SELECT number_of_people FROM large_reservations
          WHERE reservation_date = $3 AND establishment_id = $4 AND status::TEXT IN ('CONFIRMADA', 'CHECKED_IN')
        ) as all_reservations
      `, [date, establishment_id, date, establishment_id]);

      const currentPeople = parseInt(activeReservationsResult.rows[0]?.total_people) || 0;
      const newPeople = parseInt(new_reservation_people) || 0;
      const totalWithNew = currentPeople + newPeople;

      // Verificar se há pessoas na lista de espera
      const waitlistCountResult = await pool.query(
        'SELECT COUNT(*) as count FROM waitlist WHERE status = $1',
        ['AGUARDANDO']
      );
      const hasWaitlist = parseInt(waitlistCountResult.rows[0]?.count) > 0;

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
      const totalReservationsResult = await pool.query(
        'SELECT COUNT(*) as count FROM large_reservations'
      );

      // Reservas grandes de hoje
      const todayReservationsResult = await pool.query(
        'SELECT COUNT(*) as count FROM large_reservations WHERE reservation_date = $1',
        [today]
      );

      // Taxa de ocupação (simplificada)
      const occupancyRateResult = await pool.query(`
        SELECT
          COALESCE(
            (COUNT(CASE WHEN status::TEXT IN ('CONFIRMADA', 'CHECKED_IN') THEN 1 END) * 100.0 / NULLIF(COUNT(*), 0)),
            0
          ) as rate
        FROM large_reservations
        WHERE reservation_date = $1
      `, [today]);

      res.json({
        success: true,
        stats: {
          totalReservations: parseInt(totalReservationsResult.rows[0]?.count) || 0,
          todayReservations: parseInt(todayReservationsResult.rows[0]?.count) || 0,
          occupancyRate: Math.round(parseFloat(occupancyRateResult.rows[0]?.rate) || 0)
        }
      });

    } catch (error) {
      console.error('❌ Erro ao buscar estatísticas:', error);
      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor',
        message: error.message
      });
    }
  });

  /**
   * @route   POST /api/large-reservations/:id/checkin
   * @desc    Faz check-in da reserva grande
   * @access  Private (Admin)
   */
  router.post('/:id/checkin', async (req, res) => {
    try {
      const { id } = req.params;

      // Verificar se a reserva existe
      const reservationResult = await pool.query(
        'SELECT * FROM large_reservations WHERE id = $1',
        [id]
      );

      if (reservationResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Reserva grande não encontrada'
        });
      }

      const reservation = reservationResult.rows[0];

      // Verificar se já fez check-in
      if (reservation.checked_in) {
        return res.status(400).json({
          success: false,
          error: 'Check-in já foi realizado para esta reserva',
          checkin_time: reservation.checkin_time
        });
      }

      // Atualizar check-in da reserva e status
      await pool.query(
        'UPDATE large_reservations SET checked_in = 1, checkin_time = CURRENT_TIMESTAMP, status = $1 WHERE id = $2',
        ['CHECKED_IN', id]
      );

      console.log(`✅ Check-in da reserva grande confirmado: ${reservation.client_name} (ID: ${id})`);

      res.json({
        success: true,
        message: 'Check-in da reserva grande confirmado com sucesso',
        reservation: {
          id: reservation[0].id,
          client_name: reservation[0].client_name,
          checked_in: true,
          checkin_time: new Date().toISOString()
        }
      });

    } catch (error) {
      console.error('❌ Erro ao fazer check-in da reserva grande:', error);
      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor'
      });
    }
  });

  return router;
};
