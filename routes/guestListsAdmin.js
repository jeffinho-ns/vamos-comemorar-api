// routes/guestListsAdmin.js

const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const authorize = require('../middleware/authorize');

module.exports = (pool) => {
  // Todas as rotas aqui são protegidas (Administrador e/ou Gerente)

  /**
   * @route   GET /api/admin/guest-lists
   * @desc    Lista todas as reservas futuras com listas de convidados
   * @access  Private (Administrador, Gerente)
   */
  router.get('/guest-lists', auth, authorize('Administrador', 'Gerente'), async (req, res) => {
    try {
      const { date } = req.query; // opcional filtrar por data

      const filterDate = date || new Date().toISOString().split('T')[0];

      // Seleciona listas com reservas no futuro ou hoje
      const [rows] = await pool.execute(`
        SELECT gl.id as guest_list_id, gl.event_type, gl.expires_at, gl.reservation_type, gl.reservation_id,
               CASE WHEN gl.expires_at >= NOW() THEN 1 ELSE 0 END AS is_valid,
               COALESCE(lr.client_name, rr.client_name) as owner_name,
               COALESCE(lr.reservation_date, rr.reservation_date) as reservation_date,
               COALESCE(lr.created_by, rr.created_by) as created_by_id,
               COALESCE(lu.name, ru.name, 'Cliente') as created_by_name
        FROM guest_lists gl
        LEFT JOIN large_reservations lr ON (gl.reservation_type = 'large' AND gl.reservation_id = lr.id)
        LEFT JOIN restaurant_reservations rr ON (gl.reservation_type = 'restaurant' AND gl.reservation_id = rr.id)
        LEFT JOIN users lu ON (lr.created_by = lu.id)
        LEFT JOIN users ru ON (rr.created_by = ru.id)
        WHERE COALESCE(lr.reservation_date, rr.reservation_date) >= ?
        ORDER BY reservation_date ASC, guest_list_id ASC
      `, [filterDate]);

      res.json({ success: true, guestLists: rows });
    } catch (error) {
      console.error('❌ Erro ao listar guest lists:', error);
      res.status(500).json({ success: false, error: 'Erro interno do servidor' });
    }
  });

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

      // Verificar existência da lista
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
      const { client_name, reservation_date, event_type } = req.body;

      if (!client_name || !reservation_date) {
        return res.status(400).json({ success: false, error: 'Nome do cliente e data são obrigatórios' });
      }

      // Gerar token único
      const crypto = require('crypto');
      const token = crypto.randomBytes(24).toString('hex');

      // Definir expiração no dia da reserva às 23:59
      const expiresAt = `${reservation_date} 23:59:59`;

      // Criar uma reserva fictícia para a lista (ou usar reserva existente)
      // Por simplicidade, vamos criar uma entrada na guest_lists sem reserva real
      const [result] = await pool.execute(
        `INSERT INTO guest_lists (reservation_id, reservation_type, event_type, shareable_link_token, expires_at)
         VALUES (0, 'manual', ?, ?, ?)`,
        [event_type || null, token, expiresAt]
      );

      const guestListId = result.insertId;

      // Criar entrada na tabela de reservas grandes fictícia para referência
      const [reservationResult] = await pool.execute(
        `INSERT INTO large_reservations (
          establishment_id, client_name, reservation_date, reservation_time, 
          number_of_people, status, origin, created_by
        ) VALUES (1, ?, ?, '18:00:00', 10, 'NOVA', 'ADMIN', ?)`,
        [client_name, reservation_date, req.user.id]
      );

      const reservationId = reservationResult.insertId;

      // Atualizar a guest_list com o ID da reserva real
      await pool.execute(
        'UPDATE guest_lists SET reservation_id = ?, reservation_type = ? WHERE id = ?',
        [reservationId, 'large', guestListId]
      );

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


