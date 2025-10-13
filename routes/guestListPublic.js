// routes/guestListPublic.js

const express = require('express');
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

      const [lists] = await pool.execute(
        `SELECT gl.id, gl.reservation_id, gl.reservation_type, gl.event_type, gl.expires_at,
                CASE WHEN gl.expires_at >= NOW() THEN 1 ELSE 0 END AS is_valid
         FROM guest_lists gl
         WHERE gl.shareable_link_token = ?
         LIMIT 1`,
        [token]
      );

      if (lists.length === 0) {
        return res.status(404).json({ success: false, error: 'Lista não encontrada' });
      }

      const list = lists[0];
      if (!list.is_valid) {
        return res.status(410).json({ success: false, error: 'Link expirado' });
      }

      // Buscar nome do titular e data do evento de acordo com o tipo de reserva
      let ownerName = null;
      let reservationDate = null;
      if (list.reservation_type === 'large') {
        const [rows] = await pool.execute(
          `SELECT client_name as owner_name, reservation_date FROM large_reservations WHERE id = ? LIMIT 1`,
          [list.reservation_id]
        );
        if (rows.length) {
          ownerName = rows[0].owner_name;
          reservationDate = rows[0].reservation_date;
        }
      } else {
        const [rows] = await pool.execute(
          `SELECT client_name as owner_name, reservation_date FROM restaurant_reservations WHERE id = ? LIMIT 1`,
          [list.reservation_id]
        );
        if (rows.length) {
          ownerName = rows[0].owner_name;
          reservationDate = rows[0].reservation_date;
        }
      }

      // Buscar convidados
      const [guests] = await pool.execute(
        `SELECT id, name, COALESCE(NULL, NULL) as status FROM guests WHERE guest_list_id = ? ORDER BY id ASC`,
        [list.id]
      );

      // status fixo "Confirmado"
      const guestsWithStatus = guests.map(g => ({ id: g.id, name: g.name, status: 'Confirmado' }));

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

  return router;
};


