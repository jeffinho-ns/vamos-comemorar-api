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

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      let placeId = id_casa_evento;
      if (typeof id_casa_evento === 'string' && isNaN(parseInt(id_casa_evento))) {
         // PostgreSQL usa ILIKE para busca case-insensitive
         const placeResult = await client.query('SELECT id FROM places WHERE name ILIKE $1', [id_casa_evento]);
         if (placeResult.rows.length > 0) {
           placeId = placeResult.rows[0].id;
         } else {
           await client.query('ROLLBACK');
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
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34) RETURNING id
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

      const result = await client.query(sqlInsert, insertParams);

      await client.query('COMMIT');

      res.status(201).json({
        message: 'Reserva de aniversário criada com sucesso!',
        id: result.rows[0].id,
      });

    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Erro ao criar reserva de aniversário:', error);
      res.status(500).json({ message: 'Erro ao criar a reserva de aniversário.' });
    } finally {
      if (client) client.release();
    }
  });

  /**
   * @route   GET /api/birthday-reservations
   * @desc    Lista todas as reservas de aniversário
   * @access  Private
   */
  router.get('/', async (req, res) => {
    try {
      const result = await pool.query(`
        SELECT 
          br.*,
          p.name as place_name,
          u.name as user_name
        FROM birthday_reservations br
        LEFT JOIN places p ON br.id_casa_evento = p.id
        LEFT JOIN users u ON br.user_id = u.id
        ORDER BY br.created_at DESC
      `);

      res.json(result.rows);

    } catch (error) {
      console.error('Erro ao buscar reservas de aniversário:', error);
      res.status(500).json({ message: 'Erro ao buscar as reservas de aniversário.' });
    }
  });

  /**
   * @route   GET /api/birthday-reservations/:id
   * @desc    Busca uma reserva de aniversário específica
   * @access  Private
   */
  router.get('/:id', async (req, res) => {
    const { id } = req.params;
    const client = await pool.connect();

    try {
      const rowsResult = await client.query(`
        SELECT 
          br.*,
          p.name as place_name,
          u.name as user_name
        FROM birthday_reservations br
        LEFT JOIN places p ON br.id_casa_evento = p.id
        LEFT JOIN users u ON br.user_id = u.id
        WHERE br.id = $1
      `, [id]);

      if (rowsResult.rows.length === 0) {
        return res.status(404).json({ message: 'Reserva de aniversário não encontrada.' });
      }

      res.json(rowsResult.rows[0]);

    } catch (error) {
      console.error('Erro ao buscar reserva de aniversário:', error);
      res.status(500).json({ message: 'Erro ao buscar a reserva de aniversário.' });
    } finally {
      if (client) client.release();
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

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      let placeId = id_casa_evento;
      if (typeof id_casa_evento === 'string' && isNaN(parseInt(id_casa_evento))) {
         const placeRowsResult = await client.query('SELECT id FROM places WHERE name ILIKE $1', [id_casa_evento]);
         if (placeRowsResult.rows.length > 0) {
           placeId = placeRowsResult.rows[0].id;
         } else {
           await client.query('ROLLBACK');
           return res.status(404).json({ message: 'Bar selecionado não encontrado.' });
         }
      }

      const sqlUpdate = `
        UPDATE birthday_reservations SET
          aniversariante_nome = $1,
          data_aniversario = $2,
          quantidade_convidados = $3,
          id_casa_evento = $4,
          decoracao_tipo = $5,
          painel_personalizado = $6,
          painel_estoque_imagem_url = $7,
          painel_tema = $8,
          painel_frase = $9,
          item_bar_bebida_1 = $10,
          item_bar_bebida_2 = $11,
          item_bar_bebida_3 = $12,
          item_bar_bebida_4 = $13,
          item_bar_bebida_5 = $14,
          item_bar_bebida_6 = $15,
          item_bar_bebida_7 = $16,
          item_bar_bebida_8 = $17,
          item_bar_bebida_9 = $18,
          item_bar_bebida_10 = $19,
          item_bar_comida_1 = $20,
          item_bar_comida_2 = $21,
          item_bar_comida_3 = $22,
          item_bar_comida_4 = $23,
          item_bar_comida_5 = $24,
          item_bar_comida_6 = $25,
          item_bar_comida_7 = $26,
          item_bar_comida_8 = $27,
          item_bar_comida_9 = $28,
          item_bar_comida_10 = $29,
          lista_presentes = $30,
          documento = $31,
          whatsapp = $32,
          email = $33,
          status = $34,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $35
      `;

      const result = await client.query(sqlUpdate, [
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

      if (result.rowCount === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ message: 'Reserva de aniversário não encontrada.' });
      }

      await client.query('COMMIT');

      res.json({
        message: 'Reserva de aniversário atualizada com sucesso!',
        id: id
      });

    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Erro ao atualizar reserva de aniversário:', error);
      res.status(500).json({ message: 'Erro ao atualizar a reserva de aniversário.' });
    } finally {
      if (client) client.release();
    }
  });

  /**
   * @route   DELETE /api/birthday-reservations/:id
   * @desc    Remove uma reserva de aniversário
   * @access  Private
   */
  router.delete('/:id', async (req, res) => {
    const { id } = req.params;
    const client = await pool.connect();

    try {
      const result = await client.query('DELETE FROM birthday_reservations WHERE id = $1', [id]);

      if (result.rowCount === 0) {
        return res.status(404).json({ message: 'Reserva de aniversário não encontrada.' });
      }

      res.json({ message: 'Reserva de aniversário removida com sucesso!' });

    } catch (error) {
      console.error('Erro ao remover reserva de aniversário:', error);
      res.status(500).json({ message: 'Erro ao remover a reserva de aniversário.' });
    } finally {
      if (client) client.release();
    }
  });

  return router;
};