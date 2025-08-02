// routes/birthdayReservations.js

const express = require('express');
const router = express.Router();

module.exports = (pool) => {
  /**
   * @route   POST /api/birthday-reservations
   * @desc    Cria uma nova reserva de aniversário com todos os detalhes
   * @access  Private (somente usuários autenticados)
   */
  router.post('/', async (req, res) => {
    const {
      user_id,
      aniversariante_nome,
      data_aniversario,
      quantidade_convidados,
      id_casa_evento, 
      decoracao_tipo,
      painel_personalizado,
      painel_estoque_imagem_url,
      painel_tema,
      painel_frase,
      bebida_balde_budweiser,
      bebida_balde_corona,
      bebida_balde_heineken,
      bebida_combo_gin_142,
      bebida_licor_rufus,
    } = req.body;

    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      let placeId = id_casa_evento;
      if (typeof id_casa_evento === 'string' && isNaN(parseInt(id_casa_evento))) {
         // MODIFICADO: A consulta agora usa COLLATE para ser insensível a maiúsculas e minúsculas
         const [placeRows] = await connection.query('SELECT id FROM places WHERE name = ? COLLATE utf8mb4_unicode_ci', [id_casa_evento]);
         if (placeRows.length > 0) {
           placeId = placeRows[0].id;
         } else {
           await connection.rollback();
           return res.status(404).json({ message: 'Bar selecionado não encontrado.' });
         }
      }

      const sqlInsert = `
        INSERT INTO birthday_reservations (
          user_id,
          aniversariante_nome,
          data_aniversario,
          quantidade_convidados,
          id_casa_evento,
          decoracao_tipo,
          painel_personalizado,
          painel_estoque_imagem_url,
          painel_tema,
          painel_frase,
          bebida_balde_budweiser,
          bebida_balde_corona,
          bebida_balde_heineken,
          bebida_combo_gin_142,
          bebida_licor_rufus
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      const [result] = await connection.execute(sqlInsert, [
        user_id,
        aniversariante_nome,
        data_aniversario,
        quantidade_convidados,
        placeId,
        decoracao_tipo,
        painel_personalizado,
        painel_estoque_imagem_url,
        painel_tema,
        painel_frase,
        bebida_balde_budweiser,
        bebida_balde_corona,
        bebida_balde_heineken,
        bebida_combo_gin_142,
        bebida_licor_rufus,
      ]);

      await connection.commit();

      res.status(201).json({
        message: 'Reserva de aniversário criada com sucesso!',
        id: result.insertId,
      });

    } catch (error) {
      await connection.rollback();
      console.error('Erro ao criar reserva de aniversário:', error);
      res.status(500).json({ message: 'Erro ao criar a reserva de aniversário.' });
    } finally {
      if (connection) connection.release();
    }
  });

  return router;
};