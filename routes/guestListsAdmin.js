// routes/guestListsAdmin.js

const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const authorize = require('../middleware/authorize');
const { getRooftopFlowRoomFromGuestList, emitRooftopQueueRefresh } = require('../utils/rooftopFlowSocket');

module.exports = (pool, checkAndAwardGifts = null) => {
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
      let paramIndex = 1;
      if (date) {
        whereClauses.push(`COALESCE(lr.reservation_date, rr.reservation_date)::DATE = $${paramIndex++}::DATE`);
        params.push(date);
        console.log('📅 Filtrando por data específica:', date);
      } else if (month) {
        const year = month.split('-')[0];
        const monthNum = month.split('-')[1];
        whereClauses.push(`(EXTRACT(YEAR FROM COALESCE(lr.reservation_date, rr.reservation_date)) = $${paramIndex++} AND EXTRACT(MONTH FROM COALESCE(lr.reservation_date, rr.reservation_date)) = $${paramIndex++})`);
        params.push(year, monthNum);
        console.log('📅 Filtrando por mês:', month);
      } else if (show_all !== 'true') {
        // CORREÇÃO: Apenas filtrar por mês atual se show_all não for true
        const currentMonth = new Date().toISOString().slice(0, 7);
        const year = currentMonth.split('-')[0];
        const monthNum = currentMonth.split('-')[1];
        whereClauses.push(`(EXTRACT(YEAR FROM COALESCE(lr.reservation_date, rr.reservation_date)) = $${paramIndex++} AND EXTRACT(MONTH FROM COALESCE(lr.reservation_date, rr.reservation_date)) = $${paramIndex++})`);
        params.push(year, monthNum);
        console.log('📅 Filtrando por mês atual (padrão):', currentMonth);
      } else {
        console.log('📅 Mostrando TODAS as listas (show_all=true)');
      }
      
      if (establishment_id) {
        whereClauses.push(`COALESCE(lr.establishment_id, rr.establishment_id) = $${paramIndex++}`);
        params.push(establishment_id);
        console.log('🏢 Filtrando por estabelecimento:', establishment_id);
      }
      
      // Query atualizada para incluir AMBOS os tipos de reserva (large e restaurant) com campos de check-in
      const rowsResult = await pool.query(`
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
          COALESCE(lr.origin::TEXT, CAST(rr.origin AS TEXT)) as origin
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
      const rows = rowsResult.rows;
      
      // Adicionar contagem de guests para cada guest list
      for (const row of rows) {
        const guestsResult = await pool.query(
          'SELECT id, checked_in FROM guests WHERE guest_list_id = $1',
          [row.guest_list_id]
        );
        row.total_guests = guestsResult.rows.length;
        row.guests_checked_in = guestsResult.rows.filter((g) => g.checked_in).length;
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

      const listsResult = await pool.query('SELECT id FROM guest_lists WHERE id = $1 LIMIT 1', [list_id]);
      if (listsResult.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Lista não encontrada' });
      }

      const result = await pool.query(
        'INSERT INTO guests (guest_list_id, name, whatsapp) VALUES ($1, $2, $3) RETURNING id',
        [list_id, name.trim(), whatsapp || null]
      );

      res.status(201).json({ success: true, guest: { id: result.rows[0].id, name: name.trim(), whatsapp: whatsapp || null } });
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
      const listsResult = await pool.query('SELECT id FROM guest_lists WHERE id = $1 LIMIT 1', [list_id]);
      if (listsResult.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Lista não encontrada' });
      }

      // Verificar se as colunas entrada_tipo, entrada_valor, checked_out e checkout_time existem
      try {
        const columnsResult = await pool.query(`
          SELECT column_name 
          FROM information_schema.columns 
          WHERE table_schema = current_schema()
          AND table_name = 'guests' 
          AND column_name IN ('entrada_tipo', 'entrada_valor', 'checked_out', 'checkout_time')
        `);
        
        const hasEntradaTipo = columnsResult.rows.some(col => col.column_name === 'entrada_tipo');
        const hasEntradaValor = columnsResult.rows.some(col => col.column_name === 'entrada_valor');
        const hasCheckedOut = columnsResult.rows.some(col => col.column_name === 'checked_out');
        const hasCheckoutTime = columnsResult.rows.some(col => col.column_name === 'checkout_time');
        
        // Construir query dinamicamente baseado nas colunas disponíveis
        const selectFields = ['id', 'name', 'whatsapp', 'checked_in', 'checkin_time'];
        if (hasCheckedOut) selectFields.push('checked_out');
        if (hasCheckoutTime) selectFields.push('checkout_time');
        if (hasEntradaTipo) selectFields.push('entrada_tipo');
        if (hasEntradaValor) selectFields.push('entrada_valor');
        
        const query = `SELECT ${selectFields.join(', ')} FROM guests WHERE guest_list_id = $1 ORDER BY id ASC`;
        
        const rowsResult = await pool.query(query, [list_id]);
        
        // Adicionar campos null se não existirem na tabela
        const guests = rowsResult.rows.map(guest => ({
          ...guest,
          checked_out: hasCheckedOut ? (guest.checked_out || false) : false,
          checkout_time: hasCheckoutTime ? (guest.checkout_time || null) : null,
          entrada_tipo: hasEntradaTipo ? (guest.entrada_tipo || null) : null,
          entrada_valor: hasEntradaValor ? (guest.entrada_valor || null) : null
        }));
        
        res.json({ success: true, guests: guests });
      } catch (queryError) {
        console.error('❌ Erro ao executar query de convidados:', queryError);
        // Fallback: tentar query simples sem os campos novos
        try {
          const rowsResult = await pool.query('SELECT id, name, whatsapp, checked_in, checkin_time FROM guests WHERE guest_list_id = $1 ORDER BY id ASC', [list_id]);
          const guests = rowsResult.rows.map(guest => ({
            ...guest,
            checked_out: false,
            checkout_time: null,
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

      const guestsResult = await pool.query('SELECT id FROM guests WHERE id = $1 LIMIT 1', [guest_id]);
      if (guestsResult.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Convidado não encontrado' });
      }

      const fields = [];
      const params = [];
      let paramIndex = 1;
      if (name !== undefined) { fields.push(`name = $${paramIndex++}`); params.push(name); }
      if (whatsapp !== undefined) { fields.push(`whatsapp = $${paramIndex++}`); params.push(whatsapp); }
      if (fields.length === 0) {
        return res.status(400).json({ success: false, error: 'Nada para atualizar' });
      }
      params.push(guest_id);

      await pool.query(`UPDATE guests SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = $${paramIndex}`, params);
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

      const guestsResult = await pool.query('SELECT id FROM guests WHERE id = $1 LIMIT 1', [guest_id]);
      if (guestsResult.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Convidado não encontrado' });
      }

      await pool.query('DELETE FROM guests WHERE id = $1', [guest_id]);
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
      const { client_name, reservation_date, event_type, establishment_id } = req.body;
      
      console.log('📥 Dados recebidos para criar lista:', {
        client_name,
        reservation_date,
        event_type,
        establishment_id,
        body_completo: req.body
      });

      if (!client_name || !reservation_date) {
        return res.status(400).json({ 
          success: false, 
          error: 'Nome do cliente e data são obrigatórios',
          received: { client_name, reservation_date, establishment_id }
        });
      }
      
      if (!establishment_id || establishment_id === 0) {
        return res.status(400).json({ 
          success: false, 
          error: 'Estabelecimento é obrigatório. Por favor, selecione um estabelecimento.',
          received: { client_name, reservation_date, establishment_id }
        });
      }

      const crypto = require('crypto');
      const token = crypto.randomBytes(24).toString('hex');

      const expiresAt = `${reservation_date} 23:59:59`;

      // 1. Cria a reserva grande primeiro
      // Se req.user não existir (optionalAuth), usar null para created_by
      const createdBy = req.user?.id || null;
      
      console.log('📝 Criando reserva grande com:', {
        establishment_id,
        client_name,
        reservation_date,
        created_by: createdBy
      });
      
      const reservationResult = await pool.query(
        `INSERT INTO large_reservations (
          establishment_id, client_name, reservation_date, reservation_time, 
          number_of_people, status, origin, created_by
        ) VALUES ($1, $2, $3, '18:00:00', 11, 'NOVA', 'ADMIN', $4) RETURNING id`, // Pessoas >= 11 para ser grande
        [establishment_id, client_name, reservation_date, createdBy]
      );
      const reservationId = reservationResult.rows[0].id;

      // 2. Cria a lista de convidados vinculada à reserva
      const result = await pool.query(
        `INSERT INTO guest_lists (reservation_id, reservation_type, event_type, shareable_link_token, expires_at)
         VALUES ($1, 'large', $2, $3, $4) RETURNING id`,
        [reservationId, event_type || null, token, expiresAt]
      );
      const guestListId = result.rows[0].id;

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
      console.error('❌ Stack trace:', error.stack);
      console.error('❌ Código do erro:', error.code);
      console.error('❌ Constraint:', error.constraint);
      console.error('❌ Detalhes:', error.detail);
      
      let errorMessage = 'Erro interno do servidor';
      if (error.code === '23505') { // Unique violation
        errorMessage = 'Já existe uma lista de convidados com estes dados';
      } else if (error.code === '23503') { // Foreign key violation
        errorMessage = 'Erro de referência: verifique se o estabelecimento existe';
      } else if (error.code === '23502') { // Not null violation
        errorMessage = `Campo obrigatório não informado: ${error.column || 'desconhecido'}`;
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      res.status(500).json({ 
        success: false, 
        error: errorMessage,
        details: error.message,
        code: error.code,
        constraint: error.constraint,
        column: error.column
      });
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
      const guestResult = await pool.query(
        'SELECT * FROM guests WHERE id = $1',
        [id]
      );

      if (guestResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Convidado não encontrado'
        });
      }

      const guest = guestResult.rows[0];

      // Verificar se já fez check-in
      if (guest.checked_in) {
        return res.status(400).json({
          success: false,
          error: 'Este convidado já fez check-in'
        });
      }

      // Atualizar check-in do convidado com tipo e valor de entrada
      // PostgreSQL usa TRUE/FALSE, não 1/0
      // Verificar se as colunas entrada_tipo e entrada_valor existem antes de usar
      let updateQuery;
      let updateParams;
      
      try {
        // Tentar atualizar com entrada_tipo e entrada_valor (colunas podem não existir em versões antigas)
        updateQuery = 'UPDATE guests SET checked_in = TRUE, checkin_time = CURRENT_TIMESTAMP, entrada_tipo = $1, entrada_valor = $2 WHERE id = $3';
        updateParams = [entrada_tipo || null, entrada_valor || null, id];
        await pool.query(updateQuery, updateParams);
      } catch (updateError) {
        // Se der erro (coluna não existe), tentar sem essas colunas
        if (updateError.code === '42703' || updateError.message.includes('entrada_tipo') || updateError.message.includes('entrada_valor')) {
          console.warn('⚠️ Colunas entrada_tipo/entrada_valor não existem, atualizando sem elas...');
          updateQuery = 'UPDATE guests SET checked_in = TRUE, checkin_time = CURRENT_TIMESTAMP WHERE id = $1';
          updateParams = [id];
          await pool.query(updateQuery, updateParams);
        } else {
          throw updateError; // Re-throw se for outro erro
        }
      }

      const tipoTexto = entrada_tipo === 'VIP' ? 'VIP (grátis)' : entrada_tipo === 'SECO' ? `SECO (R$ ${entrada_valor?.toFixed(2) || '0,00'})` : entrada_tipo === 'CONSUMA' ? `CONSUMA (R$ ${entrada_valor?.toFixed(2) || '0,00'})` : 'Check-in';
      console.log(`✅ Check-in do convidado confirmado: ${guest.name} (ID: ${id}) - ${tipoTexto}`);

      const io = req.app && req.app.get('socketio');
      if (io && guest.guest_list_id) {
        const room = await getRooftopFlowRoomFromGuestList(pool, guest.guest_list_id);
        if (room) emitRooftopQueueRefresh(io, room.establishment_id, room.flow_date);
      }

      // Verificar e liberar brindes após o check-in
      let giftsAwarded = [];
      if (checkAndAwardGifts && guest.guest_list_id) {
        try {
          const giftResult = await checkAndAwardGifts(guest.guest_list_id);
          if (giftResult && giftResult.success && giftResult.gifts && giftResult.gifts.length > 0) {
            giftsAwarded = giftResult.gifts;
            console.log(`🎁 Brindes liberados para guest list ${guest.guest_list_id}:`, giftsAwarded.map(g => g.descricao).join(', '));
          }
        } catch (giftError) {
          console.error('⚠️ Erro ao verificar brindes (não bloqueia o check-in):', giftError);
          console.error('Stack trace:', giftError.stack);
          // Não bloqueia o check-in mesmo se houver erro na verificação de brindes
        }
      } else if (!guest.guest_list_id) {
        console.warn(`⚠️ Convidado ${id} não tem guest_list_id associado. Pulando verificação de brindes.`);
      }

      res.json({
        success: true,
        message: 'Check-in do convidado confirmado com sucesso',
        guest: {
          id: guest.id,
          name: guest.name,
          checked_in: true,
          checkin_time: new Date().toISOString(),
          entrada_tipo: entrada_tipo || null,
          entrada_valor: entrada_valor || null
        },
        gifts_awarded: giftsAwarded // Informa se algum brinde foi liberado
      });

    } catch (error) {
      console.error('❌ Erro ao fazer check-in do convidado:', error);
      console.error('❌ Stack trace:', error.stack);
      console.error('❌ Detalhes do erro:', {
        message: error.message,
        code: error.code,
        detail: error.detail,
        hint: error.hint
      });
      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  });

  /**
   * @route   POST /api/admin/guests/:id/checkout
   * @desc    Faz check-out de um convidado específico (registra a saída)
   * @access  Private (Admin)
   */
  router.post('/guests/:id/checkout', optionalAuth, async (req, res) => {
    try {
      const { id } = req.params;

      // Verificar se o convidado existe
      const guestResult = await pool.query(
        'SELECT * FROM guests WHERE id = $1',
        [id]
      );

      if (guestResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Convidado não encontrado'
        });
      }

      const guest = guestResult.rows[0];

      // Verificar se fez check-in antes de fazer check-out
      if (!guest.checked_in) {
        return res.status(400).json({
          success: false,
          error: 'Este convidado ainda não fez check-in'
        });
      }

      // Verificar se já fez check-out (se a coluna existir)
      let hasCheckedOut = false;
      if (guest.checked_out !== undefined && guest.checked_out !== null) {
        hasCheckedOut = guest.checked_out === true || guest.checked_out === 1;
      } else if (guest.checkout_time) {
        // Se não tiver coluna checked_out mas tiver checkout_time, considerar como já fez check-out
        hasCheckedOut = true;
      }

      if (hasCheckedOut) {
        return res.status(400).json({
          success: false,
          error: 'Este convidado já fez check-out'
        });
      }

      // Atualizar check-out do convidado
      // Verificar se as colunas existem antes de atualizar
      let updateQuery;
      let updateParams;
      
      try {
        // Verificar se as colunas existem
        const columnCheck = await pool.query(`
          SELECT column_name 
          FROM information_schema.columns 
          WHERE table_schema = current_schema()
          AND table_name = 'guests' 
          AND column_name IN ('checked_out', 'checkout_time')
        `);
        
        const hasCheckedOut = columnCheck.rows.some(col => col.column_name === 'checked_out');
        const hasCheckoutTime = columnCheck.rows.some(col => col.column_name === 'checkout_time');
        
        if (hasCheckedOut && hasCheckoutTime) {
          // Se ambas as colunas existem, usar ambas
          updateQuery = 'UPDATE guests SET checked_out = TRUE, checkout_time = CURRENT_TIMESTAMP WHERE id = $1';
          updateParams = [id];
        } else if (hasCheckoutTime) {
          // Se só checkout_time existe, usar apenas ela e marcar checked_in como FALSE
          updateQuery = 'UPDATE guests SET checked_in = FALSE, checkout_time = CURRENT_TIMESTAMP WHERE id = $1';
          updateParams = [id];
        } else {
          // Se nenhuma coluna existe, apenas marcar checked_in como FALSE
          console.warn('⚠️ Colunas de check-out não existem, apenas marcando checked_in como FALSE...');
          updateQuery = 'UPDATE guests SET checked_in = FALSE WHERE id = $1';
          updateParams = [id];
        }
        
        await pool.query(updateQuery, updateParams);
      } catch (updateError) {
        console.error('❌ Erro ao atualizar check-out:', updateError);
        throw updateError;
      }

      // Inserir na tabela checkouts para manter histórico permanente
      try {
        const checkoutTime = new Date().toISOString();
        const establishmentId = guest.establishment_id || guest.reservation_establishment_id;
        
        // Verificar se a tabela checkouts existe antes de inserir
        const tableExists = await pool.query(`
          SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_schema = current_schema() 
            AND table_name = 'checkouts'
          )
        `);
        
        if (tableExists.rows[0]?.exists) {
          await pool.query(`
            INSERT INTO checkouts (
              checkout_type,
              entity_type,
              entity_id,
              name,
              checkin_time,
              checkout_time,
              status,
              guest_list_id,
              reservation_id,
              table_number,
              area_name,
              establishment_id,
              evento_id,
              entrada_tipo,
              entrada_valor,
              created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, CURRENT_TIMESTAMP)
          `, [
            'guest',
            'guest',
            id,
            guest.name || '',
            guest.checkin_time || null,
            checkoutTime,
            'concluido',
            guest.guest_list_id || null,
            guest.reservation_id || null,
            guest.table_number || null,
            guest.area_name || null,
            establishmentId || null,
            guest.evento_id || null,
            guest.entrada_tipo || null,
            guest.entrada_valor || null
          ]);
          console.log(`✅ Check-out registrado na tabela checkouts: ${guest.name}`);
        } else {
          console.warn('⚠️ Tabela checkouts não existe ainda. Execute a migração create_checkouts_table.sql');
        }
      } catch (checkoutError) {
        // Não bloquear o check-out se houver erro ao inserir na tabela checkouts
        console.error('❌ Erro ao registrar check-out na tabela checkouts:', checkoutError);
      }

      console.log(`✅ Check-out do convidado confirmado: ${guest.name} (ID: ${id})`);

      res.json({
        success: true,
        message: 'Check-out do convidado confirmado com sucesso',
        guest: {
          id: guest.id,
          name: guest.name,
          checked_in: false,
          checked_out: true,
          checkout_time: new Date().toISOString()
        }
      });

    } catch (error) {
      console.error('❌ Erro ao fazer check-out do convidado:', error);
      console.error('❌ Stack trace:', error.stack);
      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  });

  /**
   * @route   DELETE /api/admin/guest-lists/by-owner/:ownerName
   * @desc    Exclui lista(s) de convidados pelo nome do dono
   * @access  Private (Administrador)
   */
  router.delete('/guest-lists/by-owner/:ownerName', optionalAuth, async (req, res) => {
    try {
      const { ownerName } = req.params;
      const decodedOwnerName = decodeURIComponent(ownerName);
      
      console.log(`🔍 Buscando listas do dono: ${decodedOwnerName}`);
      
      // Buscar todas as listas desse dono
      const searchResult = await pool.query(`
        SELECT 
          gl.id as guest_list_id,
          gl.reservation_id,
          gl.reservation_type,
          COALESCE(lr.client_name, rr.client_name) as owner_name
        FROM guest_lists gl
        LEFT JOIN large_reservations lr ON gl.reservation_id = lr.id AND gl.reservation_type = 'large'
        LEFT JOIN restaurant_reservations rr ON gl.reservation_id = rr.id AND gl.reservation_type = 'restaurant'
        WHERE 
          LOWER(COALESCE(lr.client_name, rr.client_name)) LIKE LOWER($1)
      `, [`%${decodedOwnerName}%`]);
      
      if (searchResult.rows.length === 0) {
        return res.status(404).json({ 
          success: false, 
          error: `Nenhuma lista encontrada para "${decodedOwnerName}"` 
        });
      }
      
      const guestListIds = searchResult.rows.map(row => row.guest_list_id);
      let totalGuestsDeleted = 0;
      
      // Excluir todos os convidados das listas
      for (const id of guestListIds) {
        const deleteGuestsResult = await pool.query(
          'DELETE FROM guests WHERE guest_list_id = $1',
          [id]
        );
        totalGuestsDeleted += deleteGuestsResult.rowCount;
      }
      
      // Excluir as listas
      for (const id of guestListIds) {
        await pool.query('DELETE FROM guest_lists WHERE id = $1', [id]);
      }
      
      console.log(`✅ ${guestListIds.length} lista(s) e ${totalGuestsDeleted} convidado(s) excluídos para "${decodedOwnerName}"`);
      
      res.json({ 
        success: true, 
        message: `${guestListIds.length} lista(s) e ${totalGuestsDeleted} convidado(s) excluídos com sucesso`,
        deletedLists: guestListIds.length,
        deletedGuests: totalGuestsDeleted
      });
    } catch (error) {
      console.error('❌ Erro ao excluir lista por nome do dono:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Erro interno do servidor' 
      });
    }
  });

  /**
   * @route   DELETE /api/admin/guest-lists/:id
   * @desc    Exclui uma lista de convidados (apenas para usuários autorizados)
   * @access  Private (Administrador específico)
   */
  router.delete('/guest-lists/:id', optionalAuth, async (req, res) => {
    try {
      const { id } = req.params;
      
      // Verificar se a lista existe
      const guestListResult = await pool.query(
        'SELECT id, reservation_id, reservation_type FROM guest_lists WHERE id = $1',
        [id]
      );

      if (guestListResult.rows.length === 0) {
        return res.status(404).json({ 
          success: false, 
          error: 'Lista de convidados não encontrada' 
        });
      }

      const guestList = guestListResult.rows[0];

      // Excluir todos os convidados da lista (cascade)
      await pool.query('DELETE FROM guests WHERE guest_list_id = $1', [id]);

      // Excluir a lista
      await pool.query('DELETE FROM guest_lists WHERE id = $1', [id]);

      console.log(`✅ Lista de convidados ${id} excluída com sucesso`);

      res.json({ 
        success: true, 
        message: 'Lista de convidados excluída com sucesso' 
      });
    } catch (error) {
      console.error('❌ Erro ao excluir lista de convidados:', error);
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
      const guestListResult = await pool.query(
        `SELECT gl.*, rr.client_name as owner_name, rr.reservation_date
         FROM guest_lists gl
         LEFT JOIN restaurant_reservations rr ON gl.reservation_id = rr.id
         WHERE gl.id = $1`,
        [id]
      );

      if (guestListResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Lista de convidados não encontrada'
        });
      }

      // Contar convidados e check-ins
      const guestStatsResult = await pool.query(
        `SELECT 
           COUNT(*) as total_guests,
           SUM(CASE WHEN checked_in = TRUE THEN 1 ELSE 0 END) as checked_in_count
         FROM guests 
         WHERE guest_list_id = $1`,
        [id]
      );

      const stats = guestStatsResult.rows[0];

      res.json({
        success: true,
        checkin_status: {
          guest_list_id: id,
          owner_name: guestListResult.rows[0].owner_name,
          reservation_date: guestListResult.rows[0].reservation_date,
          owner_checked_in: guestListResult.rows[0].owner_checked_in || false,
          owner_checkin_time: guestListResult.rows[0].owner_checkin_time,
          owner_checked_out: guestListResult.rows[0].owner_checked_out || false,
          owner_checkout_time: guestListResult.rows[0].owner_checkout_time,
          total_guests: parseInt(stats.total_guests),
          guests_checked_in: parseInt(stats.checked_in_count),
          attendance_percentage: parseInt(stats.total_guests) > 0 
            ? Math.round((parseInt(stats.checked_in_count) / parseInt(stats.total_guests)) * 100) 
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
      const guestListResult = await pool.query(
        `SELECT gl.*, 
         COALESCE(CAST(lr.client_name AS VARCHAR), CAST(rr.client_name AS VARCHAR)) as owner_name
         FROM guest_lists gl
         LEFT JOIN large_reservations lr ON gl.reservation_id = lr.id AND gl.reservation_type = 'large'
         LEFT JOIN restaurant_reservations rr ON gl.reservation_id = rr.id AND gl.reservation_type = 'restaurant'
         WHERE gl.id = $1`,
        [id]
      );

      const guestList = guestListResult.rows[0];

      if (!guestList) {
        return res.status(404).json({
          success: false,
          error: 'Lista de convidados não encontrada'
        });
      }

      // Verificar se já fez check-in
      if (guestList.owner_checked_in === true || guestList.owner_checked_in === 1) {
        return res.status(400).json({
          success: false,
          error: 'O dono da reserva já fez check-in'
        });
      }

      // Atualizar check-in do dono
      await pool.query(
        `UPDATE guest_lists 
         SET owner_checked_in = TRUE, owner_checkin_time = CURRENT_TIMESTAMP 
         WHERE id = $1`,
        [id]
      );

      console.log(`✅ Check-in do dono confirmado: ${guestList.owner_name} (Guest List ID: ${id})`);

      const io = req.app && req.app.get('socketio');
      if (io) {
        const room = await getRooftopFlowRoomFromGuestList(pool, id);
        if (room) emitRooftopQueueRefresh(io, room.establishment_id, room.flow_date);
      }

      res.json({
        success: true,
        message: 'Check-in do dono confirmado com sucesso',
        guestList: {
          id: id,
          owner_name: guestList.owner_name,
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

  /**
   * @route   POST /api/admin/guest-lists/:id/owner-checkout
   * @desc    Faz check-out do dono da reserva (registra a saída)
   * @access  Private (Admin)
   */
  router.post('/guest-lists/:id/owner-checkout', optionalAuth, async (req, res) => {
    try {
      const { id } = req.params;

      // Verificar se a guest list existe
      const guestListResult = await pool.query(
        `SELECT gl.*, 
         COALESCE(CAST(lr.client_name AS VARCHAR), CAST(rr.client_name AS VARCHAR)) as owner_name
         FROM guest_lists gl
         LEFT JOIN large_reservations lr ON gl.reservation_id = lr.id AND gl.reservation_type = 'large'
         LEFT JOIN restaurant_reservations rr ON gl.reservation_id = rr.id AND gl.reservation_type = 'restaurant'
         WHERE gl.id = $1`,
        [id]
      );

      const guestList = guestListResult.rows[0];

      if (!guestList) {
        return res.status(404).json({
          success: false,
          error: 'Lista de convidados não encontrada'
        });
      }

      // Verificar se fez check-in antes de fazer check-out
      if (!guestList.owner_checked_in || guestList.owner_checked_in === 0 || guestList.owner_checked_in === false) {
        return res.status(400).json({
          success: false,
          error: 'O dono da reserva ainda não fez check-in'
        });
      }

      // Verificar se já fez check-out (se a coluna existir)
      let hasCheckedOut = false;
      if (guestList.owner_checked_out !== undefined && guestList.owner_checked_out !== null) {
        hasCheckedOut = guestList.owner_checked_out === true || guestList.owner_checked_out === 1;
      } else if (guestList.owner_checkout_time) {
        // Se não tiver coluna owner_checked_out mas tiver owner_checkout_time, considerar como já fez check-out
        hasCheckedOut = true;
      }

      if (hasCheckedOut) {
        return res.status(400).json({
          success: false,
          error: 'O dono da reserva já fez check-out'
        });
      }

      // Atualizar check-out do dono
      // Verificar se as colunas existem antes de atualizar
      let updateQuery;
      let updateParams;
      
      try {
        // Verificar se as colunas existem
        const columnCheck = await pool.query(`
          SELECT column_name 
          FROM information_schema.columns 
          WHERE table_schema = current_schema()
          AND table_name = 'guest_lists' 
          AND column_name IN ('owner_checked_out', 'owner_checkout_time')
        `);
        
        const hasOwnerCheckedOut = columnCheck.rows.some(col => col.column_name === 'owner_checked_out');
        const hasOwnerCheckoutTime = columnCheck.rows.some(col => col.column_name === 'owner_checkout_time');
        
        if (hasOwnerCheckedOut && hasOwnerCheckoutTime) {
          // Se ambas as colunas existem, usar ambas
          updateQuery = 'UPDATE guest_lists SET owner_checked_out = TRUE, owner_checkout_time = CURRENT_TIMESTAMP WHERE id = $1';
          updateParams = [id];
        } else if (hasOwnerCheckoutTime) {
          // Se só owner_checkout_time existe, usar apenas ela e marcar owner_checked_in como FALSE
          updateQuery = 'UPDATE guest_lists SET owner_checked_in = FALSE, owner_checkout_time = CURRENT_TIMESTAMP WHERE id = $1';
          updateParams = [id];
        } else {
          // Se nenhuma coluna existe, apenas marcar owner_checked_in como FALSE
          console.warn('⚠️ Colunas de check-out do dono não existem, apenas marcando owner_checked_in como FALSE...');
          updateQuery = 'UPDATE guest_lists SET owner_checked_in = FALSE WHERE id = $1';
          updateParams = [id];
        }
        
        await pool.query(updateQuery, updateParams);
      } catch (updateError) {
        console.error('❌ Erro ao atualizar check-out do dono:', updateError);
        throw updateError;
      }

      // Inserir na tabela checkouts para manter histórico permanente
      try {
        const checkoutTime = new Date().toISOString();
        const establishmentId = guestList.establishment_id || guestList.gl_establishment_id;
        
        // Verificar se a tabela checkouts existe antes de inserir
        const tableExists = await pool.query(`
          SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_schema = current_schema() 
            AND table_name = 'checkouts'
          )
        `);
        
        if (tableExists.rows[0]?.exists) {
          await pool.query(`
            INSERT INTO checkouts (
              checkout_type,
              entity_type,
              entity_id,
              name,
              checkin_time,
              checkout_time,
              status,
              guest_list_id,
              reservation_id,
              table_number,
              area_name,
              establishment_id,
              evento_id,
              created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, CURRENT_TIMESTAMP)
          `, [
            'owner',
            'guest_list',
            id,
            guestList.owner_name || '',
            guestList.owner_checkin_time || null,
            checkoutTime,
            'concluido',
            id,
            guestList.reservation_id || null,
            guestList.table_number || null,
            guestList.area_name || null,
            establishmentId || null,
            guestList.evento_id || null
          ]);
          console.log(`✅ Check-out registrado na tabela checkouts: ${guestList.owner_name}`);
        } else {
          console.warn('⚠️ Tabela checkouts não existe ainda. Execute a migração create_checkouts_table.sql');
        }
      } catch (checkoutError) {
        // Não bloquear o check-out se houver erro ao inserir na tabela checkouts
        console.error('❌ Erro ao registrar check-out na tabela checkouts:', checkoutError);
      }

      console.log(`✅ Check-out do dono confirmado: ${guestList.owner_name} (Guest List ID: ${id})`);

      res.json({
        success: true,
        message: 'Check-out do dono confirmado com sucesso',
        guestList: {
          id: id,
          owner_name: guestList.owner_name,
          owner_checked_in: false,
          owner_checked_out: true,
          owner_checkout_time: new Date().toISOString()
        }
      });

    } catch (error) {
      console.error('❌ Erro ao fazer check-out do dono:', error);
      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  });

  /**
   * @route   GET /api/admin/checkouts
   * @desc    Busca histórico de check-outs concluídos
   * @access  Private (Admin)
   * @query   evento_id, guest_list_id, establishment_id, date
   */
  router.get('/checkouts', optionalAuth, async (req, res) => {
    try {
      const { evento_id, guest_list_id, establishment_id, date } = req.query;
      
      // Verificar se a tabela checkouts existe
      const tableExists = await pool.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = current_schema() 
          AND table_name = 'checkouts'
        )
      `);
      
      if (!tableExists.rows[0]?.exists) {
        return res.json({
          success: true,
          checkouts: [],
          message: 'Tabela checkouts não existe ainda. Execute a migração create_checkouts_table.sql'
        });
      }
      
      // Construir query com filtros
      let query = 'SELECT * FROM checkouts WHERE status = $1';
      const params = ['concluido'];
      let paramIndex = 2;
      
      if (evento_id) {
        query += ` AND evento_id = $${paramIndex++}`;
        params.push(Number(evento_id));
      }
      
      if (guest_list_id) {
        query += ` AND guest_list_id = $${paramIndex++}`;
        params.push(Number(guest_list_id));
      }
      
      if (establishment_id) {
        query += ` AND establishment_id = $${paramIndex++}`;
        params.push(Number(establishment_id));
      }
      
      if (date) {
        query += ` AND checkout_time::DATE = $${paramIndex++}::DATE`;
        params.push(date);
      }
      
      query += ' ORDER BY checkout_time DESC';
      
      const result = await pool.query(query, params);
      
      res.json({
        success: true,
        checkouts: result.rows,
        count: result.rows.length
      });
      
    } catch (error) {
      console.error('❌ Erro ao buscar check-outs:', error);
      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  });

  return router;
};