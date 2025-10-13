// routes/restaurantReservations.js

const express = require('express');
const router = express.Router();
const NotificationService = require('../services/notificationService');

module.exports = (pool) => {
  /**
   * @route   GET /api/restaurant-reservations
   * @desc    Lista todas as reservas do restaurante com filtros opcionais
   * @access  Private
   */
  router.get('/', async (req, res) => {
    try {
      const { date, status, area_id, establishment_id, limit, sort, order } = req.query;
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
      if (date) { query += ` AND rr.reservation_date = ?`; params.push(date); }
      if (status) { query += ` AND rr.status = ?`; params.push(status); }
      if (area_id) { query += ` AND rr.area_id = ?`; params.push(area_id); }
      if (establishment_id) { query += ` AND rr.establishment_id = ?`; params.push(establishment_id); }
      if (sort && order) { query += ` ORDER BY rr.${sort} ${order.toUpperCase()}`; } 
      else { query += ` ORDER BY rr.reservation_date DESC, rr.reservation_time DESC`; }
      if (limit) { query += ` LIMIT ?`; params.push(parseInt(limit)); }

      const [reservations] = await pool.execute(query, params);
      res.json({ success: true, reservations });
    } catch (error) {
      console.error('❌ Erro ao buscar reservas:', error);
      res.status(500).json({ success: false, error: 'Erro interno do servidor' });
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
        establishment_id
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
          status, origin, notes, created_by, establishment_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        establishment_id
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
      if (origin === 'SITE' || origin === 'CLIENTE' || origin === 'ADMIN') {
        const notificationService = new NotificationService();
        
        // Enviar email de confirmação
        if (client_email) {
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
        if (client_phone) {
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

        // Enviar notificação para admin
        try {
          await notificationService.sendAdminReservationNotification(newReservation[0]);
          console.log('✅ Notificação admin enviada');
        } catch (error) {
          console.error('❌ Erro ao enviar notificação admin:', error);
        }
      }

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
        check_out_time
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

  return router;
};