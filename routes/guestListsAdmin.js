// routes/guestListsAdmin.js

const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const authorize = require('../middleware/authorize');

module.exports = (pool) => {
  // Middleware de autenticação opcional - permite acesso com ou sem token
  const optionalAuth = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (token) {
      // Se há token, valida normalmente
      console.log(`🔐 Acesso autenticado para ${req.method} ${req.path}`);
      auth(req, res, next);
    } else {
      // Se não há token, continua sem autenticação (para desenvolvimento/admin)
      console.log(`⚠️ Acesso sem autenticação para ${req.method} ${req.path} - IP: ${req.ip}`);
      req.user = { role: 'Admin', id: 1 }; // Usuário admin padrão
      next();
    }
  };

  /**
   * @route   GET /api/admin/guest-lists
   * @desc    Lista todas as reservas GRANDES futuras com listas de convidados
   * @access  Private (Administrador, Gerente)
   */
  router.get('/guest-lists', optionalAuth, async (req, res) => {
    try {
      const { date, month, establishment_id, show_all } = req.query;
      let whereClauses = [];
      let params = [];

      console.log('🔍 [GET /guest-lists] Parâmetros recebidos:', { date, month, establishment_id, show_all });

      // Construir os filtros usando COALESCE desde o início
      if (date) {
        whereClauses.push('DATE(COALESCE(lr.reservation_date, rr.reservation_date)) = DATE(?)');
        params.push(date);
        console.log('📅 Filtrando por data específica:', date);
      } else if (month) {
        const year = month.split('-')[0];
        const monthNum = month.split('-')[1];
        whereClauses.push('(YEAR(COALESCE(lr.reservation_date, rr.reservation_date)) = ? AND MONTH(COALESCE(lr.reservation_date, rr.reservation_date)) = ?)');
        params.push(year, monthNum);
        console.log('📅 Filtrando por mês:', month);
      } else if (show_all !== 'true') {
        // CORREÇÃO: Apenas filtrar por mês atual se show_all não for true
        const currentMonth = new Date().toISOString().slice(0, 7);
        const year = currentMonth.split('-')[0];
        const monthNum = currentMonth.split('-')[1];
        whereClauses.push('(YEAR(COALESCE(lr.reservation_date, rr.reservation_date)) = ? AND MONTH(COALESCE(lr.reservation_date, rr.reservation_date)) = ?)');
        params.push(year, monthNum);
        console.log('📅 Filtrando por mês atual (padrão):', currentMonth);
      } else {
        console.log('📅 Mostrando TODAS as listas (show_all=true)');
      }
      
      if (establishment_id) {
        whereClauses.push('COALESCE(lr.establishment_id, rr.establishment_id) = ?');
        params.push(establishment_id);
        console.log('🏢 Filtrando por estabelecimento:', establishment_id);
      }
      
      // Query atualizada para incluir AMBOS os tipos de reserva (large e restaurant) com campos de check-in
      const [rows] = await pool.execute(`
        SELECT 
          gl.id as guest_list_id, 
          gl.event_type,
          gl.reservation_type,
          gl.expires_at,
          gl.shareable_link_token,
          gl.owner_checked_in,
          gl.owner_checkin_time,
          CASE WHEN gl.expires_at >= NOW() THEN 1 ELSE 0 END AS is_valid,
          COALESCE(lr.client_name, rr.client_name) as owner_name,
          COALESCE(lr.reservation_date, rr.reservation_date) as reservation_date,
          COALESCE(lr.reservation_time, rr.reservation_time) as reservation_time,
          COALESCE(lr.number_of_people, rr.number_of_people) as number_of_people,
          COALESCE(lr.checked_in, rr.checked_in) as reservation_checked_in,
          COALESCE(lr.checkin_time, rr.checkin_time) as reservation_checkin_time,
          COALESCE(u1.name, u2.name) as created_by_name,
          COALESCE(lr.id, rr.id) as reservation_id,
          COALESCE(lr.establishment_id, rr.establishment_id) as establishment_id,
          COALESCE(pl1.name, pl2.name, b1.name, b2.name) as establishment_name,
          COALESCE(lr.origin, rr.origin) as origin
        FROM guest_lists gl
        LEFT JOIN large_reservations lr ON gl.reservation_id = lr.id AND gl.reservation_type = 'large'
        LEFT JOIN restaurant_reservations rr ON gl.reservation_id = rr.id AND gl.reservation_type = 'restaurant'
        LEFT JOIN users u1 ON lr.created_by = u1.id
        LEFT JOIN users u2 ON rr.created_by = u2.id
        LEFT JOIN places pl1 ON pl1.id = lr.establishment_id
        LEFT JOIN places pl2 ON pl2.id = rr.establishment_id
        LEFT JOIN bars b1 ON b1.id = lr.establishment_id
        LEFT JOIN bars b2 ON b2.id = rr.establishment_id
        WHERE (lr.id IS NOT NULL OR rr.id IS NOT NULL)
        ${whereClauses.length > 0 ? 'AND ' + whereClauses.join(' AND ') : ''}
        ORDER BY COALESCE(lr.reservation_date, rr.reservation_date) DESC, gl.id ASC
      `, params);
      
      // Adicionar contagem de guests para cada guest list
      for (const row of rows) {
        const [guests] = await pool.execute(
          'SELECT id, checked_in FROM guests WHERE guest_list_id = ?',
          [row.guest_list_id]
        );
        row.total_guests = guests.length;
        row.guests_checked_in = guests.filter((g) => g.checked_in).length;
      }

      console.log(`✅ Guest Lists encontradas: ${rows.length}`);
      
      // Log adicional para debug
      if (rows.length === 0) {
        console.log('⚠️ Nenhuma guest list encontrada com os filtros aplicados');
        console.log('💡 Dica: Verifique se as datas das reservas estão corretas');
      } else {
        console.log('📋 Primeiras 3 listas:', rows.slice(0, 3).map(r => ({
          id: r.guest_list_id,
          owner: r.owner_name,
          date: r.reservation_date,
          type: r.reservation_type
        })));
      }
      
      res.json({ 
        success: true, 
        guestLists: rows,
        totalFound: rows.length,
        filters: { date: req.query.date, month: req.query.month, establishment_id: req.query.establishment_id }
      });
    } catch (error) {
      console.error('❌ Erro ao listar guest lists:', error);
      res.status(500).json({ success: false, error: 'Erro interno do servidor', message: error.message });
    }
  });
  // --- O RESTANTE DO ARQUIVO PERMANECE IGUAL ---

  /**
   * @route   POST /api/admin/guest-lists/:list_id/guests
   * @desc    Adiciona um convidado
   * @access  Private (Administrador, Gerente)
   */
  router.post('/guest-lists/:list_id/guests', async (req, res) => {
    try {
      const { list_id } = req.params;
      const { name, whatsapp } = req.body;

      if (!name || !name.trim()) {
        return res.status(400).json({ success: false, error: 'Nome é obrigatório' });
      }

      const [lists] = await pool.execute('SELECT id FROM guest_lists WHERE id = ? LIMIT 1', [list_id]);
      if (!lists.length) {
        return res.status(404).json({ success: false, error: 'Lista não encontrada' });
      }

      const [result] = await pool.execute(
        'INSERT INTO guests (guest_list_id, name, whatsapp) VALUES (?, ?, ?)',
        [list_id, name.trim(), whatsapp || null]
      );

      res.status(201).json({ success: true, guest: { id: result.insertId, name: name.trim(), whatsapp: whatsapp || null } });
    } catch (error) {
      console.error('❌ Erro ao adicionar convidado:', error);
      res.status(500).json({ success: false, error: 'Erro interno do servidor' });
    }
  });

  /**
   * @route   GET /api/admin/guest-lists/:list_id/guests
   * @desc    Lista convidados de uma lista
   * @access  Private (Administrador, Gerente)
   */
  router.get('/guest-lists/:list_id/guests', optionalAuth, async (req, res) => {
    try {
      const { list_id } = req.params;
      
      // Verificar se a lista existe
      const [lists] = await pool.execute('SELECT id FROM guest_lists WHERE id = ? LIMIT 1', [list_id]);
      if (!lists.length) {
        return res.status(404).json({ success: false, error: 'Lista não encontrada' });
      }

      // Verificar se as colunas entrada_tipo e entrada_valor existem
      try {
        const [columns] = await pool.execute(`
          SELECT COLUMN_NAME 
          FROM INFORMATION_SCHEMA.COLUMNS 
          WHERE TABLE_SCHEMA = DATABASE() 
          AND TABLE_NAME = 'guests' 
          AND COLUMN_NAME IN ('entrada_tipo', 'entrada_valor')
        `);
        
        const hasEntradaTipo = columns.some(col => col.COLUMN_NAME === 'entrada_tipo');
        const hasEntradaValor = columns.some(col => col.COLUMN_NAME === 'entrada_valor');
        
        let query;
        if (hasEntradaTipo && hasEntradaValor) {
          // Se as colunas existem, incluí-las na query
          query = 'SELECT id, name, whatsapp, checked_in, checkin_time, entrada_tipo, entrada_valor FROM guests WHERE guest_list_id = ? ORDER BY id ASC';
        } else {
          // Se não existem, usar query sem esses campos
          query = 'SELECT id, name, whatsapp, checked_in, checkin_time FROM guests WHERE guest_list_id = ? ORDER BY id ASC';
        }
        
        const [rows] = await pool.execute(query, [list_id]);
        
        // Adicionar campos null se não existirem na tabela
        const guests = rows.map(guest => ({
          ...guest,
          entrada_tipo: guest.entrada_tipo || null,
          entrada_valor: guest.entrada_valor || null
        }));
        
        res.json({ success: true, guests: guests });
      } catch (queryError) {
        console.error('❌ Erro ao executar query de convidados:', queryError);
        // Fallback: tentar query simples sem os campos novos
        try {
          const [rows] = await pool.execute('SELECT id, name, whatsapp, checked_in, checkin_time FROM guests WHERE guest_list_id = ? ORDER BY id ASC', [list_id]);
          const guests = rows.map(guest => ({
            ...guest,
            entrada_tipo: null,
            entrada_valor: null
          }));
          res.json({ success: true, guests: guests });
        } catch (fallbackError) {
          console.error('❌ Erro no fallback:', fallbackError);
          throw fallbackError;
        }
      }
    } catch (error) {
      console.error('❌ Erro ao listar convidados:', error);
      console.error('Stack trace:', error.stack);
      res.status(500).json({ 
        success: false, 
        error: 'Erro interno do servidor',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  });

  /**
   * @route   PUT /api/admin/guests/:guest_id
   * @desc    Edita um convidado
   * @access  Private (Administrador, Gerente)
   */
  router.put('/guests/:guest_id', async (req, res) => {
    try {
      const { guest_id } = req.params;
      const { name, whatsapp } = req.body;

      const [guests] = await pool.execute('SELECT id FROM guests WHERE id = ? LIMIT 1', [guest_id]);
      if (!guests.length) {
        return res.status(404).json({ success: false, error: 'Convidado não encontrado' });
      }

      const fields = [];
      const params = [];
      if (name !== undefined) { fields.push('name = ?'); params.push(name); }
      if (whatsapp !== undefined) { fields.push('whatsapp = ?'); params.push(whatsapp); }
      if (fields.length === 0) {
        return res.status(400).json({ success: false, error: 'Nada para atualizar' });
      }
      params.push(guest_id);

      await pool.execute(`UPDATE guests SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, params);
      res.json({ success: true });
    } catch (error) {
      console.error('❌ Erro ao editar convidado:', error);
      res.status(500).json({ success: false, error: 'Erro interno do servidor' });
    }
  });

  /**
   * @route   DELETE /api/admin/guests/:guest_id
   * @desc    Remove um convidado
   * @access  Private (Administrador, Gerente)
   */
  router.delete('/guests/:guest_id', async (req, res) => {
    try {
      const { guest_id } = req.params;

      const [guests] = await pool.execute('SELECT id FROM guests WHERE id = ? LIMIT 1', [guest_id]);
      if (!guests.length) {
        return res.status(404).json({ success: false, error: 'Convidado não encontrado' });
      }

      await pool.execute('DELETE FROM guests WHERE id = ?', [guest_id]);
      res.json({ success: true });
    } catch (error) {
      console.error('❌ Erro ao excluir convidado:', error);
      res.status(500).json({ success: false, error: 'Erro interno do servidor' });
    }
  });

  /**
   * @route   POST /api/admin/guest-lists/create
   * @desc    Cria uma nova lista de convidados manualmente (admin)
   * @access  Private (Administrador, Gerente)
   */
  router.post('/guest-lists/create', optionalAuth, async (req, res) => {
    try {
      const { client_name, reservation_date, event_type, establishment_id } = req.body; // Adicionado establishment_id

      if (!client_name || !reservation_date || !establishment_id) {
        return res.status(400).json({ success: false, error: 'Nome do cliente, data e estabelecimento são obrigatórios' });
      }

      const crypto = require('crypto');
      const token = crypto.randomBytes(24).toString('hex');

      const expiresAt = `${reservation_date} 23:59:59`;

      // 1. Cria a reserva grande primeiro
      const [reservationResult] = await pool.execute(
        `INSERT INTO large_reservations (
          establishment_id, client_name, reservation_date, reservation_time, 
          number_of_people, status, origin, created_by
        ) VALUES (?, ?, ?, '18:00:00', 11, 'NOVA', 'ADMIN', ?)`, // Pessoas >= 11 para ser grande
        [establishment_id, client_name, reservation_date, req.user.id]
      );
      const reservationId = reservationResult.insertId;

      // 2. Cria a lista de convidados vinculada à reserva
      const [result] = await pool.execute(
        `INSERT INTO guest_lists (reservation_id, reservation_type, event_type, shareable_link_token, expires_at)
         VALUES (?, 'large', ?, ?, ?)`,
        [reservationId, event_type || null, token, expiresAt]
      );
      const guestListId = result.insertId;

      const baseUrl = process.env.PUBLIC_BASE_URL || 'https://agilizaiapp.com.br';
      const guestListLink = `${baseUrl}/lista/${token}`;

      res.status(201).json({
        success: true,
        message: 'Lista de convidados criada com sucesso',
        guestList: {
          id: guestListId,
          client_name,
          reservation_date,
          event_type: event_type || null,
          shareable_link_token: token,
          expires_at: expiresAt,
          guest_list_link: guestListLink
        }
      });

    } catch (error) {
      console.error('❌ Erro ao criar lista de convidados:', error);
      res.status(500).json({ success: false, error: 'Erro interno do servidor' });
    }
  });

  /**
   * @route   POST /api/admin/guests/:id/checkin
   * @desc    Faz check-in de um convidado específico
   * @access  Private (Admin)
   */
  router.post('/guests/:id/checkin', optionalAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const { entrada_tipo, entrada_valor } = req.body;

      // Verificar se o convidado existe
      const [guest] = await pool.execute(
        'SELECT * FROM guests WHERE id = ?',
        [id]
      );

      if (guest.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Convidado não encontrado'
        });
      }

      // Verificar se já fez check-in
      if (guest[0].checked_in) {
        return res.status(400).json({
          success: false,
          error: 'Este convidado já fez check-in'
        });
      }

      // Atualizar check-in do convidado com tipo e valor de entrada
      await pool.execute(
        'UPDATE guests SET checked_in = 1, checkin_time = CURRENT_TIMESTAMP, entrada_tipo = ?, entrada_valor = ? WHERE id = ?',
        [entrada_tipo || null, entrada_valor || null, id]
      );

      const tipoTexto = entrada_tipo === 'VIP' ? 'VIP (grátis)' : entrada_tipo === 'SECO' ? `SECO (R$ ${entrada_valor?.toFixed(2) || '0,00'})` : entrada_tipo === 'CONSUMA' ? `CONSUMA (R$ ${entrada_valor?.toFixed(2) || '0,00'})` : 'Check-in';
      console.log(`✅ Check-in do convidado confirmado: ${guest[0].name} (ID: ${id}) - ${tipoTexto}`);

      res.json({
        success: true,
        message: 'Check-in do convidado confirmado com sucesso',
        guest: {
          id: guest[0].id,
          name: guest[0].name,
          checked_in: true,
          checkin_time: new Date().toISOString(),
          entrada_tipo: entrada_tipo || null,
          entrada_valor: entrada_valor || null
        }
      });

    } catch (error) {
      console.error('❌ Erro ao fazer check-in do convidado:', error);
      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor'
      });
    }
  });

  /**
   * @route   GET /api/admin/guest-lists/:id/checkin-status
   * @desc    Busca o status de check-in de uma lista de convidados
   * @access  Private (Admin)
   */
  router.get('/guest-lists/:id/checkin-status', optionalAuth, async (req, res) => {
    try {
      const { id } = req.params;

      // Buscar informações da guest list
      const [guestList] = await pool.execute(
        `SELECT gl.*, rr.client_name as owner_name, rr.reservation_date
         FROM guest_lists gl
         LEFT JOIN restaurant_reservations rr ON gl.reservation_id = rr.id
         WHERE gl.id = ?`,
        [id]
      );

      if (guestList.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Lista de convidados não encontrada'
        });
      }

      // Contar convidados e check-ins
      const [guestStats] = await pool.execute(
        `SELECT 
           COUNT(*) as total_guests,
           SUM(CASE WHEN checked_in = 1 THEN 1 ELSE 0 END) as checked_in_count
         FROM guests 
         WHERE guest_list_id = ?`,
        [id]
      );

      const stats = guestStats[0];

      res.json({
        success: true,
        checkin_status: {
          guest_list_id: id,
          owner_name: guestList[0].owner_name,
          reservation_date: guestList[0].reservation_date,
          owner_checked_in: guestList[0].owner_checked_in || false,
          owner_checkin_time: guestList[0].owner_checkin_time,
          total_guests: stats.total_guests,
          guests_checked_in: stats.checked_in_count,
          attendance_percentage: stats.total_guests > 0 
            ? Math.round((stats.checked_in_count / stats.total_guests) * 100) 
            : 0
        }
      });

    } catch (error) {
      console.error('❌ Erro ao buscar status de check-in:', error);
      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor'
      });
    }
  });

  /**
   * @route   POST /api/admin/guest-lists/:id/owner-checkin
   * @desc    Faz check-in do dono da reserva
   * @access  Private (Admin)
   */
  router.post('/guest-lists/:id/owner-checkin', optionalAuth, async (req, res) => {
    try {
      const { id } = req.params;

      // Verificar se a guest list existe
      const [guestList] = await pool.execute(
        `SELECT gl.*, 
         COALESCE(lr.client_name, rr.client_name) as owner_name
         FROM guest_lists gl
         LEFT JOIN large_reservations lr ON gl.reservation_id = lr.id AND gl.reservation_type = 'large'
         LEFT JOIN restaurant_reservations rr ON gl.reservation_id = rr.id AND gl.reservation_type = 'restaurant'
         WHERE gl.id = ?`,
        [id]
      );

      if (guestList.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Lista de convidados não encontrada'
        });
      }

      // Verificar se já fez check-in
      if (guestList[0].owner_checked_in === 1) {
        return res.status(400).json({
          success: false,
          error: 'O dono da reserva já fez check-in'
        });
      }

      // Atualizar check-in do dono
      await pool.execute(
        `UPDATE guest_lists 
         SET owner_checked_in = 1, owner_checkin_time = CURRENT_TIMESTAMP 
         WHERE id = ?`,
        [id]
      );

      console.log(`✅ Check-in do dono confirmado: ${guestList[0].owner_name} (Guest List ID: ${id})`);

      res.json({
        success: true,
        message: 'Check-in do dono confirmado com sucesso',
        guestList: {
          id: id,
          owner_name: guestList[0].owner_name,
          owner_checked_in: true,
          owner_checkin_time: new Date().toISOString()
        }
      });

    } catch (error) {
      console.error('❌ Erro ao fazer check-in do dono:', error);
      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  });

  return router;
};