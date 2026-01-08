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
      area_id, // Novo campo: área preferida
      reservation_time, // Novo campo: horário da reserva
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

      // Validar que id_casa_evento foi fornecido e é válido
      if (!id_casa_evento || id_casa_evento === 0) {
        await client.query('ROLLBACK');
        client.release();
        return res.status(400).json({ message: 'Estabelecimento é obrigatório. Por favor, selecione um estabelecimento.' });
      }

      let placeId = id_casa_evento;
      if (typeof id_casa_evento === 'string' && isNaN(parseInt(id_casa_evento))) {
         // PostgreSQL usa ILIKE para busca case-insensitive
         const placeResult = await client.query('SELECT id FROM places WHERE name ILIKE $1', [id_casa_evento]);
         if (placeResult.rows.length > 0) {
           placeId = placeResult.rows[0].id;
         } else {
           await client.query('ROLLBACK');
           client.release();
           return res.status(404).json({ message: 'Bar selecionado não encontrado.' });
         }
      }

      // Validar que o estabelecimento existe no banco
      const placeCheck = await client.query('SELECT id, name FROM places WHERE id = $1', [placeId]);
      if (placeCheck.rows.length === 0) {
        await client.query('ROLLBACK');
        client.release();
        return res.status(404).json({ message: `Estabelecimento com ID ${placeId} não encontrado.` });
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
      const birthdayReservationId = result.rows[0].id;
      console.log('✅ Reserva de aniversário criada com ID:', birthdayReservationId);

      // 🎂 NOVA FUNCIONALIDADE: Criar reserva de restaurante automaticamente
      let restaurantReservationId = null;
      if (area_id && reservation_time && data_aniversario) {
        try {
          console.log('🎂 Criando reserva de restaurante automaticamente...');
          const reservationDate = data_aniversario.includes('T') ? data_aniversario.split('T')[0] : data_aniversario;
          const reservationTime = reservation_time.includes(':') && reservation_time.split(':').length === 2 
            ? `${reservation_time}:00` 
            : reservation_time;
          
          const restaurantReservationData = {
            client_name: aniversariante_nome || '',
            client_phone: whatsapp || '',
            client_email: email || null,
            reservation_date: reservationDate,
            reservation_time: reservationTime,
            number_of_people: quantidade_convidados || 0,
            area_id: area_id,
            status: 'NOVA',
            origin: 'SITE',
            notes: `🎂 Reserva de Aniversário - ${decoracao_tipo || 'Decoração'}. ID Reserva Aniversário: ${birthdayReservationId}`,
            establishment_id: placeId,
            send_email: false,
            send_whatsapp: false,
          };

          const restaurantInsert = `
            INSERT INTO restaurant_reservations (
              client_name, client_phone, client_email, reservation_date, reservation_time,
              number_of_people, area_id, status, origin, notes, establishment_id,
              send_email, send_whatsapp, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW())
            RETURNING id
          `;

          const restaurantParams = [
            restaurantReservationData.client_name,
            restaurantReservationData.client_phone,
            restaurantReservationData.client_email,
            restaurantReservationData.reservation_date,
            restaurantReservationData.reservation_time,
            restaurantReservationData.number_of_people,
            restaurantReservationData.area_id,
            restaurantReservationData.status,
            restaurantReservationData.origin,
            restaurantReservationData.notes,
            restaurantReservationData.establishment_id,
            restaurantReservationData.send_email,
            restaurantReservationData.send_whatsapp,
          ];

          const restaurantResult = await client.query(restaurantInsert, restaurantParams);
          restaurantReservationId = restaurantResult.rows[0].id;
          console.log('✅ Reserva de restaurante criada automaticamente com ID:', restaurantReservationId);

          // Criar lista de convidados automaticamente
          try {
            console.log('📝 Criando lista de convidados automaticamente...');
            const guestListInsert = `
              INSERT INTO reservas (
                user_id, tipo_reserva, nome_lista, data_reserva, evento_id, quantidade_convidados, codigo_convite
              ) VALUES ($1, $2, $3, $4, $5, $6, $7)
              RETURNING id
            `;
            
            const { customAlphabet } = await import('nanoid');
            const nanoid = customAlphabet('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', 6);
            const codigoConvite = nanoid();
            
            const guestListParams = [
              user_id || 1,
              'ANIVERSARIO',
              aniversariante_nome || 'Aniversariante',
              reservationDate,
              null, // evento_id
              quantidade_convidados || 0,
              codigoConvite
            ];

            const guestListResult = await client.query(guestListInsert, guestListParams);
            const guestListId = guestListResult.rows[0].id;
            console.log('✅ Lista de convidados criada automaticamente com ID:', guestListId);

            // Criar convidado inicial (aniversariante)
            const convidadoInsert = `
              INSERT INTO convidados (reserva_id, nome, qr_code, status, geo_checkin_status)
              VALUES ($1, $2, $3, $4, $5)
            `;
            const qrCodeData = `reserva:${guestListId}:convidado:${(aniversariante_nome || '').replace(/\s/g, '')}:${Date.now()}`;
            await client.query(convidadoInsert, [
              guestListId,
              aniversariante_nome || 'Aniversariante',
              qrCodeData,
              'PENDENTE',
              'NAO_APLICAVEL'
            ]);
            console.log('✅ Convidado inicial (aniversariante) criado na lista');

          } catch (guestListError) {
            console.warn('⚠️ Erro ao criar lista de convidados (não crítico):', guestListError);
            // Não falha a transação se a lista não for criada
          }

        } catch (restaurantError) {
          console.error('❌ Erro ao criar reserva de restaurante (não crítico):', restaurantError);
          // Não falha a transação se a reserva de restaurante não for criada
        }
      } else {
        console.log('⚠️ Área e/ou horário não fornecidos, pulando criação de reserva de restaurante');
      }

      await client.query('COMMIT');
      console.log('✅ Transação commitada com sucesso');

      res.status(201).json({
        message: 'Reserva de aniversário criada com sucesso!',
        id: birthdayReservationId,
        restaurant_reservation_id: restaurantReservationId,
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
   * @desc    Lista todas as reservas de aniversário ou filtra por estabelecimento
   * @access  Private
   * @query   establishment_id (opcional) - ID do estabelecimento para filtrar
   */
  router.get('/', async (req, res) => {
    try {
      const { establishment_id } = req.query;
      
      let query = `
        SELECT 
          br.*,
          p.name as place_name,
          u.name as user_name
        FROM birthday_reservations br
        LEFT JOIN places p ON br.id_casa_evento = p.id
        LEFT JOIN users u ON br.user_id = u.id
      `;
      
      const params = [];
      
      // Se establishment_id foi fornecido, filtrar por ele
      if (establishment_id) {
        query += ` WHERE br.id_casa_evento = $1`;
        params.push(establishment_id);
      }
      
      query += ` ORDER BY br.created_at DESC`;
      
      const result = await pool.query(query, params);

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