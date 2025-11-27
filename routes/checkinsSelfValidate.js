// routes/checkinsSelfValidate.js
// Endpoint para Auto Check-in Seguro via QR Code com validação de geolocalização

const express = require('express');
const router = express.Router();

/**
 * Função auxiliar: Calcula a distância entre duas coordenadas usando a fórmula de Haversine
 * @param {number} lat1 - Latitude do ponto 1
 * @param {number} lon1 - Longitude do ponto 1
 * @param {number} lat2 - Latitude do ponto 2
 * @param {number} lon2 - Longitude do ponto 2
 * @returns {number} Distância em metros
 */
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000; // Raio da Terra em metros
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) *
    Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Distância em metros
}

module.exports = (pool) => {
  /**
   * @route   POST /api/checkins/self-validate
   * @desc    Valida e realiza check-in automático de convidado via QR Code com validação de geolocalização
   * @access  Public
   * 
   * @body    {
   *            token: string,           // Token da lista de convidados
   *            email?: string,          // E-mail do convidado (opcional se name for fornecido)
   *            name?: string,            // Nome do convidado (opcional se email for fornecido)
   *            latitude: number,         // Latitude do dispositivo
   *            longitude: number         // Longitude do dispositivo
   *          }
   * 
   * @returns {
   *            success: boolean,
   *            message: string,
   *            guest?: {
   *              id: number,
   *              name: string,
   *              checked_in: boolean,
   *              checkin_time: string
   *            }
   *          }
   */
  router.post('/self-validate', async (req, res) => {
    const client = await pool.connect();
    try {
      const { token, name, latitude, longitude } = req.body;

      // Validações básicas
      if (!token) {
        return res.status(400).json({
          success: false,
          error: 'Token da lista é obrigatório'
        });
      }

      if (!name) {
        return res.status(400).json({
          success: false,
          error: 'É necessário informar o nome do convidado'
        });
      }

      if (!latitude || !longitude) {
        return res.status(400).json({
          success: false,
          error: 'Coordenadas de localização são obrigatórias'
        });
      }

      await client.query('BEGIN');

      // 1. Buscar a lista de convidados pelo token
      const listResult = await client.query(
        `SELECT gl.id, gl.reservation_id, gl.reservation_type, gl.expires_at,
                CASE WHEN gl.expires_at >= NOW() THEN 1 ELSE 0 END AS is_valid
         FROM guest_lists gl
         WHERE gl.shareable_link_token = $1
         LIMIT 1`,
        [token]
      );

      if (listResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({
          success: false,
          error: 'Lista de convidados não encontrada'
        });
      }

      const list = listResult.rows[0];

      if (!list.is_valid) {
        await client.query('ROLLBACK');
        return res.status(410).json({
          success: false,
          error: 'Link expirado'
        });
      }

      // 2. Buscar informações da reserva e do estabelecimento
      let reservationDate = null;
      let reservationTime = null;
      let establishmentLat = null;
      let establishmentLon = null;

      if (list.reservation_type === 'large') {
        const reservationResult = await client.query(
          `SELECT lr.reservation_date, lr.reservation_time, p.latitude, p.longitude
           FROM large_reservations lr
           LEFT JOIN eventos e ON lr.evento_id = e.id
           LEFT JOIN places p ON e.id_place = p.id
           WHERE lr.id = $1
           LIMIT 1`,
          [list.reservation_id]
        );

        if (reservationResult.rows.length > 0) {
          const res = reservationResult.rows[0];
          reservationDate = res.reservation_date;
          reservationTime = res.reservation_time;
          establishmentLat = res.latitude ? parseFloat(res.latitude) : null;
          establishmentLon = res.longitude ? parseFloat(res.longitude) : null;
        }
      } else {
        const reservationResult = await client.query(
          `SELECT rr.reservation_date, rr.reservation_time, p.latitude, p.longitude
           FROM restaurant_reservations rr
           LEFT JOIN eventos e ON rr.evento_id = e.id
           LEFT JOIN places p ON e.id_place = p.id
           WHERE rr.id = $1
           LIMIT 1`,
          [list.reservation_id]
        );

        if (reservationResult.rows.length > 0) {
          const res = reservationResult.rows[0];
          reservationDate = res.reservation_date;
          reservationTime = res.reservation_time;
          establishmentLat = res.latitude ? parseFloat(res.latitude) : null;
          establishmentLon = res.longitude ? parseFloat(res.longitude) : null;
        }
      }

      // 3. Validação Temporal: Verificar se está dentro do horário do evento
      if (reservationDate) {
        const now = new Date();
        const eventDate = new Date(reservationDate);
        
        // Se houver horário, validar também o horário
        if (reservationTime) {
          const [hours, minutes] = reservationTime.split(':');
          eventDate.setHours(parseInt(hours), parseInt(minutes), 0, 0);
          
          // Permitir check-in até 2 horas após o horário do evento
          const eventEndTime = new Date(eventDate);
          eventEndTime.setHours(eventEndTime.getHours() + 2);
          
          if (now < eventDate || now > eventEndTime) {
            await client.query('ROLLBACK');
            return res.status(403).json({
              success: false,
              error: 'Check-in só é permitido dentro do horário do evento'
            });
          }
        } else {
          // Se não houver horário, validar apenas a data
          const eventDateOnly = new Date(eventDate);
          eventDateOnly.setHours(0, 0, 0, 0);
          const nowDateOnly = new Date(now);
          nowDateOnly.setHours(0, 0, 0, 0);
          
          if (nowDateOnly.getTime() !== eventDateOnly.getTime()) {
            await client.query('ROLLBACK');
            return res.status(403).json({
              success: false,
              error: 'Check-in só é permitido na data do evento'
            });
          }
        }
      }

      // 4. Validação de Geolocalização: Verificar se está dentro do raio de 200m
      if (establishmentLat && establishmentLon) {
        const distance = calculateDistance(
          latitude,
          longitude,
          establishmentLat,
          establishmentLon
        );

        if (distance > 200) {
          await client.query('ROLLBACK');
          return res.status(403).json({
            success: false,
            error: `Você não está no local do evento. Distância: ${Math.round(distance)}m (máximo: 200m)`
          });
        }
      } else {
        // Se não houver coordenadas do estabelecimento, apenas logar um aviso
        console.warn(`⚠️ Estabelecimento sem coordenadas para a reserva ${list.reservation_id}`);
        // Não bloquear o check-in, mas avisar
      }

      // 5. Buscar o convidado na lista por nome (case-insensitive)
      const guestQuery = 'SELECT id, name, checked_in, checkin_time FROM guests WHERE guest_list_id = $1 AND LOWER(name) = LOWER($2) LIMIT 1';
      const guestParams = [list.id, name];

      const guestResult = await client.query(guestQuery, guestParams);

      if (guestResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({
          success: false,
          error: 'Convidado não encontrado na lista. Verifique se o nome está correto e exatamente como aparece na lista.'
        });
      }

      const guest = guestResult.rows[0];

      // 6. Verificar se já fez check-in
      if (guest.checked_in) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          error: 'Você já realizou o check-in anteriormente'
        });
      }

      // 7. Atualizar status do convidado para check-in
      await client.query(
        'UPDATE guests SET checked_in = TRUE, checkin_time = CURRENT_TIMESTAMP WHERE id = $1',
        [guest.id]
      );

      // 8. Verificar e liberar brindes (se a função estiver disponível)
      // Nota: Esta função deve ser passada como parâmetro ao criar a rota
      // if (checkAndAwardBrindes) {
      //   await checkAndAwardBrindes(list.reservation_id);
      // }

      await client.query('COMMIT');

      res.status(200).json({
        success: true,
        message: 'Check-in realizado com sucesso! 🎉',
        guest: {
          id: guest.id,
          name: guest.name,
          checked_in: true,
          checkin_time: new Date().toISOString()
        }
      });

    } catch (error) {
      await client.query('ROLLBACK');
      console.error('❌ Erro ao validar check-in automático:', error);
      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor ao processar check-in'
      });
    } finally {
      if (client) client.release();
    }
  });

  return router;
};

