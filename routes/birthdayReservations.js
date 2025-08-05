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
    console.log('📥 Dados recebidos na API:', JSON.stringify(req.body, null, 2));
    
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
      // Novos campos para bebidas do bar
      item_bar_bebida_1,
      item_bar_bebida_2,
      item_bar_bebida_3,
      item_bar_bebida_4,
      item_bar_bebida_5,
      item_bar_bebida_6,
      item_bar_bebida_7,
      item_bar_bebida_8,
      item_bar_bebida_9,
      item_bar_bebida_10,
      // Novos campos para comidas do bar
      item_bar_comida_1,
      item_bar_comida_2,
      item_bar_comida_3,
      item_bar_comida_4,
      item_bar_comida_5,
      item_bar_comida_6,
      item_bar_comida_7,
      item_bar_comida_8,
      item_bar_comida_9,
      item_bar_comida_10,
      // Lista de presentes
      lista_presentes,
      // Campos de contato
      documento,
      whatsapp,
      email,
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
          item_bar_bebida_1,
          item_bar_bebida_2,
          item_bar_bebida_3,
          item_bar_bebida_4,
          item_bar_bebida_5,
          item_bar_bebida_6,
          item_bar_bebida_7,
          item_bar_bebida_8,
          item_bar_bebida_9,
          item_bar_bebida_10,
          item_bar_comida_1,
          item_bar_comida_2,
          item_bar_comida_3,
          item_bar_comida_4,
          item_bar_comida_5,
          item_bar_comida_6,
          item_bar_comida_7,
          item_bar_comida_8,
          item_bar_comida_9,
          item_bar_comida_10,
          lista_presentes,
          documento,
          whatsapp,
          email
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      const insertParams = [
        user_id || 1,
        aniversariante_nome || '',
        data_aniversario || new Date().toISOString().split('T')[0],
        quantidade_convidados || 0,
        placeId || 1,
        decoracao_tipo || '',
        painel_personalizado || 0,
        painel_estoque_imagem_url || null,
        painel_tema || null,
        painel_frase || null,
        item_bar_bebida_1 || 0,
        item_bar_bebida_2 || 0,
        item_bar_bebida_3 || 0,
        item_bar_bebida_4 || 0,
        item_bar_bebida_5 || 0,
        item_bar_bebida_6 || 0,
        item_bar_bebida_7 || 0,
        item_bar_bebida_8 || 0,
        item_bar_bebida_9 || 0,
        item_bar_bebida_10 || 0,
        item_bar_comida_1 || 0,
        item_bar_comida_2 || 0,
        item_bar_comida_3 || 0,
        item_bar_comida_4 || 0,
        item_bar_comida_5 || 0,
        item_bar_comida_6 || 0,
        item_bar_comida_7 || 0,
        item_bar_comida_8 || 0,
        item_bar_comida_9 || 0,
        item_bar_comida_10 || 0,
        JSON.stringify(lista_presentes || []),
        documento || null,
        whatsapp || null,
        email || null,
      ];

      console.log('🔍 Parâmetros para INSERT:');
      insertParams.forEach((param, index) => {
        console.log(`${index + 1}: ${param} (${typeof param})`);
      });

      const [result] = await connection.execute(sqlInsert, insertParams);

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

  /**
   * @route   GET /api/birthday-reservations
   * @desc    Lista todas as reservas de aniversário
   * @access  Private
   */
  router.get('/', async (req, res) => {
    const connection = await pool.getConnection();

    try {
      const [rows] = await connection.query(`
        SELECT 
          br.*,
          p.name as place_name,
          u.name as user_name
        FROM birthday_reservations br
        LEFT JOIN places p ON br.id_casa_evento = p.id
        LEFT JOIN users u ON br.user_id = u.id
        ORDER BY br.created_at DESC
      `);

      res.json(rows);

    } catch (error) {
      console.error('Erro ao buscar reservas de aniversário:', error);
      res.status(500).json({ message: 'Erro ao buscar as reservas de aniversário.' });
    } finally {
      if (connection) connection.release();
    }
  });

  /**
   * @route   GET /api/birthday-reservations/:id
   * @desc    Busca uma reserva de aniversário específica
   * @access  Private
   */
  router.get('/:id', async (req, res) => {
    const { id } = req.params;
    const connection = await pool.getConnection();

    try {
      const [rows] = await connection.query(`
        SELECT 
          br.*,
          p.name as place_name,
          u.name as user_name
        FROM birthday_reservations br
        LEFT JOIN places p ON br.id_casa_evento = p.id
        LEFT JOIN users u ON br.user_id = u.id
        WHERE br.id = ?
      `, [id]);

      if (rows.length === 0) {
        return res.status(404).json({ message: 'Reserva de aniversário não encontrada.' });
      }

      res.json(rows[0]);

    } catch (error) {
      console.error('Erro ao buscar reserva de aniversário:', error);
      res.status(500).json({ message: 'Erro ao buscar a reserva de aniversário.' });
    } finally {
      if (connection) connection.release();
    }
  });

  /**
   * @route   PUT /api/birthday-reservations/:id
   * @desc    Atualiza uma reserva de aniversário
   * @access  Private
   */
  router.put('/:id', async (req, res) => {
    const { id } = req.params;
    const {
      aniversariante_nome,
      data_aniversario,
      quantidade_convidados,
      id_casa_evento,
      decoracao_tipo,
      painel_personalizado,
      painel_estoque_imagem_url,
      painel_tema,
      painel_frase,
      item_bar_bebida_1,
      item_bar_bebida_2,
      item_bar_bebida_3,
      item_bar_bebida_4,
      item_bar_bebida_5,
      item_bar_bebida_6,
      item_bar_bebida_7,
      item_bar_bebida_8,
      item_bar_bebida_9,
      item_bar_bebida_10,
      item_bar_comida_1,
      item_bar_comida_2,
      item_bar_comida_3,
      item_bar_comida_4,
      item_bar_comida_5,
      item_bar_comida_6,
      item_bar_comida_7,
      item_bar_comida_8,
      item_bar_comida_9,
      item_bar_comida_10,
      lista_presentes,
      documento,
      whatsapp,
      email,
      status
    } = req.body;

    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      let placeId = id_casa_evento;
      if (typeof id_casa_evento === 'string' && isNaN(parseInt(id_casa_evento))) {
         const [placeRows] = await connection.query('SELECT id FROM places WHERE name = ? COLLATE utf8mb4_unicode_ci', [id_casa_evento]);
         if (placeRows.length > 0) {
           placeId = placeRows[0].id;
         } else {
           await connection.rollback();
           return res.status(404).json({ message: 'Bar selecionado não encontrado.' });
         }
      }

      const sqlUpdate = `
        UPDATE birthday_reservations SET
          aniversariante_nome = ?,
          data_aniversario = ?,
          quantidade_convidados = ?,
          id_casa_evento = ?,
          decoracao_tipo = ?,
          painel_personalizado = ?,
          painel_estoque_imagem_url = ?,
          painel_tema = ?,
          painel_frase = ?,
          item_bar_bebida_1 = ?,
          item_bar_bebida_2 = ?,
          item_bar_bebida_3 = ?,
          item_bar_bebida_4 = ?,
          item_bar_bebida_5 = ?,
          item_bar_bebida_6 = ?,
          item_bar_bebida_7 = ?,
          item_bar_bebida_8 = ?,
          item_bar_bebida_9 = ?,
          item_bar_bebida_10 = ?,
          item_bar_comida_1 = ?,
          item_bar_comida_2 = ?,
          item_bar_comida_3 = ?,
          item_bar_comida_4 = ?,
          item_bar_comida_5 = ?,
          item_bar_comida_6 = ?,
          item_bar_comida_7 = ?,
          item_bar_comida_8 = ?,
          item_bar_comida_9 = ?,
          item_bar_comida_10 = ?,
          lista_presentes = ?,
          documento = ?,
          whatsapp = ?,
          email = ?,
          status = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `;

      const [result] = await connection.execute(sqlUpdate, [
        aniversariante_nome,
        data_aniversario,
        quantidade_convidados,
        placeId,
        decoracao_tipo,
        painel_personalizado,
        painel_estoque_imagem_url,
        painel_tema,
        painel_frase,
        item_bar_bebida_1 || 0,
        item_bar_bebida_2 || 0,
        item_bar_bebida_3 || 0,
        item_bar_bebida_4 || 0,
        item_bar_bebida_5 || 0,
        item_bar_bebida_6 || 0,
        item_bar_bebida_7 || 0,
        item_bar_bebida_8 || 0,
        item_bar_bebida_9 || 0,
        item_bar_bebida_10 || 0,
        item_bar_comida_1 || 0,
        item_bar_comida_2 || 0,
        item_bar_comida_3 || 0,
        item_bar_comida_4 || 0,
        item_bar_comida_5 || 0,
        item_bar_comida_6 || 0,
        item_bar_comida_7 || 0,
        item_bar_comida_8 || 0,
        item_bar_comida_9 || 0,
        item_bar_comida_10 || 0,
        JSON.stringify(lista_presentes || []),
        documento,
        whatsapp,
        email,
        status,
        id
      ]);

      if (result.affectedRows === 0) {
        await connection.rollback();
        return res.status(404).json({ message: 'Reserva de aniversário não encontrada.' });
      }

      await connection.commit();

      res.json({
        message: 'Reserva de aniversário atualizada com sucesso!',
        id: id
      });

    } catch (error) {
      await connection.rollback();
      console.error('Erro ao atualizar reserva de aniversário:', error);
      res.status(500).json({ message: 'Erro ao atualizar a reserva de aniversário.' });
    } finally {
      if (connection) connection.release();
    }
  });

  /**
   * @route   DELETE /api/birthday-reservations/:id
   * @desc    Remove uma reserva de aniversário
   * @access  Private
   */
  router.delete('/:id', async (req, res) => {
    const { id } = req.params;
    const connection = await pool.getConnection();

    try {
      const [result] = await connection.execute('DELETE FROM birthday_reservations WHERE id = ?', [id]);

      if (result.affectedRows === 0) {
        return res.status(404).json({ message: 'Reserva de aniversário não encontrada.' });
      }

      res.json({ message: 'Reserva de aniversário removida com sucesso!' });

    } catch (error) {
      console.error('Erro ao remover reserva de aniversário:', error);
      res.status(500).json({ message: 'Erro ao remover a reserva de aniversário.' });
    } finally {
      if (connection) connection.release();
    }
  });

  return router;
};