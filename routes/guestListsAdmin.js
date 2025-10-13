// routes/guestListsAdmin.js

const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const authorize = require('../middleware/authorize');

module.exports = (pool) => {
  // Todas as rotas aqui são protegidas (Administrador e/ou Gerente)

  /**
   * @route   GET /api/admin/guest-lists
   * @desc    Lista todas as reservas GRANDES futuras com listas de convidados
   * @access  Private (Administrador, Gerente)
   */
  router.get('/guest-lists', auth, authorize('Administrador', 'Gerente'), async (req, res) => {
    try {
      // ... (lógica de filtros permanece a mesma)
      const { date, month, establishment_id } = req.query;
      let whereClauses = [];
      let params = [];

      if (date) {
        whereClauses.push('lr.reservation_date = ?');
        params.push(date);
      } else if (month) {
        whereClauses.push('DATE_FORMAT(lr.reservation_date, "%Y-%m") = ?');
        params.push(month);
      } else {
        const currentMonth = new Date().toISOString().slice(0, 7);
        whereClauses.push('DATE_FORMAT(lr.reservation_date, "%Y-%m") = ?');
        params.push(currentMonth);
      }
      if (establishment_id) {
          whereClauses.push('lr.establishment_id = ?');
          params.push(establishment_id);
      }
      const whereClauseString = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
      
      // ### CORREÇÃO AQUI: Adicione shareable_link_token ###
      const [rows] = await pool.execute(`
        SELECT 
          gl.id as guest_list_id, 
          gl.event_type, 
          gl.expires_at,
          gl.shareable_link_token, -- ADICIONADO ESTE CAMPO
          CASE WHEN gl.expires_at >= NOW() THEN 1 ELSE 0 END AS is_valid,
          lr.client_name as owner_name,
          lr.reservation_date,
          u.name as created_by_name
        FROM guest_lists gl
        INNER JOIN large_reservations lr ON gl.reservation_id = lr.id AND gl.reservation_type = 'large'
        LEFT JOIN users u ON lr.created_by = u.id
        ${whereClauseString}
        ORDER BY lr.reservation_date DESC, gl.id ASC
      `, params);

      res.json({ success: true, guestLists: rows });
    } catch (error) {
      console.error('❌ Erro ao listar guest lists:', error);
      res.status(500).json({ success: false, error: 'Erro interno do servidor' });
    }
  });
  // --- O RESTANTE DO ARQUIVO PERMANECE IGUAL ---

  /**
   * @route   POST /api/admin/guest-lists/:list_id/guests
   * @desc    Adiciona um convidado
   * @access  Private (Administrador, Gerente)
   */
  router.post('/guest-lists/:list_id/guests', auth, authorize('Administrador', 'Gerente'), async (req, res) => {
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
  router.get('/guest-lists/:list_id/guests', auth, authorize('Administrador', 'Gerente'), async (req, res) => {
    try {
      const { list_id } = req.params;
      const [lists] = await pool.execute('SELECT id FROM guest_lists WHERE id = ? LIMIT 1', [list_id]);
      if (!lists.length) {
        return res.status(404).json({ success: false, error: 'Lista não encontrada' });
      }
      const [rows] = await pool.execute('SELECT id, name, whatsapp FROM guests WHERE guest_list_id = ? ORDER BY id ASC', [list_id]);
      res.json({ success: true, guests: rows });
    } catch (error) {
      console.error('❌ Erro ao listar convidados:', error);
      res.status(500).json({ success: false, error: 'Erro interno do servidor' });
    }
  });

  /**
   * @route   PUT /api/admin/guests/:guest_id
   * @desc    Edita um convidado
   * @access  Private (Administrador, Gerente)
   */
  router.put('/guests/:guest_id', auth, authorize('Administrador', 'Gerente'), async (req, res) => {
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
  router.delete('/guests/:guest_id', auth, authorize('Administrador', 'Gerente'), async (req, res) => {
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
  router.post('/guest-lists/create', auth, authorize('Administrador', 'Gerente'), async (req, res) => {
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

  return router;
};