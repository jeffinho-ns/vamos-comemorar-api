// routes/restaurantReservations.js

const express = require('express');
const router = express.Router();
const NotificationService = require('../services/notificationService');
const authenticateToken = require('../middleware/auth');
const { logAction } = require('../middleware/actionLogger');

module.exports = (pool) => {
  /**
   * @route   GET /api/restaurant-reservations
   * @desc    Lista todas as reservas do restaurante com filtros opcionais
   * @access  Private
   */
  router.get('/', async (req, res) => {
    try {
      const { date, status, area_id, establishment_id, limit, sort, order, include_cancelled } = req.query;
      
      console.log('🔍 [GET /restaurant-reservations] Parâmetros:', { 
        date, status, area_id, establishment_id, limit, include_cancelled 
      });
      
      let query = `
        SELECT
          rr.*, ra.name as area_name, u.name as created_by_name,
          COALESCE(p.name, b.name) as establishment_name
        FROM restaurant_reservations rr
        LEFT JOIN restaurant_areas ra ON rr.area_id = ra.id
        LEFT JOIN users u ON rr.created_by = u.id
        LEFT JOIN places p ON rr.establishment_id = p.id
        LEFT JOIN bars b ON rr.establishment_id = b.id
        WHERE 1=1
      `;
      const params = [];
      let paramIndex = 1;
      
      // Por padrão, excluir reservas canceladas, a menos que include_cancelled=true
      if (include_cancelled !== 'true') {
        query += ` AND rr.status NOT IN ('cancelled', 'CANCELADA')`;
      }
      
      if (date) { query += ` AND rr.reservation_date = $${paramIndex++}`; params.push(date); }
      if (status) { query += ` AND rr.status = $${paramIndex++}`; params.push(status); }
      if (area_id) { query += ` AND rr.area_id = $${paramIndex++}`; params.push(area_id); }
      if (establishment_id) { query += ` AND rr.establishment_id = $${paramIndex++}`; params.push(establishment_id); }
      if (sort && order) { query += ` ORDER BY rr."${sort}" ${order.toUpperCase()}`; } 
      else { query += ` ORDER BY rr.reservation_date DESC, rr.reservation_time DESC`; }
      if (limit) { query += ` LIMIT $${paramIndex++}`; params.push(parseInt(limit)); }

      const reservationsResult = await pool.query(query, params);
      const reservations = reservationsResult.rows;
      
      console.log(`✅ [GET /restaurant-reservations] ${reservations.length} reservas encontradas`);
      
      if (reservations.length === 0) {
        console.log('⚠️ Nenhuma reserva encontrada. Verifique:');
        console.log('   1. Se há reservas no banco para este estabelecimento');
        console.log('   2. Se as datas estão corretas (ano atual)');
        console.log('   3. Se o establishment_id está correto');
      }
      
      res.json({ success: true, reservations, totalFound: reservations.length });
    } catch (error) {
      console.error('❌ Erro ao buscar reservas:', error);
      res.status(500).json({ success: false, error: 'Erro interno do servidor', message: error.message });
    }
  });

  /**
   * @route   GET /api/restaurant-reservations/capacity/check
   * @desc    Verifica capacidade disponível para uma data específica
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
      const totalCapacity = parseInt(areasResult.rows[0].total_capacity) || 0;

      // Contar pessoas das reservas ativas para a data
      const activeReservationsResult = await pool.query(`
        SELECT SUM(number_of_people) as total_people
        FROM restaurant_reservations
        WHERE reservation_date = $1
        AND establishment_id = $2
        AND status IN ('confirmed', 'checked-in')
      `, [date, establishment_id]);

      const currentPeople = parseInt(activeReservationsResult.rows[0].total_people) || 0;
      const newPeople = parseInt(new_reservation_people) || 0;
      const totalWithNew = currentPeople + newPeople;

      // Verificar se há pessoas na lista de espera
      const waitlistCountResult = await pool.query(
        "SELECT COUNT(*) as count FROM waitlist WHERE status = 'AGUARDANDO'"
      );
      const hasWaitlist = parseInt(waitlistCountResult.rows[0].count) > 0;

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
   * @route   GET /api/restaurant-reservations/stats/dashboard
   * @desc    Busca estatísticas para o dashboard
   * @access  Private
   */
  router.get('/stats/dashboard', async (req, res) => {
    try {
      const today = new Date().toISOString().split('T')[0];

      // Total de reservas
      const totalReservationsResult = await pool.query(
        'SELECT COUNT(*) as count FROM restaurant_reservations'
      );

      // Reservas de hoje
      const todayReservationsResult = await pool.query(
        'SELECT COUNT(*) as count FROM restaurant_reservations WHERE reservation_date = $1',
        [today]
      );

      // Taxa de ocupação (simplificada)
      const occupancyRateResult = await pool.query(`
        SELECT
          (COUNT(CASE WHEN status IN ('confirmed', 'checked-in') THEN 1 END) * 100.0 / COUNT(*)) as rate
        FROM restaurant_reservations
        WHERE reservation_date = $1
      `, [today]);

      res.json({
        success: true,
        stats: {
          totalReservations: parseInt(totalReservationsResult.rows[0].count),
          todayReservations: parseInt(todayReservationsResult.rows[0].count),
          occupancyRate: Math.round(parseFloat(occupancyRateResult.rows[0].rate) || 0)
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
          COALESCE(p.name, b.name) as establishment_name
        FROM restaurant_reservations rr
        LEFT JOIN restaurant_areas ra ON rr.area_id = ra.id
        LEFT JOIN users u ON rr.created_by = u.id
        LEFT JOIN places p ON rr.establishment_id = p.id
        LEFT JOIN bars b ON rr.establishment_id = b.id
        WHERE rr.id = $1
      `;

      const reservationResult = await pool.query(query, [id]);

      if (reservationResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Reserva não encontrada'
        });
      }

      res.json({
        success: true,
        reservation: reservationResult.rows[0]
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
      console.log('📥 Dados recebidos na API:', JSON.stringify(req.body, null, 2));

      const {
        client_name,
        client_phone,
        client_email,
        data_nascimento_cliente,
        reservation_date,
        reservation_time,
        number_of_people,
        area_id,
        table_number,
        status = 'NOVA',
        origin = 'PESSOAL',
        notes,
        created_by,
        establishment_id,
        evento_id,
        send_email = true,
        send_whatsapp = true
      } = req.body;

      // Validações básicas
      if (!client_name || !reservation_date || !reservation_time || !area_id) {
        return res.status(400).json({
          success: false,
          error: 'Campos obrigatórios: client_name, reservation_date, reservation_time, area_id'
        });
      }

      // Validação do establishment_id para evitar inserção nula
      if (establishment_id === null || establishment_id === undefined) {
        return res.status(400).json({
          success: false,
          error: 'establishment_id é obrigatório para criar a reserva.'
        });
      }

      // Validação: se table_number foi informado, verificar conflito no dia inteiro
      if (table_number && area_id && reservation_date) {
        const conflictsResult = await pool.query(
          `SELECT id FROM restaurant_reservations
           WHERE reservation_date = $1 AND area_id = $2 AND table_number = $3
           AND status NOT IN ('CANCELADA')
           LIMIT 1`,
          [reservation_date, area_id, String(table_number)]
        );
        if (conflictsResult.rows.length > 0) {
          return res.status(400).json({
            success: false,
            error: 'Mesa já reservada para este dia'
          });
        }
      }

      // Validação: se table_number foi informado, conferir se a mesa existe e pertence à área
      if (table_number && area_id) {
        try {
          const tableRowResult = await pool.query(
            `SELECT id FROM restaurant_tables WHERE area_id = $1 AND table_number = $2 AND is_active = TRUE LIMIT 1`,
            [area_id, String(table_number)]
          );
          if (tableRowResult.rows.length === 0) {
            return res.status(400).json({ success: false, error: 'Mesa inválida para a área selecionada' });
          }
        } catch (e) {
          // Se a tabela de mesas não existir ainda, segue sem impedir criação
          console.log('ℹ️ Tabela restaurant_tables não encontrada, pulando validação de mesa.');
        }
      }

      // Inserir reserva no banco de dados
      const insertQuery = `
        INSERT INTO restaurant_reservations (
          client_name, client_phone, client_email, data_nascimento_cliente, reservation_date,
          reservation_time, number_of_people, area_id, table_number,
          status, origin, notes, created_by, establishment_id, evento_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) RETURNING id
      `;

      // Garantir que todos os parâmetros sejam válidos
      const insertParams = [
        client_name || null,
        client_phone || null,
        client_email || null,
        data_nascimento_cliente || null,
        reservation_date || null,
        reservation_time || null,
        number_of_people || null,
        area_id || null,
        table_number || null,
        status || 'NOVA',
        origin || 'PESSOAL',
        notes || null,
        created_by || null,
        establishment_id,
        evento_id || null
      ];

      console.log('📝 Parâmetros de inserção:', insertParams);
      
      const result = await pool.query(insertQuery, insertParams);
      const reservationId = result.rows[0].id;

      // Buscar a reserva criada com dados completos
      const newReservationResult = await pool.query(`
        SELECT
          rr.*,
          ra.name as area_name,
          u.name as created_by_name,
          COALESCE(p.name, b.name) as establishment_name
        FROM restaurant_reservations rr
        LEFT JOIN restaurant_areas ra ON rr.area_id = ra.id
        LEFT JOIN users u ON rr.created_by = u.id
        LEFT JOIN places p ON rr.establishment_id = p.id
        LEFT JOIN bars b ON rr.establishment_id = b.id
        WHERE rr.id = $1
      `, [reservationId]);

      // Enviar notificações em criação (cliente e admin)
      const notificationService = new NotificationService();
      
      // Enviar email de confirmação
      if (send_email && client_email) {
        try {
          const emailResult = await notificationService.sendReservationConfirmationEmail(newReservationResult.rows[0]);
          if (emailResult.success) {
            console.log('✅ Email de confirmação enviado');
          } else {
            console.error('❌ Erro ao enviar email:', emailResult.error);
          }
        } catch (error) {
          console.error('❌ Erro ao enviar email:', error);
        }
      }

      // Enviar WhatsApp de confirmação
      if (send_whatsapp && client_phone) {
        try {
          const whatsappResult = await notificationService.sendReservationConfirmationWhatsApp(newReservationResult.rows[0]);
          if (whatsappResult.success) {
            console.log('✅ WhatsApp de confirmação enviado');
          } else {
            console.error('❌ Erro ao enviar WhatsApp:', whatsappResult.error);
          }
        } catch (error) {
          console.error('❌ Erro ao enviar WhatsApp:', error);
        }
      }

      // Enviar notificação para admin (sempre)
      try {
        await notificationService.sendAdminReservationNotification(newReservationResult.rows[0]);
        console.log('✅ Notificação admin enviada');
      } catch (error) {
        console.error('❌ Erro ao enviar notificação admin:', error);
      }

      // Registrar log de ação
      if (created_by) {
        try {
          const userInfoResult = await pool.query('SELECT id, name, email, role FROM users WHERE id = $1', [created_by]);
          if (userInfoResult.rows.length > 0) {
            const user = userInfoResult.rows[0];
            await logAction(pool, {
              userId: user.id,
              userName: user.name,
              userEmail: user.email,
              userRole: user.role,
              actionType: 'create_reservation',
              actionDescription: `Criou reserva para ${client_name} - ${reservation_date} às ${reservation_time}`,
              resourceType: 'restaurant_reservation',
              resourceId: reservationId,
              establishmentId: establishment_id,
              establishmentName: newReservationResult.rows[0].establishment_name,
              status: 'success',
              additionalData: {
                client_name,
                number_of_people,
                area_name: newReservationResult.rows[0].area_name,
                table_number
              }
            });
          }
        } catch (logError) {
          console.error('❌ Erro ao registrar log:', logError);
        }
      }

      // NOVO: Gerar lista de convidados se for reserva grande (4+ pessoas) OU aniversário no HighLine
      let guestListLink = null;
      
      // Critérios para criar lista:
      // 1. Reserva grande (4+ pessoas) OU
      // 2. Aniversário no HighLine (sexta/sábado + establishment_id = 1)
      const reservationDateObj = new Date(reservation_date + 'T00:00:00');
      const dayOfWeek = reservationDateObj.getDay(); // Domingo = 0, Sexta = 5, Sábado = 6
      const isWeekend = dayOfWeek === 5 || dayOfWeek === 6; // Sexta ou Sábado
      const isHighLine = establishment_id === 1;
      const isLargeGroup = number_of_people >= 4;
      const isBirthdayReservation = isWeekend && isHighLine;
      
      if (isLargeGroup || isBirthdayReservation) {
        try {
          const crypto = require('crypto');
          const token = crypto.randomBytes(24).toString('hex');
          
          // Garantir que a data de expiração seja no futuro (adicionar 1 dia após a data da reserva)
          const reservationDateObj = new Date(reservation_date + 'T00:00:00');
          const dayOfWeek = reservationDateObj.getDay();
          
          // Data de expiração: 1 dia após a reserva às 23:59:59
          const expirationDate = new Date(reservation_date + 'T00:00:00');
          expirationDate.setDate(expirationDate.getDate() + 1); // +1 dia
          expirationDate.setHours(23, 59, 59, 0);
          const expiresAt = expirationDate.toISOString().slice(0, 19).replace('T', ' ');

          let eventType = req.body.event_type || null;
          
          // Determinar tipo de evento baseado nos critérios
          if (isBirthdayReservation) {
            // Aniversário no HighLine (sexta/sábado)
            eventType = 'aniversario';
          } else if (dayOfWeek === 5) {
            // Sexta-feira para reservas grandes
            eventType = 'lista_sexta';
          } else if (isLargeGroup) {
            // Reserva grande em outros dias
            eventType = eventType || 'despedida';
          }

          // Criar a guest list vinculada à reserva
          await pool.query(
            `INSERT INTO guest_lists (reservation_id, reservation_type, event_type, shareable_link_token, expires_at)
             VALUES ($1, 'restaurant', $2, $3, $4)`,
            [reservationId, eventType, token, expiresAt]
          );

          const baseUrl = process.env.PUBLIC_BASE_URL || 'https://agilizaiapp.com.br';
          guestListLink = `${baseUrl}/lista/${token}`;
          
          const logMessage = isBirthdayReservation 
            ? `✅ Lista de convidados criada automaticamente para ANIVERSÁRIO no HighLine: ${guestListLink}`
            : `✅ Lista de convidados criada automaticamente para RESERVA GRANDE: ${guestListLink}`;
          console.log(logMessage);
        } catch (guestListError) {
          console.error('❌ Erro ao criar lista de convidados:', guestListError);
          // Não falha a reserva se houver erro na lista de convidados
        }
      }

      const responseBody = {
        success: true,
        message: 'Reserva criada com sucesso',
        reservation: newReservationResult.rows[0]
      };

      // Adicionar o link da lista de convidados se foi criado
      if (guestListLink) {
        responseBody.guest_list_link = guestListLink;
        responseBody.has_guest_list = true;
      }

      res.status(201).json(responseBody);

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
        data_nascimento_cliente,
        reservation_date,
        reservation_time,
        number_of_people,
        area_id,
        table_number,
        status,
        origin,
        notes,
        check_in_time,
        check_out_time,
        evento_id
      } = req.body;

      // Verificar se a reserva existe
      const existingReservationResult = await pool.query(
        'SELECT id FROM restaurant_reservations WHERE id = $1',
        [id]
      );

      if (existingReservationResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Reserva não encontrada'
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
      if (table_number !== undefined) {
        updateFields.push(`table_number = $${paramIndex++}`);
        params.push(table_number);
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
      if (check_in_time !== undefined) {
        updateFields.push(`check_in_time = $${paramIndex++}`);
        params.push(check_in_time);
      }
      if (check_out_time !== undefined) {
        updateFields.push(`check_out_time = $${paramIndex++}`);
        params.push(check_out_time);
      }
      if (evento_id !== undefined) {
        updateFields.push(`evento_id = $${paramIndex++}`);
        params.push(evento_id);
      }

      // Sempre atualizar o timestamp
      updateFields.push('updated_at = CURRENT_TIMESTAMP');
      params.push(id);

      const query = `
        UPDATE restaurant_reservations SET
          ${updateFields.join(', ')}
        WHERE id = $${paramIndex}
      `;

      await pool.query(query, params);

      // Se o status foi alterado para 'completed', verificar lista de espera
      if (status === 'completed') {
        await checkWaitlistAndNotify(pool);
      }

      // Buscar a reserva atualizada
      const updatedReservationResult = await pool.query(`
        SELECT
          rr.*,
          ra.name as area_name,
          u.name as created_by_name,
          COALESCE(p.name, b.name) as establishment_name
        FROM restaurant_reservations rr
        LEFT JOIN restaurant_areas ra ON rr.area_id = ra.id
        LEFT JOIN users u ON rr.created_by = u.id
        LEFT JOIN places p ON rr.establishment_id = p.id
        LEFT JOIN bars b ON rr.establishment_id = b.id
        WHERE rr.id = $1
      `, [id]);

      // Enviar notificações quando o status for confirmado (cliente e admin)
      try {
        if (status && (String(status).toLowerCase() === 'confirmed' || String(status).toUpperCase() === 'CONFIRMADA')) {
          const notificationService = new NotificationService();
          const r = updatedReservationResult.rows[0];
          if (r?.client_email) {
            try {
              const emailResult = await notificationService.sendReservationConfirmedEmail(r);
              if (!emailResult?.success) {
                console.error('❌ Erro ao enviar email de reserva confirmada:', emailResult?.error);
              }
            } catch (e) {
              console.error('❌ Erro ao enviar email de reserva confirmada:', e);
            }
          }
          if (r?.client_phone) {
            try {
              const whatsappResult = await notificationService.sendReservationConfirmedWhatsApp(r);
              if (!whatsappResult?.success) {
                console.error('❌ Erro ao enviar WhatsApp de reserva confirmada:', whatsappResult?.error);
              }
            } catch (e) {
              console.error('❌ Erro ao enviar WhatsApp de reserva confirmada:', e);
            }
          }
        }
      } catch (e) {
        console.error('❌ Erro ao processar notificações de confirmação:', e);
      }

      // Registrar log de ação de atualização
      if (updatedReservationResult.rows[0].created_by) {
        try {
          const userInfoResult = await pool.query('SELECT id, name, email, role FROM users WHERE id = $1', [updatedReservationResult.rows[0].created_by]);
          if (userInfoResult.rows.length > 0) {
            const user = userInfoResult.rows[0];
            const changedFields = [];
            if (status !== undefined) changedFields.push(`status: ${status}`);
            if (table_number !== undefined) changedFields.push(`mesa: ${table_number}`);
            if (reservation_date !== undefined) changedFields.push(`data: ${reservation_date}`);
            
            await logAction(pool, {
              userId: user.id,
              userName: user.name,
              userEmail: user.email,
              userRole: user.role,
              actionType: 'update_reservation',
              actionDescription: `Atualizou reserva #${id} - ${changedFields.join(', ')}`,
              resourceType: 'restaurant_reservation',
              resourceId: id,
              establishmentId: updatedReservationResult.rows[0].establishment_id,
              establishmentName: updatedReservationResult.rows[0].establishment_name,
              status: 'success',
              additionalData: {
                changed_fields: changedFields,
                client_name: updatedReservationResult.rows[0].client_name
              }
            });
          }
        } catch (logError) {
          console.error('❌ Erro ao registrar log:', logError);
        }
      }

      res.json({
        success: true,
        message: 'Reserva atualizada com sucesso',
        reservation: updatedReservationResult.rows[0]
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
      const existingReservationResult = await pool.query(
        'SELECT id FROM restaurant_reservations WHERE id = $1',
        [id]
      );

      if (existingReservationResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Reserva não encontrada'
        });
      }

      await pool.query('DELETE FROM restaurant_reservations WHERE id = $1', [id]);

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



  // Função auxiliar para verificar lista de espera e notificar
  async function checkWaitlistAndNotify(pool) {
    try {
      // Buscar a próxima pessoa na lista de espera
      const nextInLineResult = await pool.query(`
        SELECT * FROM waitlist
        WHERE status = 'AGUARDANDO'
        ORDER BY position ASC, created_at ASC
        LIMIT 1
      `);

      if (nextInLineResult.rows.length > 0) {
        const customer = nextInLineResult.rows[0];

        // Atualizar status para CHAMADO
        await pool.query(
          "UPDATE waitlist SET status = 'CHAMADO', updated_at = CURRENT_TIMESTAMP WHERE id = $1",
          [customer.id]
        );

        // Recalcular posições dos demais
        await recalculateWaitlistPositions(pool);

        console.log(`🔔 Mesa liberada! Cliente chamado: ${customer.client_name} (${customer.number_of_people} pessoas)`);

        return {
          success: true,
          customer: {
            id: customer.id,
            name: customer.client_name,
            people: customer.number_of_people,
            phone: customer.client_phone
          }
        };
      }

      return { success: false, message: 'Nenhum cliente na lista de espera' };

    } catch (error) {
      console.error('❌ Erro ao verificar lista de espera:', error);
      return { success: false, error: error.message };
    }
  }

  // Função auxiliar para recalcular posições da lista de espera
  async function recalculateWaitlistPositions(pool) {
    try {
      const waitingItemsResult = await pool.query(
        "SELECT id FROM waitlist WHERE status = 'AGUARDANDO' ORDER BY created_at ASC"
      );

      for (let i = 0; i < waitingItemsResult.rows.length; i++) {
        const newPosition = i + 1;
        const estimatedWaitTime = i * 15; // 15 minutos por pessoa na frente

        await pool.query(
          'UPDATE waitlist SET position = $1, estimated_wait_time = $2 WHERE id = $3',
          [newPosition, estimatedWaitTime, waitingItemsResult.rows[i].id]
        );
      }
    } catch (error) {
      console.error('❌ Erro ao recalcular posições:', error);
    }
  }

  /**
   * @route   POST /api/restaurant-reservations/:id/add-guest-list
   * @desc    Adiciona uma lista de convidados a uma reserva existente
   * @access  Private (Admin)
   */
  router.post('/:id/add-guest-list', async (req, res) => {
    try {
      const { id } = req.params;
      const { event_type } = req.body;

      // Verificar se a reserva existe
      const reservationResult = await pool.query(
        'SELECT * FROM restaurant_reservations WHERE id = $1',
        [id]
      );
      const reservation = reservationResult.rows[0];

      if (reservation.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Reserva não encontrada'
        });
      }

      const reservationData = reservation;

      // Verificar se já existe uma guest list para esta reserva
      const existingGuestListResult = await pool.query(
        `SELECT id FROM guest_lists WHERE reservation_id = $1 AND reservation_type = 'restaurant'`,
        [id]
      );

      if (existingGuestListResult.rows.length > 0) {
        return res.status(400).json({
          success: false,
          error: 'Esta reserva já possui uma lista de convidados'
        });
      }

      // Criar a lista de convidados
      const crypto = require('crypto');
      const token = crypto.randomBytes(24).toString('hex');
      
      // Garantir que a data de expiração seja no futuro (adicionar 1 dia após a data da reserva)
      const reservationDateObj = new Date(reservationData.reservation_date + 'T00:00:00');
      reservationDateObj.setDate(reservationDateObj.getDate() + 1); // +1 dia
      reservationDateObj.setHours(23, 59, 59, 0); // Final do dia
      const expiresAt = reservationDateObj.toISOString().slice(0, 19).replace('T', ' ');

      await pool.query(
        `INSERT INTO guest_lists (reservation_id, reservation_type, event_type, shareable_link_token, expires_at)
         VALUES ($1, 'restaurant', $2, $3, $4)`,
        [id, event_type || null, token, expiresAt]
      );

      const baseUrl = process.env.PUBLIC_BASE_URL || 'https://agilizaiapp.com.br';
      const guestListLink = `${baseUrl}/lista/${token}`;

      console.log('✅ Lista de convidados adicionada à reserva:', id);

      res.status(201).json({
        success: true,
        message: 'Lista de convidados criada com sucesso',
        guest_list_link: guestListLink,
        shareable_link_token: token
      });

    } catch (error) {
      console.error('❌ Erro ao adicionar lista de convidados:', error);
      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor'
      });
    }
  });

  /**
   * @route   POST /api/restaurant-reservations/:id/checkin-owner
   * @desc    Faz check-in do dono da lista de convidados (aceita ID da guest list)
   * @access  Private (Admin)
   */
  router.post('/:id/checkin-owner', async (req, res) => {
    try {
      const { id } = req.params;
      const { owner_name } = req.body;

      // Primeiro, tentar como ID da guest list
      let guestListId = id;
      
      // Verificar se existe uma guest list com este ID
      const guestListResult = await pool.query(
        `SELECT * FROM guest_lists WHERE id = $1`,
        [id]
      );
      const guestList = guestListResult.rows[0];

      if (!guestList) {
        // Se não encontrou, tentar como reservation_id
        const reservationResult2 = await pool.query(
          'SELECT * FROM restaurant_reservations WHERE id = $1',
          [id]
        );
        const reservation2 = reservationResult2.rows[0];

        if (!reservation2) {
          return res.status(404).json({
            success: false,
            error: 'Reserva ou lista de convidados não encontrada'
          });
        }

        // Buscar a guest list da reserva
        const guestListFromReservationResult = await pool.query(
          `SELECT * FROM guest_lists WHERE reservation_id = $1 AND reservation_type = 'restaurant'`,
          [id]
        );

        if (guestListFromReservationResult.rows.length === 0) {
          return res.status(404).json({
            success: false,
            error: 'Esta reserva não possui lista de convidados'
          });
        }

        guestListId = guestListFromReservationResult.rows[0].id;
      }

      // Atualizar check-in do dono na guest list
      await pool.query(
        `UPDATE guest_lists SET owner_checked_in = 1, owner_checkin_time = CURRENT_TIMESTAMP WHERE id = $1`,
        [guestListId]
      );

      console.log(`✅ Check-in do dono confirmado: ${owner_name} (Guest List #${guestListId})`);

      res.json({
        success: true,
        message: 'Check-in do dono da lista confirmado com sucesso'
      });

    } catch (error) {
      console.error('❌ Erro ao fazer check-in do dono:', error);
      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor'
      });
    }
  });

  /**
   * @route   POST /api/restaurant-reservations/:id/checkin
   * @desc    Faz check-in da reserva
   * @access  Private (Admin)
   */
  router.post('/:id/checkin', async (req, res) => {
    try {
      const { id } = req.params;

      // Verificar se a reserva existe
      const reservationResult = await pool.query(
        'SELECT * FROM restaurant_reservations WHERE id = $1',
        [id]
      );
      const reservation = reservationResult.rows[0];

      if (!reservation) {
        return res.status(404).json({
          success: false,
          error: 'Reserva não encontrada'
        });
      }

      // Verificar se já fez check-in
      if (reservation.checked_in) {
        return res.status(400).json({
          success: false,
          error: 'Check-in já foi realizado para esta reserva',
          checkin_time: reservation.checkin_time
        });
      }

      // Atualizar check-in da reserva
      await pool.query(
        'UPDATE restaurant_reservations SET checked_in = 1, checkin_time = CURRENT_TIMESTAMP WHERE id = $1',
        [id]
      );

      console.log(`✅ Check-in da reserva confirmado: ${reservation.client_name} (ID: ${id})`);

      res.json({
        success: true,
        message: 'Check-in da reserva confirmado com sucesso',
        reservation: {
          id: reservation.id,
          client_name: reservation.client_name,
          checked_in: true,
          checkin_time: new Date().toISOString()
        }
      });

    } catch (error) {
      console.error('❌ Erro ao fazer check-in da reserva:', error);
      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor'
      });
    }
  });

  /**
   * @route   GET /api/restaurant-reservations/:id/guest-list
   * @desc    Busca a lista de convidados de uma reserva
   * @access  Private
   */
  router.get('/:id/guest-list', async (req, res) => {
    try {
      const { id } = req.params;

      // Buscar a guest list da reserva
      const guestListResult = await pool.query(
        `SELECT gl.*, COUNT(g.id) as total_guests
         FROM guest_lists gl
         LEFT JOIN guests g ON g.guest_list_id = gl.id
         WHERE gl.reservation_id = $1 AND gl.reservation_type = 'restaurant'
         GROUP BY gl.id`,
        [id]
      );

      if (guestListResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Esta reserva não possui lista de convidados'
        });
      }

      const guestListData = guestListResult.rows[0];
      const baseUrl = process.env.PUBLIC_BASE_URL || 'https://agilizaiapp.com.br';
      const guestListLink = `${baseUrl}/lista/${guestListData.shareable_link_token}`;

      // Buscar os convidados
      const guestsResult = await pool.query(
        'SELECT id, name, whatsapp, created_at FROM guests WHERE guest_list_id = $1 ORDER BY created_at DESC',
        [guestListData.id]
      );
      const guests = guestsResult.rows;

      res.json({
        success: true,
        guest_list: {
          id: guestListData.id,
          event_type: guestListData.event_type,
          shareable_link_token: guestListData.shareable_link_token,
          expires_at: guestListData.expires_at,
          total_guests: guestListData.total_guests,
          guest_list_link: guestListLink
        },
        guests: guests
      });

    } catch (error) {
      console.error('❌ Erro ao buscar lista de convidados:', error);
      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor'
      });
    }
  });

  /**
   * @route   PUT /api/restaurant-reservations/:id/link-event
   * @desc    Vincula uma reserva a um evento
   * @access  Private
   */
  router.put('/:id/link-event', async (req, res) => {
    try {
      const { id } = req.params;
      const { evento_id } = req.body;

      if (!evento_id) {
        return res.status(400).json({
          success: false,
          error: 'evento_id é obrigatório'
        });
      }

      // Verificar se a reserva existe
      const reservationsResult = await pool.query(
        'SELECT * FROM restaurant_reservations WHERE id = $1',
        [id]
      );

      if (reservationsResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Reserva não encontrada'
        });
      }

      const reservation = reservationsResult.rows[0];

      // Verificar se o evento existe
      const eventosResult = await pool.query(
        'SELECT id FROM eventos WHERE id = $1',
        [evento_id]
      );

      if (eventosResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Evento não encontrado'
        });
      }

      // Verificar se o evento pertence ao mesmo estabelecimento
      const evento = eventosResult.rows[0];
      const eventoDetalhesResult = await pool.query(
        'SELECT id_place as establishment_id FROM eventos WHERE id = $1',
        [evento_id]
      );

      if (eventoDetalhesResult.rows.length > 0 && eventoDetalhesResult.rows[0].establishment_id !== reservation.establishment_id) {
        return res.status(400).json({
          success: false,
          error: 'O evento não pertence ao mesmo estabelecimento da reserva'
        });
      }

      // Atualizar a reserva
      await pool.query(
        'UPDATE restaurant_reservations SET evento_id = $1 WHERE id = $2',
        [evento_id, id]
      );

      console.log(`✅ Reserva ${id} vinculada ao evento ${evento_id}`);

      res.json({
        success: true,
        message: 'Reserva vinculada ao evento com sucesso',
        reservation_id: id,
        evento_id: evento_id
      });

    } catch (error) {
      console.error('❌ Erro ao vincular reserva ao evento:', error);
      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor'
      });
    }
  });

  /**
   * @route   POST /api/restaurant-reservations/:id/link-to-event
   * @desc    Vincula uma reserva a um evento e copia os convidados da guest_list para uma lista do evento
   * @access  Private
   */
  router.post('/:id/link-to-event', async (req, res) => {
    try {
      const { id } = req.params;
      const { evento_id } = req.body;

      if (!evento_id) {
        return res.status(400).json({
          success: false,
          error: 'evento_id é obrigatório'
        });
      }

      // Verificar se a reserva existe em restaurant_reservations ou large_reservations
      // Primeiro tenta restaurant_reservations
      let reservationsResult2 = await pool.query(
        'SELECT *, \'restaurant\' as reservation_type FROM restaurant_reservations WHERE id = $1',
        [id]
      );

      let reservation = null;
      let reservationType = 'restaurant';

      // Se não encontrou em restaurant_reservations, tenta large_reservations
      if (reservationsResult2.rows.length === 0) {
        console.log(`🔍 Reserva ${id} não encontrada em restaurant_reservations, buscando em large_reservations...`);
        const largeReservationsResult = await pool.query(
          'SELECT *, \'large\' as reservation_type FROM large_reservations WHERE id = $1',
          [id]
        );

        if (largeReservationsResult.rows.length === 0) {
          return res.status(404).json({
            success: false,
            error: 'Reserva não encontrada'
          });
        }

        reservation = largeReservationsResult.rows[0];
        reservationType = 'large';
        console.log(`✅ Reserva ${id} encontrada em large_reservations`);
      } else {
        reservation = reservationsResult2.rows[0];
        reservationType = 'restaurant';
        console.log(`✅ Reserva ${id} encontrada em restaurant_reservations`);
      }

      // Verificar se o evento existe
      const eventosResult2 = await pool.query(
        'SELECT id FROM eventos WHERE id = $1',
        [evento_id]
      );

      if (eventosResult2.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Evento não encontrado'
        });
      }

      // Verificar se o evento pertence ao mesmo estabelecimento
      const eventoDetalhesResult2 = await pool.query(
        'SELECT id_place as establishment_id FROM eventos WHERE id = $1',
        [evento_id]
      );

      // Converter para números para comparação (evita problemas de tipo string vs number)
      const eventoEstablishmentId = eventoDetalhesResult2.rows.length > 0 ? Number(eventoDetalhesResult2.rows[0].establishment_id) : null;
      const reservaEstablishmentId = Number(reservation.establishment_id);

      console.log('🔍 Verificando estabelecimentos:', {
        evento_id: evento_id,
        evento_establishment_id: eventoEstablishmentId,
        reserva_establishment_id: reservaEstablishmentId,
        tipos: {
          evento: typeof eventoEstablishmentId,
          reserva: typeof reservaEstablishmentId
        },
        sao_iguais: eventoEstablishmentId === reservaEstablishmentId
      });

      if (eventoDetalhesResult2.rows.length > 0 && eventoEstablishmentId !== reservaEstablishmentId) {
        console.log('❌ Estabelecimentos não correspondem:', {
          evento: eventoEstablishmentId,
          reserva: reservaEstablishmentId
        });
        return res.status(400).json({
          success: false,
          error: 'O evento não pertence ao mesmo estabelecimento da reserva'
        });
      }

      // Verificar se a reserva tem uma guest_list (pode ser do tipo 'restaurant' ou 'large')
      const guestListsResult = await pool.query(
        'SELECT id FROM guest_lists WHERE reservation_id = $1 AND reservation_type = $2',
        [id, reservationType]
      );

      if (guestListsResult.rows.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Esta reserva não possui uma lista de convidados. Adicione uma lista de convidados primeiro.'
        });
      }

      const guestListId = guestListsResult.rows[0].id;

      // Buscar os convidados da guest_list
      const guestsResult2 = await pool.query(
        'SELECT name, whatsapp FROM guests WHERE guest_list_id = $1',
        [guestListId]
      );
      const guests = guestsResult2.rows;

      // Atualizar a reserva para vincular ao evento (pode ser restaurant_reservations ou large_reservations)
      if (reservationType === 'restaurant') {
        await pool.query(
          'UPDATE restaurant_reservations SET evento_id = $1 WHERE id = $2',
          [evento_id, id]
        );
      } else {
        await pool.query(
          'UPDATE large_reservations SET evento_id = $1 WHERE id = $2',
          [evento_id, id]
        );
      }
      
      console.log(`✅ Reserva ${id} (tipo: ${reservationType}) vinculada ao evento ${evento_id}`);

      // Criar uma lista no evento se não existir uma para esta reserva
      const existingListaResult = await pool.query(
        'SELECT lista_id FROM listas WHERE evento_id = $1 AND nome ILIKE $2',
        [evento_id, `%${reservation.client_name}%`]
      );

      let listaId;
      if (existingListaResult.rows.length > 0) {
        listaId = existingListaResult.rows[0].lista_id;
        console.log(`ℹ️ Lista já existe para esta reserva: ${listaId}`);
      } else {
        // Criar nova lista
        const nomeLista = `Reserva - ${reservation.client_name}`;
        const listaResult = await pool.query(
          'INSERT INTO listas (evento_id, nome, tipo, observacoes) VALUES ($1, $2, $3, $4) RETURNING lista_id',
          [evento_id, nomeLista, 'Aniversário', `Lista de convidados da reserva #${id}`]
        );
        listaId = listaResult.rows[0].lista_id;
        console.log(`✅ Lista criada para o evento: ${listaId}`);
      }

      // Copiar os convidados para a lista do evento
      let copiedGuests = 0;
      for (const guest of guests) {
        // Verificar se o convidado já existe na lista
        const existingGuestResult = await pool.query(
          'SELECT lista_convidado_id FROM listas_convidados WHERE lista_id = $1 AND nome_convidado = $2',
          [listaId, guest.name]
        );

        if (existingGuestResult.rows.length === 0) {
          await pool.query(
            'INSERT INTO listas_convidados (lista_id, nome_convidado, telefone_convidado, status_checkin) VALUES ($1, $2, $3, $4)',
            [listaId, guest.name, guest.whatsapp || null, 'Pendente']
          );
          copiedGuests++;
        }
      }

      console.log(`✅ Reserva ${id} vinculada ao evento ${evento_id}. ${copiedGuests} convidados copiados para a lista ${listaId}`);

      res.json({
        success: true,
        message: `Reserva vinculada ao evento com sucesso! ${copiedGuests} convidados foram copiados para a lista do evento.`,
        reservation_id: id,
        evento_id: evento_id,
        lista_id: listaId,
        convidados_copiados: copiedGuests
      });

    } catch (error) {
      console.error('❌ Erro ao vincular reserva ao evento:', error);
      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor'
      });
    }
  });

  return router;
};