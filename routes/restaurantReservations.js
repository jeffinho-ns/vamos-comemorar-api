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
          rr.*,
          COALESCE(NULLIF(TRIM(rr.area_display_name), ''), ra.name) as area_name,
          u.name as created_by_name,
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
      const { date, establishment_id, new_reservation_people, time } = req.query;

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

      // Trava só para o mesmo dia + hora: só considera waitlist quando `time` é informado
      // e apenas entradas com preferred_date + preferred_time exatos (mesmo estabelecimento)
      let hasWaitlist = false;
      if (time && String(time).trim()) {
        const timeTrim = String(time).trim();
        const timeHhMm = timeTrim.length >= 5 ? timeTrim.substring(0, 5) : timeTrim;
        const timeHhMmSs = timeHhMm.length === 5 ? timeHhMm + ':00' : timeHhMm;
        const waitlistCountResult = await pool.query(
          `SELECT COUNT(*) as count FROM waitlist
           WHERE status = 'AGUARDANDO' AND establishment_id = $1 AND preferred_date = $2
             AND preferred_time IS NOT NULL
             AND (TRIM(preferred_time::text) = $3 OR TRIM(preferred_time::text) = $4 OR LEFT(TRIM(preferred_time::text), 5) = $5)`,
          [establishment_id, date, timeHhMm, timeHhMmSs, timeHhMm]
        );
        hasWaitlist = parseInt(waitlistCountResult.rows[0].count) > 0;
      }

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
          COALESCE(NULLIF(TRIM(rr.area_display_name), ''), ra.name) as area_name,
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
        send_whatsapp = true,
        blocks_entire_area = false,
        area_display_name,
        has_bistro_table = false
      } = req.body;

      // Validações básicas
      if (!client_name || !client_name.trim()) {
        return res.status(400).json({
          success: false,
          error: 'Campo obrigatório: client_name'
        });
      }
      
      if (!reservation_date) {
        return res.status(400).json({
          success: false,
          error: 'Campo obrigatório: reservation_date'
        });
      }
      
      if (!reservation_time) {
        return res.status(400).json({
          success: false,
          error: 'Campo obrigatório: reservation_time'
        });
      }
      
      // Validação do area_id - deve ser um número válido
      if (!area_id || area_id === '' || area_id === '0') {
        return res.status(400).json({
          success: false,
          error: 'Campo obrigatório: area_id (deve ser um número válido)'
        });
      }
      
      const areaIdNumber = Number(area_id);
      if (isNaN(areaIdNumber) || areaIdNumber <= 0) {
        return res.status(400).json({
          success: false,
          error: `area_id inválido: ${area_id}. Deve ser um número maior que 0.`
        });
      }

      // Validação do establishment_id para evitar inserção nula
      if (establishment_id === null || establishment_id === undefined || establishment_id === '' || establishment_id === '0') {
        return res.status(400).json({
          success: false,
          error: 'establishment_id é obrigatório para criar a reserva.'
        });
      }
      
      const establishmentIdNumber = Number(establishment_id);
      if (isNaN(establishmentIdNumber) || establishmentIdNumber <= 0) {
        return res.status(400).json({
          success: false,
          error: `establishment_id inválido: ${establishment_id}. Deve ser um número maior que 0.`
        });
      }
      
      // Garantir que number_of_people seja um número válido
      const numberOfPeople = Number(number_of_people);
      if (isNaN(numberOfPeople) || numberOfPeople < 1) {
        return res.status(400).json({
          success: false,
          error: `number_of_people inválido: ${number_of_people}. Deve ser um número maior ou igual a 1.`
        });
      }

      // Validação de horários de funcionamento para Seu Justino (ID 1) e Pracinha do Seu Justino (ID 8)
      // Apenas para não-admins (origin !== 'PESSOAL' indica reserva de cliente)
      const isSeuJustino = establishmentIdNumber === 1;
      const isPracinha = establishmentIdNumber === 8;
      const isAdminReservationForTimeValidation = origin === 'PESSOAL';
      
      if ((isSeuJustino || isPracinha) && !isAdminReservationForTimeValidation && reservation_time && reservation_date) {
        const reservationDate = new Date(reservation_date + 'T00:00:00');
        const weekday = reservationDate.getDay(); // 0=Dom, 1=Seg, 2=Ter, 3=Qua, 4=Qui, 5=Sex, 6=Sáb
        const [hours, minutes] = reservation_time.split(':').map(Number);
        const reservationMinutes = hours * 60 + (isNaN(minutes) ? 0 : minutes);
        
        let isValidTime = false;
        
        // Terça a Quinta (2, 3, 4): 18:00 às 01:00 (próximo dia)
        if (weekday >= 2 && weekday <= 4) {
          const startMin = 18 * 60; // 18:00
          const endMin = 1 * 60; // 01:00
          // Horário válido se estiver após 18:00 OU antes de 01:00 (cruza meia-noite)
          isValidTime = reservationMinutes >= startMin || reservationMinutes <= endMin;
        }
        // Sexta e Sábado (5, 6): 18:00 às 03:30 (próximo dia)
        else if (weekday === 5 || weekday === 6) {
          const startMin = 18 * 60; // 18:00
          const endMin = 3 * 60 + 30; // 03:30
          // Horário válido se estiver após 18:00 OU antes de 03:30 (cruza meia-noite)
          isValidTime = reservationMinutes >= startMin || reservationMinutes <= endMin;
        }
        // Domingo (0): 12:00 às 21:00
        else if (weekday === 0) {
          const startMin = 12 * 60; // 12:00
          const endMin = 21 * 60; // 21:00
          isValidTime = reservationMinutes >= startMin && reservationMinutes <= endMin;
        }
        
        if (!isValidTime) {
          let errorMessage = 'Horário fora do funcionamento. ';
          if (weekday >= 2 && weekday <= 4) {
            errorMessage += 'Terça a Quinta: 18:00–01:00';
          } else if (weekday === 5 || weekday === 6) {
            errorMessage += 'Sexta e Sábado: 18:00–03:30';
          } else if (weekday === 0) {
            errorMessage += 'Domingo: 12:00–21:00';
          } else {
            errorMessage += 'Reservas fechadas para este dia.';
          }
          return res.status(400).json({
            success: false,
            error: errorMessage
          });
        }
      }

      // Verificar se há uma reserva bloqueando toda a área para esta data
      // IMPORTANTE: O bloqueio é apenas para a área específica no mesmo estabelecimento
      if (areaIdNumber && reservation_date && establishmentIdNumber) {
        // Verificar se há uma reserva bloqueando a área específica para esta data no mesmo estabelecimento
        const areaBlockedResult = await pool.query(
          `SELECT id, client_name, establishment_id, area_id
           FROM restaurant_reservations
           WHERE reservation_date = $1 
             AND area_id = $2 
             AND establishment_id = $3
             AND blocks_entire_area = TRUE
             AND status NOT IN ('CANCELADA', 'cancelled')`,
          [reservation_date, areaIdNumber, establishmentIdNumber]
        );
        
        if (areaBlockedResult.rows.length > 0) {
          const blockingReservation = areaBlockedResult.rows[0];
          return res.status(400).json({
            success: false,
            error: `A área está completamente bloqueada para esta data pela reserva #${blockingReservation.id} (${blockingReservation.client_name}). Não é possível criar novas reservas nesta área e data.`
          });
        }
      }

      // Validação: se table_number foi informado, verificar conflito considerando horário
      // Para reservas de admin (origin = 'PESSOAL'), permitir criar mesmo com conflito (apenas avisar)
      // Suporta múltiplas mesas separadas por vírgula (ex: "1, 2" ou "1,2")
      const isAdminReservationForConflict = origin === 'PESSOAL';
      
      if (table_number && areaIdNumber && reservation_date) {
        const tableNumberStr = String(table_number).trim();
        const hasMultipleTables = tableNumberStr.includes(',');
        
        // Função auxiliar para verificar sobreposição de horários
        const hasTimeOverlap = (time1, time2) => {
          // Considera que uma reserva dura aproximadamente 2 horas
          // Se os horários estão dentro de 2 horas um do outro, há sobreposição
          const [h1, m1] = time1.split(':').map(Number);
          const [h2, m2] = time2.split(':').map(Number);
          const minutes1 = h1 * 60 + (m1 || 0);
          const minutes2 = h2 * 60 + (m2 || 0);
          const diff = Math.abs(minutes1 - minutes2);
          return diff < 120; // 2 horas em minutos
        };
        
        if (hasMultipleTables) {
          // Múltiplas mesas: validar cada uma individualmente
          const tableNumbers = tableNumberStr.split(',').map(t => t.trim()).filter(t => t);
          
          // Buscar todas as reservas do dia na mesma área com horário
          const allReservationsResult = await pool.query(
            `SELECT id, table_number, reservation_time FROM restaurant_reservations
             WHERE reservation_date = $1 AND area_id = $2 
             AND status NOT IN ('CANCELADA')`,
            [reservation_date, areaIdNumber]
          );
          
          // Verificar se alguma mesa que queremos reservar já está reservada no mesmo horário
          for (const singleTableNumber of tableNumbers) {
            for (const existingReservation of allReservationsResult.rows) {
              const existingTableNumber = String(existingReservation.table_number || '').trim();
              const existingTime = existingReservation.reservation_time;
              
              // Verificar se a mesa está na reserva existente (pode ser única ou múltipla)
              let tableMatches = false;
              if (existingTableNumber === singleTableNumber) {
                tableMatches = true;
              } else if (existingTableNumber.includes(',')) {
                const existingTables = existingTableNumber.split(',').map(t => t.trim());
                if (existingTables.includes(singleTableNumber)) {
                  tableMatches = true;
                }
              }
              
              // Se a mesa coincide, verificar sobreposição de horário
              if (tableMatches) {
                if (hasTimeOverlap(reservation_time, existingTime)) {
                  if (isAdminReservationForConflict) {
                    // Para admin, apenas avisar mas permitir criar
                    console.log(`⚠️ Aviso: Mesa ${singleTableNumber} já tem reserva no horário ${existingTime}, mas permitindo criação (admin)`);
                  } else {
                    // Para clientes, bloquear
                    return res.status(400).json({
                      success: false,
                      error: `Mesa ${singleTableNumber} já está reservada para este horário (${existingTime})`
                    });
                  }
                }
              }
            }
          }
        } else {
          // Mesa única: verificar conflitos (incluindo se está em reservas com múltiplas mesas)
          const allReservationsResult = await pool.query(
            `SELECT id, table_number, reservation_time FROM restaurant_reservations
             WHERE reservation_date = $1 AND area_id = $2 
             AND status NOT IN ('CANCELADA')`,
            [reservation_date, areaIdNumber]
          );
          
          for (const existingReservation of allReservationsResult.rows) {
            const existingTableNumber = String(existingReservation.table_number || '').trim();
            const existingTime = existingReservation.reservation_time;
            
            // Verificar se a mesa coincide
            let tableMatches = false;
            if (existingTableNumber === tableNumberStr) {
              tableMatches = true;
            } else if (existingTableNumber.includes(',')) {
              const existingTables = existingTableNumber.split(',').map(t => t.trim());
              if (existingTables.includes(tableNumberStr)) {
                tableMatches = true;
              }
            }
            
            // Se a mesa coincide, verificar sobreposição de horário
            if (tableMatches) {
              if (hasTimeOverlap(reservation_time, existingTime)) {
                if (isAdminReservationForConflict) {
                  // Para admin, apenas avisar mas permitir criar
                  console.log(`⚠️ Aviso: Mesa ${tableNumberStr} já tem reserva no horário ${existingTime}, mas permitindo criação (admin)`);
                } else {
                  // Para clientes, bloquear
                  return res.status(400).json({
                    success: false,
                    error: `Mesa já está reservada para este horário (${existingTime})`
                  });
                }
              }
            }
          }
        }
      }

      // Validação: se table_number foi informado, conferir se a(s) mesa(s) existe(m) e pertence(m) à área
      // NOTA: Para reservas criadas por admin (origin = 'PESSOAL'), permitir mesas virtuais
      // (mesas que não existem na tabela restaurant_tables mas são válidas para Seu Justino/Highline)
      if (table_number && areaIdNumber) {
        try {
          const tableNumberStr = String(table_number).trim();
          const hasMultipleTables = tableNumberStr.includes(',');
          const isAdminReservation = origin === 'PESSOAL'; // Admin cria com origin 'PESSOAL'
          
          if (hasMultipleTables) {
            // Múltiplas mesas: validar cada uma individualmente
            const tableNumbers = tableNumberStr.split(',').map(t => t.trim()).filter(t => t);
            
            for (const singleTableNumber of tableNumbers) {
              const tableRowResult = await pool.query(
                `SELECT id FROM restaurant_tables WHERE area_id = $1 AND table_number = $2 AND is_active = TRUE LIMIT 1`,
                [areaIdNumber, singleTableNumber]
              );
              
              // Se a mesa não existe na tabela, mas é uma reserva de admin, permitir (mesa virtual)
              if (tableRowResult.rows.length === 0 && !isAdminReservation) {
                return res.status(400).json({ 
                  success: false, 
                  error: `Mesa ${singleTableNumber} inválida para a área selecionada` 
                });
              }
              
              // Se é admin, apenas logar que está usando mesa virtual
              if (tableRowResult.rows.length === 0 && isAdminReservation) {
                console.log(`ℹ️ Admin usando mesa virtual: ${singleTableNumber} na área ${areaIdNumber}`);
              }
            }
          } else {
            // Mesa única: validação original
            const tableRowResult = await pool.query(
              `SELECT id FROM restaurant_tables WHERE area_id = $1 AND table_number = $2 AND is_active = TRUE LIMIT 1`,
              [areaIdNumber, tableNumberStr]
            );
            
            // Se a mesa não existe na tabela, mas é uma reserva de admin, permitir (mesa virtual)
            if (tableRowResult.rows.length === 0 && !isAdminReservation) {
              return res.status(400).json({ success: false, error: 'Mesa inválida para a área selecionada' });
            }
            
            // Se é admin, apenas logar que está usando mesa virtual
            if (tableRowResult.rows.length === 0 && isAdminReservation) {
              console.log(`ℹ️ Admin usando mesa virtual: ${tableNumberStr} na área ${areaIdNumber}`);
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
          status, origin, notes, created_by, establishment_id, evento_id, blocks_entire_area,
          area_display_name, has_bistro_table
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18) RETURNING id
      `;

      // Garantir que todos os parâmetros sejam válidos (usar variáveis convertidas)
      const insertParams = [
        client_name || null,
        client_phone || null,
        client_email || null,
        data_nascimento_cliente || null,
        reservation_date || null,
        reservation_time || null,
        numberOfPeople, // Usar variável convertida
        areaIdNumber, // Usar variável convertida
        table_number || null,
        status || 'NOVA',
        origin || 'PESSOAL',
        notes || null,
        created_by || null,
        establishmentIdNumber, // Usar variável convertida
        evento_id || null,
        blocks_entire_area || false,
        (typeof area_display_name === 'string' && area_display_name.trim()) ? area_display_name.trim() : null,
        has_bistro_table || false
      ];

      console.log('📝 Parâmetros de inserção:', insertParams);
      
      const result = await pool.query(insertQuery, insertParams);
      const reservationId = result.rows[0].id;

      // Buscar a reserva criada com dados completos (area_name = área exibida ao cliente)
      const newReservationResult = await pool.query(`
        SELECT
          rr.*,
          COALESCE(NULLIF(TRIM(rr.area_display_name), ''), ra.name) as area_name,
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
              establishmentId: establishmentIdNumber,
              establishmentName: newReservationResult.rows[0].establishment_name,
              status: 'success',
              additionalData: {
                client_name,
                number_of_people: numberOfPeople,
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
      const isHighLine = establishmentIdNumber === 1;
      const isLargeGroup = numberOfPeople >= 4;
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
          if (typeof eventType === 'string') {
            eventType = eventType.trim() || null;
            // Validar se o event_type é um valor válido do ENUM
            if (eventType && !['aniversario', 'despedida', 'lista_sexta'].includes(eventType.toLowerCase())) {
              eventType = null; // Se for 'outros' ou inválido, usar null
            } else if (eventType) {
              eventType = eventType.toLowerCase();
            }
          }
          
          // Prioridade: valor enviado > regras automáticas > null (nunca default 'despedida' ou 'outros')
          if (isBirthdayReservation && !eventType) {
            eventType = 'aniversario';
          } else if (dayOfWeek === 5 && !eventType) {
            eventType = 'lista_sexta';
          }
          // Se for reserva grande sem event_type, mantém como null (não usa 'outros')

          // Criar a guest list vinculada à reserva
          const glResult = await pool.query(
            `INSERT INTO guest_lists (reservation_id, reservation_type, event_type, shareable_link_token, expires_at)
             VALUES ($1, 'restaurant', $2, $3, $4) RETURNING id`,
            [reservationId, eventType, token, expiresAt]
          );
          const guestListId = glResult.rows[0].id;

          // Dono da reserva como convidado com QR Code próprio (mesmo fluxo do add-guest-list)
          try {
            const hasQr = await pool.query(
              `SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'guests' AND column_name = 'qr_code_token'`
            );
            const hasOwner = await pool.query(
              `SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'guests' AND column_name = 'is_owner'`
            );
            if (hasQr.rows.length > 0 && hasOwner.rows.length > 0) {
              const ownerQrToken = 'vc_guest_' + crypto.randomBytes(24).toString('hex');
              await pool.query(
                `INSERT INTO guests (guest_list_id, name, whatsapp, is_owner, qr_code_token) VALUES ($1, $2, NULL, TRUE, $3)`,
                [guestListId, client_name || 'Dono da reserva', ownerQrToken]
              );
            }
          } catch (err) {
            console.warn('⚠️ Convidado owner não criado na criação da lista (qr_code_token/is_owner):', err.message);
          }

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
        evento_id,
        event_type,
        area_display_name,
        has_bistro_table
      } = req.body;

      // Verificar se a reserva existe e buscar dados atuais
      const existingReservationResult = await pool.query(
        'SELECT id, area_id, reservation_date, establishment_id FROM restaurant_reservations WHERE id = $1',
        [id]
      );

      if (existingReservationResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Reserva não encontrada'
        });
      }

      const existingReservation = existingReservationResult.rows[0];
      
      // Se a data ou área estão sendo alteradas, verificar se há bloqueio
      const newAreaId = area_id !== undefined ? Number(area_id) : existingReservation.area_id;
      const newDate = reservation_date !== undefined ? reservation_date : existingReservation.reservation_date;
      const establishmentId = existingReservation.establishment_id;
      
      // Verificar se há uma reserva bloqueando toda a área para a nova data/área no mesmo estabelecimento (exceto a própria reserva sendo editada)
      if (newAreaId && newDate && establishmentId) {
        const areaBlockedResult = await pool.query(
          `SELECT id, client_name, establishment_id, area_id
           FROM restaurant_reservations
           WHERE reservation_date = $1 
             AND area_id = $2 
             AND establishment_id = $3
             AND blocks_entire_area = TRUE
             AND id != $4
             AND status NOT IN ('CANCELADA', 'cancelled')`,
          [newDate, newAreaId, establishmentId, id]
        );
        
        if (areaBlockedResult.rows.length > 0) {
          const blockingReservation = areaBlockedResult.rows[0];
          return res.status(400).json({
            success: false,
            error: `A área está completamente bloqueada para esta data pela reserva #${blockingReservation.id} (${blockingReservation.client_name}). Não é possível atualizar a reserva para esta área e data.`
          });
        }
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
      if (req.body.blocks_entire_area !== undefined) {
        updateFields.push(`blocks_entire_area = $${paramIndex++}`);
        params.push(req.body.blocks_entire_area === true || req.body.blocks_entire_area === 1);
      }
      if (area_display_name !== undefined) {
        updateFields.push(`area_display_name = $${paramIndex++}`);
        params.push((typeof area_display_name === 'string' && area_display_name.trim()) ? area_display_name.trim() : null);
      }
      if (has_bistro_table !== undefined) {
        updateFields.push(`has_bistro_table = $${paramIndex++}`);
        params.push(has_bistro_table || false);
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

      // Atualizar event_type na guest_list quando existir (Reserva Grande)
      if (event_type !== undefined) {
        const et = event_type == null || String(event_type).trim() === '' ? null : String(event_type).trim();
        const glUpdate = await pool.query(
          `UPDATE guest_lists SET event_type = $1
           WHERE reservation_id = $2 AND reservation_type IN ('restaurant', 'large')`,
          [et, id]
        );
        console.log('📝 event_type recebido:', event_type, '→ persistido:', et, '| linhas atualizadas:', glUpdate.rowCount || 0);
        if ((glUpdate.rowCount || 0) > 0) {
          console.log('✅ event_type da lista de convidados atualizado para reserva', id);
        }
      }

      // Se o status foi alterado para 'completed', verificar lista de espera
      if (status === 'completed') {
        await checkWaitlistAndNotify(pool);
      }

      // Buscar a reserva atualizada (area_name = área exibida ao cliente)
      const updatedReservationResult = await pool.query(`
        SELECT
          rr.*,
          COALESCE(NULLIF(TRIM(rr.area_display_name), ''), ra.name) as area_name,
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

      // Validar e converter o ID
      const reservationId = parseInt(String(id).trim(), 10);
      if (isNaN(reservationId) || reservationId <= 0) {
        console.log('❌ [POST /add-guest-list] ID inválido:', id);
        return res.status(400).json({
          success: false,
          error: 'ID da reserva inválido'
        });
      }

      console.log('📥 [POST /add-guest-list] Recebendo requisição:', {
        reservationId: reservationId,
        reservationId_type: typeof reservationId,
        event_type: event_type,
        event_type_type: typeof event_type
      });

      // Verificar se a reserva existe
      const reservationResult = await pool.query(
        'SELECT * FROM restaurant_reservations WHERE id = $1',
        [reservationId]
      );

      if (!reservationResult.rows || reservationResult.rows.length === 0) {
        console.log('❌ [POST /add-guest-list] Reserva não encontrada:', reservationId);
        return res.status(404).json({
          success: false,
          error: 'Reserva não encontrada'
        });
      }

      const reservation = reservationResult.rows[0];
      const reservationData = reservation;

      console.log('✅ [POST /add-guest-list] Reserva encontrada:', {
        id: reservation.id,
        client_name: reservation.client_name,
        reservation_date: reservation.reservation_date,
        reservation_date_type: typeof reservation.reservation_date
      });

      // Verificar se já existe uma guest list para esta reserva
      const existingGuestListResult = await pool.query(
        `SELECT id FROM guest_lists WHERE reservation_id = $1 AND reservation_type = 'restaurant'`,
        [reservationId]
      );

      if (existingGuestListResult.rows.length > 0) {
        console.log('⚠️ [POST /add-guest-list] Reserva já possui lista de convidados:', reservationId);
        return res.status(400).json({
          success: false,
          error: 'Esta reserva já possui uma lista de convidados'
        });
      }

      // Validar e normalizar event_type
      // O ENUM no banco aceita apenas: 'aniversario', 'despedida', 'lista_sexta'
      // Se for 'outros' ou qualquer valor inválido, usar null
      let validEventType = null;
      if (event_type) {
        const normalizedType = String(event_type).trim().toLowerCase();
        if (['aniversario', 'despedida', 'lista_sexta'].includes(normalizedType)) {
          validEventType = normalizedType;
        }
        // Se for 'outros' ou qualquer outro valor inválido, mantém como null
      }

      // Validar que a reserva tem uma data válida
      if (!reservationData.reservation_date) {
        console.log('❌ [POST /add-guest-list] Reserva sem data:', {
          reservationId: reservationId,
          reservation_date: reservationData.reservation_date
        });
        return res.status(400).json({
          success: false,
          error: 'A reserva não possui uma data válida'
        });
      }

      // Criar a lista de convidados
      const crypto = require('crypto');
      const token = crypto.randomBytes(24).toString('hex');
      
      // Garantir que a data de expiração seja no futuro (adicionar 1 dia após a data da reserva)
      // Tratar diferentes formatos de data que podem vir do PostgreSQL
      let reservationDateObj;
      
      if (reservationData.reservation_date instanceof Date) {
        // Se já é um objeto Date, usar diretamente
        reservationDateObj = new Date(reservationData.reservation_date);
      } else {
        // Se é string, tratar diferentes formatos
        const reservationDateStr = String(reservationData.reservation_date).trim();
        
        // Se já contém 'T' (formato ISO), usar diretamente
        if (reservationDateStr.includes('T')) {
          reservationDateObj = new Date(reservationDateStr);
        } else {
          // Se é formato YYYY-MM-DD, adicionar hora
          reservationDateObj = new Date(reservationDateStr + 'T00:00:00');
        }
      }
      
      console.log('📅 [POST /add-guest-list] Processando data:', {
        reservation_date_raw: reservationData.reservation_date,
        reservation_date_type: typeof reservationData.reservation_date,
        reservation_date_is_date: reservationData.reservation_date instanceof Date,
        reservation_date_obj: reservationDateObj.toISOString(),
        is_valid: !isNaN(reservationDateObj.getTime())
      });
      
      // Validar se a data é válida
      if (isNaN(reservationDateObj.getTime())) {
        console.log('❌ [POST /add-guest-list] Data inválida:', {
          reservationId: reservationId,
          reservation_date: reservationData.reservation_date,
          reservation_date_type: typeof reservationData.reservation_date,
          parsed_date: reservationDateObj
        });
        return res.status(400).json({
          success: false,
          error: 'Data da reserva inválida'
        });
      }
      
      reservationDateObj.setDate(reservationDateObj.getDate() + 1); // +1 dia
      reservationDateObj.setHours(23, 59, 59, 0); // Final do dia
      const expiresAt = reservationDateObj.toISOString().slice(0, 19).replace('T', ' ');

      console.log('💾 [POST /add-guest-list] Inserindo guest list:', {
        reservation_id: reservationId,
        reservation_type: 'restaurant',
        event_type: validEventType,
        expires_at: expiresAt
      });

      const glResult = await pool.query(
        `INSERT INTO guest_lists (reservation_id, reservation_type, event_type, shareable_link_token, expires_at)
         VALUES ($1, 'restaurant', $2, $3, $4) RETURNING id`,
        [reservationId, validEventType, token, expiresAt]
      );
      const guestListId = glResult.rows[0].id;
      
      console.log('✅ [POST /add-guest-list] Guest list criada com sucesso:', guestListId);

      // Dono da reserva como convidado com QR Code próprio (se colunas existirem)
      try {
        const hasQr = await pool.query(
          `SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'guests' AND column_name = 'qr_code_token'`
        );
        const hasOwner = await pool.query(
          `SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'guests' AND column_name = 'is_owner'`
        );
        if (hasQr.rows.length > 0 && hasOwner.rows.length > 0) {
          const ownerQrToken = 'vc_guest_' + crypto.randomBytes(24).toString('hex');
          await pool.query(
            `INSERT INTO guests (guest_list_id, name, whatsapp, is_owner, qr_code_token) VALUES ($1, $2, NULL, TRUE, $3)`,
            [guestListId, reservationData.client_name || 'Dono da reserva', ownerQrToken]
          );
        }
      } catch (err) {
        console.warn('⚠️ Convidado owner não criado (colunas qr_code_token/is_owner podem não existir):', err.message);
      }

      const baseUrl = process.env.PUBLIC_BASE_URL || 'https://agilizaiapp.com.br';
      const guestListLink = `${baseUrl}/lista/${token}`;

      console.log('✅ Lista de convidados adicionada à reserva:', reservationId);

      res.status(201).json({
        success: true,
        message: 'Lista de convidados criada com sucesso',
        guest_list_link: guestListLink,
        shareable_link_token: token
      });

    } catch (error) {
      console.error('❌ Erro ao adicionar lista de convidados:', error);
      console.error('❌ Stack trace:', error.stack);
      console.error('❌ Detalhes:', {
        reservationId: req.params.id,
        eventType: req.body.event_type,
        errorMessage: error.message,
        errorCode: error.code,
        errorDetail: error.detail,
        errorConstraint: error.constraint
      });
      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
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
    const reservationId = parseInt(String(req.params.id).trim(), 10);
    if (isNaN(reservationId) || reservationId < 1) {
      return res.status(400).json({ success: false, error: 'ID da reserva inválido' });
    }

    try {
      // Detectar colunas existentes (checkin_time vs check_in_time; checked_in)
      const colResult = await pool.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = current_schema() AND table_name = 'restaurant_reservations'
        AND column_name IN ('checked_in', 'checkin_time', 'check_in_time')
      `);
      const cols = colResult.rows.map(r => r.column_name);
      const hasCheckedIn = cols.includes('checked_in');
      const hasCheckinTime = cols.includes('checkin_time');
      const hasCheckInTime = cols.includes('check_in_time');
      const timeCol = hasCheckinTime ? 'checkin_time' : (hasCheckInTime ? 'check_in_time' : null);

      if (!hasCheckedIn || !timeCol) {
        try {
          if (!hasCheckedIn) await pool.query('ALTER TABLE restaurant_reservations ADD COLUMN IF NOT EXISTS checked_in SMALLINT DEFAULT 0');
          if (!hasCheckinTime && !hasCheckInTime) await pool.query('ALTER TABLE restaurant_reservations ADD COLUMN IF NOT EXISTS checkin_time TIMESTAMP');
        } catch (migErr) {
          console.warn('⚠️ Migração check-in reserva:', migErr.message);
        }
      }

      const timeColumn = hasCheckinTime ? 'checkin_time' : (hasCheckInTime ? 'check_in_time' : 'checkin_time');

      const reservationResult = await pool.query(
        'SELECT * FROM restaurant_reservations WHERE id = $1',
        [reservationId]
      );
      const reservation = reservationResult.rows[0];

      if (!reservation) {
        return res.status(404).json({
          success: false,
          error: 'Reserva não encontrada'
        });
      }

      const alreadyCheckedIn = reservation.checked_in === 1 || reservation.checked_in === true || reservation.checked_in === '1';
      if (alreadyCheckedIn) {
        const ct = reservation.checkin_time || reservation.check_in_time;
        return res.status(400).json({
          success: false,
          error: 'Check-in já foi realizado para esta reserva',
          checkin_time: ct
        });
      }

      await pool.query(
        `UPDATE restaurant_reservations SET checked_in = TRUE, ${timeColumn} = CURRENT_TIMESTAMP WHERE id = $1`,
        [reservationId]
      );

      console.log(`✅ Check-in da reserva confirmado: ${reservation.client_name} (ID: ${reservationId})`);

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
      console.error('❌ Erro ao fazer check-in da reserva:', error.message || error);
      if (error.code) console.error('   PostgreSQL code:', error.code, 'detail:', error.detail || '');
      const msg = (error.message || String(error)).slice(0, 200);
      res.status(500).json({
        success: false,
        error: 'Erro ao fazer check-in da reserva',
        details: msg
      });
    }
  });

  /**
   * @route   POST /api/restaurant-reservations/:id/checkout
   * @desc    Faz check-out da reserva (mesmo fluxo das listas: check-in + check-out com horários)
   * @access  Private (Admin)
   */
  router.post('/:id/checkout', async (req, res) => {
    const reservationId = parseInt(String(req.params.id).trim(), 10);
    if (isNaN(reservationId) || reservationId < 1) {
      return res.status(400).json({ success: false, error: 'ID da reserva inválido' });
    }
    const eventoIdFromBody = req.body && (req.body.evento_id != null) ? parseInt(String(req.body.evento_id), 10) : null;
    const effectiveEventoId = (!isNaN(eventoIdFromBody) && eventoIdFromBody > 0) ? eventoIdFromBody : null;

    try {
      const colResult = await pool.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = current_schema() AND table_name = 'restaurant_reservations'
        AND column_name IN ('checked_out', 'checkout_time', 'check_out_time')
      `);
      let cols = colResult.rows.map(r => r.column_name);
      const hasCheckedOut = cols.includes('checked_out');
      const hasCheckoutTime = cols.includes('checkout_time');
      const hasCheckOutTime = cols.includes('check_out_time');
      const timeCol = hasCheckoutTime ? 'checkout_time' : (hasCheckOutTime ? 'check_out_time' : null);

      if (!hasCheckedOut || !timeCol) {
        try {
          if (!hasCheckedOut) await pool.query('ALTER TABLE restaurant_reservations ADD COLUMN IF NOT EXISTS checked_out BOOLEAN DEFAULT FALSE');
          if (!hasCheckoutTime && !hasCheckOutTime) await pool.query('ALTER TABLE restaurant_reservations ADD COLUMN IF NOT EXISTS checkout_time TIMESTAMP');
          const reCol = await pool.query(`
            SELECT column_name FROM information_schema.columns
            WHERE table_schema = current_schema() AND table_name = 'restaurant_reservations'
            AND column_name IN ('checked_out', 'checkout_time', 'check_out_time')
          `);
          cols = reCol.rows.map(r => r.column_name);
        } catch (migErr) {
          console.warn('⚠️ Migração check-out reserva:', migErr.message);
        }
      }

      const timeColumn = cols.includes('checkout_time') ? 'checkout_time' : (cols.includes('check_out_time') ? 'check_out_time' : 'checkout_time');

      const reservationResult = await pool.query(
        'SELECT * FROM restaurant_reservations WHERE id = $1',
        [reservationId]
      );
      const reservation = reservationResult.rows[0];

      if (!reservation) {
        return res.status(404).json({ success: false, error: 'Reserva não encontrada' });
      }

      const isCheckedIn = reservation.checked_in === 1 || reservation.checked_in === true || reservation.checked_in === '1';
      if (!isCheckedIn) {
        return res.status(400).json({
          success: false,
          error: 'É necessário fazer check-in antes do check-out'
        });
      }

      const alreadyCheckedOut = reservation.checked_out === 1 || reservation.checked_out === true || reservation.checked_out === '1' || !!reservation.checkout_time;
      if (alreadyCheckedOut) {
        return res.status(400).json({
          success: false,
          error: 'Check-out já foi realizado para esta reserva',
          checkout_time: reservation.checkout_time || reservation.check_out_time
        });
      }

      await pool.query(
        `UPDATE restaurant_reservations SET checked_out = TRUE, ${timeColumn} = CURRENT_TIMESTAMP WHERE id = $1`,
        [reservationId]
      );

      const checkoutTime = new Date().toISOString();
      const checkinTime = reservation.checkin_time || reservation.check_in_time;

      try {
        const tableExists = await pool.query(`
          SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = 'checkouts')
        `);
        if (tableExists.rows[0]?.exists) {
          let areaName = reservation.area_name;
          if (areaName == null && reservation.area_id) {
            const ar = await pool.query('SELECT name FROM restaurant_areas WHERE id = $1', [reservation.area_id]);
            areaName = ar.rows[0]?.name || null;
          }
          const eventoId = effectiveEventoId ?? reservation.evento_id ?? null;
          await pool.query(`
            INSERT INTO checkouts (
              checkout_type, entity_type, entity_id, name,
              checkin_time, checkout_time, status,
              reservation_id, table_number, area_name, establishment_id, evento_id, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, CURRENT_TIMESTAMP)
          `, [
            'reservation', 'restaurant_reservation', reservationId,
            reservation.client_name || '',
            checkinTime || null, checkoutTime, 'concluido',
            reservationId,
            reservation.table_number || null,
            areaName || null,
            reservation.establishment_id || null,
            eventoId
          ]);
          console.log(`✅ Check-out reserva registrado em checkouts: ${reservation.client_name}`);
        }
      } catch (checkoutErr) {
        console.warn('⚠️ Check-out reserva: falha ao inserir em checkouts:', checkoutErr.message);
      }

      console.log(`✅ Check-out da reserva confirmado: ${reservation.client_name} (ID: ${reservationId})`);

      res.json({
        success: true,
        message: 'Check-out da reserva confirmado com sucesso',
        reservation: {
          id: reservation.id,
          client_name: reservation.client_name,
          checked_in: true,
          checked_out: true,
          checkin_time: checkinTime,
          checkout_time: checkoutTime
        }
      });
    } catch (error) {
      console.error('❌ Erro ao fazer check-out da reserva:', error.message || error);
      if (error.code) console.error('   PostgreSQL code:', error.code, 'detail:', error.detail || '');
      const msg = (error.message || String(error)).slice(0, 200);
      res.status(500).json({
        success: false,
        error: 'Erro ao fazer check-out da reserva',
        details: msg
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

      console.log('🔗 Recebendo requisição para vincular reserva ao evento:', {
        reservation_id: id,
        evento_id: evento_id,
        evento_id_type: typeof evento_id,
        body: req.body
      });

      if (!evento_id) {
        return res.status(400).json({
          success: false,
          error: 'evento_id é obrigatório'
        });
      }

      // Garantir que evento_id seja um número válido
      const eventoIdNumber = Number(evento_id);
      if (isNaN(eventoIdNumber) || eventoIdNumber <= 0) {
        return res.status(400).json({
          success: false,
          error: 'evento_id deve ser um número válido maior que zero'
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

      // Verificar se o evento existe (usar o número convertido)
      const eventosResult2 = await pool.query(
        'SELECT id FROM eventos WHERE id = $1',
        [eventoIdNumber]
      );

      if (eventosResult2.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Evento não encontrado'
        });
      }

      // Verificar se o evento pertence ao mesmo estabelecimento (usar o número convertido)
      const eventoDetalhesResult2 = await pool.query(
        'SELECT id_place as establishment_id FROM eventos WHERE id = $1',
        [eventoIdNumber]
      );

      // Converter para números para comparação (evita problemas de tipo string vs number)
      // Se id_place for null, manter como null (não converter para 0)
      const eventoEstablishmentIdRaw = eventoDetalhesResult2.rows.length > 0 ? eventoDetalhesResult2.rows[0].establishment_id : null;
      const eventoEstablishmentId = eventoEstablishmentIdRaw !== null && eventoEstablishmentIdRaw !== undefined 
        ? Number(eventoEstablishmentIdRaw) 
        : null;
      const reservaEstablishmentId = Number(reservation.establishment_id);

      console.log('🔍 Verificando estabelecimentos:', {
        evento_id: eventoIdNumber,
        evento_establishment_id_raw: eventoEstablishmentIdRaw,
        evento_establishment_id: eventoEstablishmentId,
        reserva_establishment_id: reservaEstablishmentId,
        tipos: {
          evento_raw: typeof eventoEstablishmentIdRaw,
          evento: typeof eventoEstablishmentId,
          reserva: typeof reservaEstablishmentId
        },
        sao_iguais: eventoEstablishmentId === reservaEstablishmentId,
        evento_tem_id_place: eventoEstablishmentId !== null
      });

      // Só verificar estabelecimento se o evento tiver id_place definido
      // Se o evento não tiver id_place (null), permitir a vinculação
      if (eventoEstablishmentId !== null && eventoEstablishmentId !== reservaEstablishmentId) {
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
      // Usar o número convertido
      if (reservationType === 'restaurant') {
        await pool.query(
          'UPDATE restaurant_reservations SET evento_id = $1 WHERE id = $2',
          [eventoIdNumber, id]
        );
      } else {
        await pool.query(
          'UPDATE large_reservations SET evento_id = $1 WHERE id = $2',
          [eventoIdNumber, id]
        );
      }
      
      console.log(`✅ Reserva ${id} (tipo: ${reservationType}) vinculada ao evento ${eventoIdNumber}`);

      // Criar uma lista no evento se não existir uma para esta reserva (usar o número convertido)
      const existingListaResult = await pool.query(
        'SELECT lista_id FROM listas WHERE evento_id = $1 AND nome ILIKE $2',
        [eventoIdNumber, `%${reservation.client_name}%`]
      );

      let listaId;
      if (existingListaResult.rows.length > 0) {
        listaId = existingListaResult.rows[0].lista_id;
        console.log(`ℹ️ Lista já existe para esta reserva: ${listaId}`);
      } else {
        // Criar nova lista (usar o número convertido)
        const nomeLista = `Reserva - ${reservation.client_name}`;
        const listaResult = await pool.query(
          'INSERT INTO listas (evento_id, nome, tipo, observacoes) VALUES ($1, $2, $3, $4) RETURNING lista_id',
          [eventoIdNumber, nomeLista, 'Aniversário', `Lista de convidados da reserva #${id}`]
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

      console.log(`✅ Reserva ${id} vinculada ao evento ${eventoIdNumber}. ${copiedGuests} convidados copiados para a lista ${listaId}`);

      res.json({
        success: true,
        message: `Reserva vinculada ao evento com sucesso! ${copiedGuests} convidados foram copiados para a lista do evento.`,
        reservation_id: id,
        evento_id: eventoIdNumber,
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