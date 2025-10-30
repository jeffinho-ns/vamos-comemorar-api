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
      
      // Por padrão, excluir reservas canceladas, a menos que include_cancelled=true
      if (include_cancelled !== 'true') {
        query += ` AND rr.status NOT IN ('cancelled', 'CANCELADA')`;
      }
      
      if (date) { query += ` AND rr.reservation_date = ?`; params.push(date); }
      if (status) { query += ` AND rr.status = ?`; params.push(status); }
      if (area_id) { query += ` AND rr.area_id = ?`; params.push(area_id); }
      if (establishment_id) { query += ` AND rr.establishment_id = ?`; params.push(establishment_id); }
      if (sort && order) { query += ` ORDER BY rr.${sort} ${order.toUpperCase()}`; } 
      else { query += ` ORDER BY rr.reservation_date DESC, rr.reservation_time DESC`; }
      if (limit) { query += ` LIMIT ?`; params.push(parseInt(limit)); }

      const [reservations] = await pool.execute(query, params);
      
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
      const [areas] = await pool.execute(
        'SELECT SUM(capacity_dinner) as total_capacity FROM restaurant_areas'
      );
      const totalCapacity = areas[0].total_capacity || 0;

      // Contar pessoas das reservas ativas para a data
      const [activeReservations] = await pool.execute(`
        SELECT SUM(number_of_people) as total_people
        FROM restaurant_reservations
        WHERE reservation_date = ?
        AND establishment_id = ?
        AND status IN ('confirmed', 'checked-in')
      `, [date, establishment_id]);

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
          (COUNT(CASE WHEN status IN ('confirmed', 'checked-in') THEN 1 END) * 100.0 / COUNT(*)) as rate
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
        const [conflicts] = await pool.execute(
          `SELECT id FROM restaurant_reservations
           WHERE reservation_date = ? AND area_id = ? AND table_number = ?
           AND status NOT IN ('CANCELADA')
           LIMIT 1`,
          [reservation_date, area_id, String(table_number)]
        );
        if (conflicts.length > 0) {
          return res.status(400).json({
            success: false,
            error: 'Mesa já reservada para este dia'
          });
        }
      }

      // Validação: se table_number foi informado, conferir se a mesa existe e pertence à área
      if (table_number && area_id) {
        try {
          const [tableExists] = await pool.execute(
            `SHOW TABLES LIKE 'restaurant_tables'`
          );
          if (tableExists.length > 0) {
            const [tableRow] = await pool.execute(
              `SELECT id FROM restaurant_tables WHERE area_id = ? AND table_number = ? AND is_active = 1 LIMIT 1`,
              [area_id, String(table_number)]
            );
            if (tableRow.length === 0) {
              return res.status(400).json({ success: false, error: 'Mesa inválida para a área selecionada' });
            }
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
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      
      const [result] = await pool.execute(insertQuery, insertParams);
      const reservationId = result.insertId;

      // Buscar a reserva criada com dados completos
      const [newReservation] = await pool.execute(`
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
        WHERE rr.id = ?
      `, [reservationId]);

      // Enviar notificações em criação (cliente e admin)
      const notificationService = new NotificationService();
      
      // Enviar email de confirmação
      if (send_email && client_email) {
        try {
          const emailResult = await notificationService.sendReservationConfirmationEmail(newReservation[0]);
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
          const whatsappResult = await notificationService.sendReservationConfirmationWhatsApp(newReservation[0]);
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
        await notificationService.sendAdminReservationNotification(newReservation[0]);
        console.log('✅ Notificação admin enviada');
      } catch (error) {
        console.error('❌ Erro ao enviar notificação admin:', error);
      }

      // Registrar log de ação
      if (created_by) {
        try {
          const [userInfo] = await pool.execute('SELECT id, name, email, role FROM users WHERE id = ?', [created_by]);
          if (userInfo.length > 0) {
            const user = userInfo[0];
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
              establishmentName: newReservation[0].establishment_name,
              status: 'success',
              additionalData: {
                client_name,
                number_of_people,
                area_name: newReservation[0].area_name,
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
          await pool.execute(
            `INSERT INTO guest_lists (reservation_id, reservation_type, event_type, shareable_link_token, expires_at)
             VALUES (?, 'restaurant', ?, ?, ?)`,
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
        reservation: newReservation[0]
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
      if (table_number !== undefined) {
        updateFields.push('table_number = ?');
        params.push(table_number);
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
      if (check_in_time !== undefined) {
        updateFields.push('check_in_time = ?');
        params.push(check_in_time);
      }
      if (check_out_time !== undefined) {
        updateFields.push('check_out_time = ?');
        params.push(check_out_time);
      }
      if (evento_id !== undefined) {
        updateFields.push('evento_id = ?');
        params.push(evento_id);
      }

      // Sempre atualizar o timestamp
      updateFields.push('updated_at = CURRENT_TIMESTAMP');
      params.push(id);

      const query = `
        UPDATE restaurant_reservations SET
          ${updateFields.join(', ')}
        WHERE id = ?
      `;

      await pool.execute(query, params);

      // Se o status foi alterado para 'completed', verificar lista de espera
      if (status === 'completed') {
        await checkWaitlistAndNotify(pool);
      }

      // Buscar a reserva atualizada
      const [updatedReservation] = await pool.execute(`
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
        WHERE rr.id = ?
      `, [id]);

      // Enviar notificações quando o status for confirmado (cliente e admin)
      try {
        if (status && (String(status).toLowerCase() === 'confirmed' || String(status).toUpperCase() === 'CONFIRMADA')) {
          const notificationService = new NotificationService();
          const r = updatedReservation[0];
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
      if (updatedReservation[0].created_by) {
        try {
          const [userInfo] = await pool.execute('SELECT id, name, email, role FROM users WHERE id = ?', [updatedReservation[0].created_by]);
          if (userInfo.length > 0) {
            const user = userInfo[0];
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
              establishmentId: updatedReservation[0].establishment_id,
              establishmentName: updatedReservation[0].establishment_name,
              status: 'success',
              additionalData: {
                changed_fields: changedFields,
                client_name: updatedReservation[0].client_name
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



  // Função auxiliar para verificar lista de espera e notificar
  async function checkWaitlistAndNotify(pool) {
    try {
      // Buscar a próxima pessoa na lista de espera
      const [nextInLine] = await pool.execute(`
        SELECT * FROM waitlist
        WHERE status = 'AGUARDANDO'
        ORDER BY position ASC, created_at ASC
        LIMIT 1
      `);

      if (nextInLine.length > 0) {
        const customer = nextInLine[0];

        // Atualizar status para CHAMADO
        await pool.execute(
          'UPDATE waitlist SET status = "CHAMADO", updated_at = CURRENT_TIMESTAMP WHERE id = ?',
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
      const [waitingItems] = await pool.execute(
        'SELECT id FROM waitlist WHERE status = "AGUARDANDO" ORDER BY created_at ASC'
      );

      for (let i = 0; i < waitingItems.length; i++) {
        const newPosition = i + 1;
        const estimatedWaitTime = i * 15; // 15 minutos por pessoa na frente

        await pool.execute(
          'UPDATE waitlist SET position = ?, estimated_wait_time = ? WHERE id = ?',
          [newPosition, estimatedWaitTime, waitingItems[i].id]
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
      const [reservation] = await pool.execute(
        'SELECT * FROM restaurant_reservations WHERE id = ?',
        [id]
      );

      if (reservation.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Reserva não encontrada'
        });
      }

      const reservationData = reservation[0];

      // Verificar se já existe uma guest list para esta reserva
      const [existingGuestList] = await pool.execute(
        `SELECT id FROM guest_lists WHERE reservation_id = ? AND reservation_type = 'restaurant'`,
        [id]
      );

      if (existingGuestList.length > 0) {
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

      await pool.execute(
        `INSERT INTO guest_lists (reservation_id, reservation_type, event_type, shareable_link_token, expires_at)
         VALUES (?, 'restaurant', ?, ?, ?)`,
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
      const [guestList] = await pool.execute(
        `SELECT * FROM guest_lists WHERE id = ?`,
        [id]
      );

      if (guestList.length === 0) {
        // Se não encontrou, tentar como reservation_id
        const [reservation] = await pool.execute(
          'SELECT * FROM restaurant_reservations WHERE id = ?',
          [id]
        );

        if (reservation.length === 0) {
          return res.status(404).json({
            success: false,
            error: 'Reserva ou lista de convidados não encontrada'
          });
        }

        // Buscar a guest list da reserva
        const [guestListFromReservation] = await pool.execute(
          `SELECT * FROM guest_lists WHERE reservation_id = ? AND reservation_type = 'restaurant'`,
          [id]
        );

        if (guestListFromReservation.length === 0) {
          return res.status(404).json({
            success: false,
            error: 'Esta reserva não possui lista de convidados'
          });
        }

        guestListId = guestListFromReservation[0].id;
      }

      // Atualizar check-in do dono na guest list
      await pool.execute(
        `UPDATE guest_lists SET owner_checked_in = 1, owner_checkin_time = CURRENT_TIMESTAMP WHERE id = ?`,
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
      const [reservation] = await pool.execute(
        'SELECT * FROM restaurant_reservations WHERE id = ?',
        [id]
      );

      if (reservation.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Reserva não encontrada'
        });
      }

      // Verificar se já fez check-in
      if (reservation[0].checked_in) {
        return res.status(400).json({
          success: false,
          error: 'Check-in já foi realizado para esta reserva',
          checkin_time: reservation[0].checkin_time
        });
      }

      // Atualizar check-in da reserva
      await pool.execute(
        'UPDATE restaurant_reservations SET checked_in = 1, checkin_time = CURRENT_TIMESTAMP WHERE id = ?',
        [id]
      );

      console.log(`✅ Check-in da reserva confirmado: ${reservation[0].client_name} (ID: ${id})`);

      res.json({
        success: true,
        message: 'Check-in da reserva confirmado com sucesso',
        reservation: {
          id: reservation[0].id,
          client_name: reservation[0].client_name,
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
      const [guestList] = await pool.execute(
        `SELECT gl.*, COUNT(g.id) as total_guests
         FROM guest_lists gl
         LEFT JOIN guests g ON g.guest_list_id = gl.id
         WHERE gl.reservation_id = ? AND gl.reservation_type = 'restaurant'
         GROUP BY gl.id`,
        [id]
      );

      if (guestList.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Esta reserva não possui lista de convidados'
        });
      }

      const guestListData = guestList[0];
      const baseUrl = process.env.PUBLIC_BASE_URL || 'https://agilizaiapp.com.br';
      const guestListLink = `${baseUrl}/lista/${guestListData.shareable_link_token}`;

      // Buscar os convidados
      const [guests] = await pool.execute(
        'SELECT id, name, whatsapp, created_at FROM guests WHERE guest_list_id = ? ORDER BY created_at DESC',
        [guestListData.id]
      );

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
      const [reservations] = await pool.execute(
        'SELECT * FROM restaurant_reservations WHERE id = ?',
        [id]
      );

      if (reservations.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Reserva não encontrada'
        });
      }

      const reservation = reservations[0];

      // Verificar se o evento existe
      const [eventos] = await pool.execute(
        'SELECT id FROM eventos WHERE id = ?',
        [evento_id]
      );

      if (eventos.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Evento não encontrado'
        });
      }

      // Verificar se o evento pertence ao mesmo estabelecimento
      const evento = eventos[0];
      const [eventoDetalhes] = await pool.execute(
        'SELECT id_place as establishment_id FROM eventos WHERE id = ?',
        [evento_id]
      );

      if (eventoDetalhes.length > 0 && eventoDetalhes[0].establishment_id !== reservation.establishment_id) {
        return res.status(400).json({
          success: false,
          error: 'O evento não pertence ao mesmo estabelecimento da reserva'
        });
      }

      // Atualizar a reserva
      await pool.execute(
        'UPDATE restaurant_reservations SET evento_id = ? WHERE id = ?',
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

  return router;
};