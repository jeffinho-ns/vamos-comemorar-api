// routes/guestListPublic.js

const express = require('express');
const crypto = require('crypto');
const router = express.Router();

module.exports = (pool) => {
  /**
   * @route   GET /api/guest-list/:token
   * @desc    Retorna dados públicos da lista de convidados por token, se não expirado
   * @access  Public
   */
  router.get('/:token', async (req, res) => {
    try {
      const { token } = req.params;

      const listsResult = await pool.query(
        `SELECT gl.id, gl.reservation_id, gl.reservation_type, gl.event_type, gl.expires_at,
                CASE WHEN gl.expires_at >= NOW() THEN 1 ELSE 0 END AS is_valid
         FROM guest_lists gl
         WHERE gl.shareable_link_token = $1
         LIMIT 1`,
        [token]
      );

      if (listsResult.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Lista não encontrada' });
      }

      const list = listsResult.rows[0];
      if (!list.is_valid) {
        return res.status(410).json({ success: false, error: 'Link expirado' });
      }

      // Buscar nome do titular e data do evento de acordo com o tipo de reserva
      let ownerName = null;
      let reservationDate = null;
      if (list.reservation_type === 'large') {
        const rowsResult = await pool.query(
          `SELECT client_name as owner_name, reservation_date FROM large_reservations WHERE id = $1 LIMIT 1`,
          [list.reservation_id]
        );
        if (rowsResult.rows.length) {
          ownerName = rowsResult.rows[0].owner_name;
          reservationDate = rowsResult.rows[0].reservation_date;
        }
      } else {
        const rowsResult = await pool.query(
          `SELECT client_name as owner_name, reservation_date FROM restaurant_reservations WHERE id = $1 LIMIT 1`,
          [list.reservation_id]
        );
        if (rowsResult.rows.length) {
          ownerName = rowsResult.rows[0].owner_name;
          reservationDate = rowsResult.rows[0].reservation_date;
        }
      }

      // Buscar convidados com informações de check-in
      // Verificar quais colunas existem na tabela guests
      let guestsQuery;
      try {
        // Tentar buscar com checked_in e checkin_time (podem não existir em versões antigas)
        const columnsResult = await pool.query(`
          SELECT column_name 
          FROM information_schema.columns 
          WHERE table_schema = current_schema()
          AND table_name = 'guests' 
          AND column_name IN ('checked_in', 'checkin_time', 'email', 'qr_code_token', 'is_owner')
        `);
        
        const hasCheckedIn = columnsResult.rows.some(col => col.column_name === 'checked_in');
        const hasCheckinTime = columnsResult.rows.some(col => col.column_name === 'checkin_time');
        const hasEmail = columnsResult.rows.some(col => col.column_name === 'email');
        const hasQrCodeToken = columnsResult.rows.some(col => col.column_name === 'qr_code_token');
        const hasIsOwner = columnsResult.rows.some(col => col.column_name === 'is_owner');
        
        // Construir query dinamicamente baseado nas colunas disponíveis
        const selectFields = ['id', 'name'];
        if (hasCheckedIn) selectFields.push('checked_in');
        if (hasCheckinTime) selectFields.push('checkin_time');
        if (hasEmail) selectFields.push('email');
        if (hasQrCodeToken) selectFields.push('qr_code_token');
        if (hasIsOwner) selectFields.push('is_owner');
        
        guestsQuery = `SELECT ${selectFields.join(', ')} FROM guests WHERE guest_list_id = $1 ORDER BY id ASC`;
      } catch (error) {
        // Fallback: usar query básica se houver erro ao verificar colunas
        console.warn('⚠️ Erro ao verificar colunas da tabela guests, usando query básica:', error);
        guestsQuery = 'SELECT id, name FROM guests WHERE guest_list_id = $1 ORDER BY id ASC';
      }
      
      const guestsResult = await pool.query(guestsQuery, [list.id]);

      // Mapear convidados com status de check-in e QR (se existir coluna)
      const guestsWithStatus = guestsResult.rows.map(g => ({
        id: g.id,
        name: g.name,
        status: (g.checked_in === true || g.checked_in === 1) ? 'CHECK-IN' : 'Confirmado',
        checked_in: g.checked_in === true || g.checked_in === 1 || false,
        checkin_time: g.checkin_time || null,
        email: g.email || null,
        qr_code_token: g.qr_code_token || null,
        is_owner: g.is_owner === true || g.is_owner === 1 || false
      }));

      res.json({
        success: true,
        guestList: {
          id: list.id,
          event_type: list.event_type,
          reservation_type: list.reservation_type,
          reservation_date: reservationDate,
          owner_name: ownerName,
          expires_at: list.expires_at,
          guests: guestsWithStatus
        }
      });

    } catch (error) {
      console.error('❌ Erro ao buscar lista pública de convidados:', error);
      res.status(500).json({ success: false, error: 'Erro interno do servidor' });
    }
  });

  /**
   * @route   POST /api/guest-list/:token/guests
   * @desc    Adiciona um convidado à lista (público)
   * @access  Public
   */
  router.post('/:token/guests', async (req, res) => {
    try {
      const { token } = req.params;
      const { name, whatsapp } = req.body;

      if (!name || !name.trim()) {
        return res.status(400).json({ success: false, error: 'Nome é obrigatório' });
      }

      // Verificar se a lista existe e não expirou
      const listsResult = await pool.query(
        `SELECT gl.id, gl.expires_at,
                CASE WHEN gl.expires_at >= NOW() THEN 1 ELSE 0 END AS is_valid
         FROM guest_lists gl
         WHERE gl.shareable_link_token = $1
         LIMIT 1`,
        [token]
      );

      if (listsResult.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Lista não encontrada' });
      }

      const list = listsResult.rows[0];
      if (!list.is_valid) {
        return res.status(410).json({ success: false, error: 'Link expirado' });
      }

      // Verificar se já existe um convidado com o mesmo nome na lista
      const existingGuestsResult = await pool.query(
        'SELECT id FROM guests WHERE guest_list_id = $1 AND name = $2 LIMIT 1',
        [list.id, name.trim()]
      );

      if (existingGuestsResult.rows.length > 0) {
        return res.status(400).json({ success: false, error: 'Você já está nesta lista!' });
      }

      // Adicionar o convidado
      const result = await pool.query(
        'INSERT INTO guests (guest_list_id, name, whatsapp) VALUES ($1, $2, $3) RETURNING id',
        [list.id, name.trim(), whatsapp || null]
      );
      const guestId = result.rows[0].id;

      // Gerar e persistir qr_code_token (único por convidado, para check-in via QR)
      let qrCodeToken = null;
      try {
        const columnsResult = await pool.query(`
          SELECT 1 FROM information_schema.columns 
          WHERE table_schema = current_schema() AND table_name = 'guests' AND column_name = 'qr_code_token'
        `);
        if (columnsResult.rows.length > 0) {
          qrCodeToken = 'vc_guest_' + crypto.randomBytes(32).toString('hex');
          await pool.query(
            'UPDATE guests SET qr_code_token = $1 WHERE id = $2',
            [qrCodeToken, guestId]
          );
        }
      } catch (err) {
        console.warn('⚠️ qr_code_token não persistido (coluna pode não existir):', err.message);
      }

      res.status(201).json({ 
        success: true, 
        message: 'Você foi adicionado à lista com sucesso!',
        guest: { id: guestId, name: name.trim(), whatsapp: whatsapp || null, qr_code_token: qrCodeToken }
      });

    } catch (error) {
      console.error('❌ Erro ao adicionar convidado à lista pública:', error);
      res.status(500).json({ success: false, error: 'Erro interno do servidor' });
    }
  });

  return router;
};


