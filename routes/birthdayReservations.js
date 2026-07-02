// routes/birthdayReservations.js

const express = require('express');
const router = express.Router();
const NotificationService = require('../services/notificationService');
const optionalAuth = require('../middleware/optionalAuth');
const tenantMiddleware = require('../tenancy/tenantMiddleware');
const { establishmentScopeClause } = require('../tenancy/queryScope');

module.exports = (pool) => {
  router.use(optionalAuth);
  router.use(tenantMiddleware());

  /**
   * @route   POST /api/birthday-reservations
   * @desc    Cria uma nova reserva de aniversário com todos os detalhes
   * @access  Private (somente usuários autenticados)
   */
  router.post('/', async (req, res) => {
    console.log('📥 Dados recebidos na API:', JSON.stringify(req.body, null, 2));
    console.log('📥 area_id recebido:', req.body.area_id, 'tipo:', typeof req.body.area_id);
    console.log('📥 reservation_time recebido:', req.body.reservation_time, 'tipo:', typeof req.body.reservation_time);
    
    const {
      user_id,
      aniversariante_nome,
      data_aniversario,
      quantidade_convidados,
      id_casa_evento,
      area_id, // Novo campo: área preferida
      reservation_time, // Novo campo: horário da reserva
      decoracao_tipo,
      decoracao_preco,
      decoracao_imagem,
      painel_personalizado,
      painel_estoque_imagem_url,
      painel_tema,
      painel_frase,
      // Dados completos dos itens (novo)
      bebidas_completas,
      comidas_completas,
      // Novos campos para bebidas do bar (manter compatibilidade)
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
      // Novos campos para comidas do bar (manter compatibilidade)
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

      // Converter id_casa_evento para número desde o início
      let placeId = null;
      if (typeof id_casa_evento === 'string') {
        // Se for string numérica, converter para número
        if (!isNaN(parseInt(id_casa_evento))) {
          placeId = parseInt(id_casa_evento);
        } else {
          // Se for string não numérica, buscar pelo nome
          const placeResult = await client.query('SELECT id FROM places WHERE name ILIKE $1', [id_casa_evento]);
          if (placeResult.rows.length > 0) {
            placeId = placeResult.rows[0].id;
          } else {
            await client.query('ROLLBACK');
            client.release();
            return res.status(404).json({ message: 'Bar selecionado não encontrado.' });
          }
        }
      } else {
        // Se já for número, usar diretamente
        placeId = id_casa_evento;
      }
      
      // Garantir que placeId seja um número inteiro válido
      if (!placeId || isNaN(placeId) || placeId <= 0) {
        await client.query('ROLLBACK');
        client.release();
        return res.status(400).json({ message: `ID de estabelecimento inválido: ${id_casa_evento}` });
      }

      // Validar que o estabelecimento existe no banco
      const placeCheck = await client.query('SELECT id, name FROM places WHERE id = $1', [placeId]);
      if (placeCheck.rows.length === 0) {
        await client.query('ROLLBACK');
        client.release();
        return res.status(404).json({ message: `Estabelecimento com ID ${placeId} não encontrado.` });
      }

      console.log('✅ [POST /birthday-reservations] Estabelecimento validado:', {
        id_casa_evento_recebido: id_casa_evento,
        placeId_final: placeId,
        placeId_tipo: typeof placeId,
        estabelecimento_nome: placeCheck.rows[0].name
      });

      // Preparar dados para salvar (incluindo decoracao_preco, bebidas_completas, comidas_completas)
      const decoracaoPrecoValue = decoracao_preco ? parseFloat(decoracao_preco) : null;
      const bebidasCompletasJson = bebidas_completas && Array.isArray(bebidas_completas) ? JSON.stringify(bebidas_completas) : null;
      const comidasCompletasJson = comidas_completas && Array.isArray(comidas_completas) ? JSON.stringify(comidas_completas) : null;
      
      // Formatar data_aniversario para garantir que seja apenas a data (sem hora/timezone)
      let dataAniversarioFormatted = data_aniversario;
      if (data_aniversario && data_aniversario.includes('T')) {
        dataAniversarioFormatted = data_aniversario.split('T')[0];
      }

      // Verificar se os campos existem na tabela antes de inserir
      // Tentar inserir com os novos campos primeiro, se falhar, inserir sem eles
      let sqlInsert = `
        INSERT INTO birthday_reservations (
          user_id,
          aniversariante_nome,
          data_aniversario,
          quantidade_convidados,
          id_casa_evento,
          decoracao_tipo,
          decoracao_preco,
          decoracao_imagem,
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
          bebidas_completas,
          comidas_completas,
          lista_presentes,
          documento,
          whatsapp,
          email
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, $36, $37, $38) RETURNING id
      `;

      // placeId já está convertido para número acima, usar diretamente
      const insertParams = [
        user_id || 1,
        aniversariante_nome || '',
        dataAniversarioFormatted || new Date().toISOString().split('T')[0],
        quantidade_convidados || 0,
        placeId, // Já é um número inteiro válido
        decoracao_tipo || '',
        decoracaoPrecoValue, // decoracao_preco
        decoracao_imagem || null, // decoracao_imagem
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
        bebidasCompletasJson, // bebidas_completas (JSON)
        comidasCompletasJson, // comidas_completas (JSON)
        JSON.stringify(lista_presentes || []),
        documento || null,
        whatsapp || null,
        email || null,
      ];

      console.log('🔍 Parâmetros para INSERT:');
      insertParams.forEach((param, index) => {
        console.log(`${index + 1}: ${param} (${typeof param})`);
      });

      let result;
      try {
        // Tentar inserir com os novos campos
        result = await client.query(sqlInsert, insertParams);
      } catch (insertError) {
        // Se falhar (campos não existem), fazer ROLLBACK e reiniciar transação antes de tentar fallback
        console.warn('⚠️ Erro ao inserir com novos campos, tentando sem eles:', insertError.message);
        await client.query('ROLLBACK');
        await client.query('BEGIN');
        const sqlInsertFallback = `
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
        const insertParamsFallback = [
          user_id || 1,
          aniversariante_nome || '',
          dataAniversarioFormatted || new Date().toISOString().split('T')[0],
          quantidade_convidados || 0,
          placeId,
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
        result = await client.query(sqlInsertFallback, insertParamsFallback);
      }
      
      const birthdayReservationId = result.rows[0].id;
      console.log('✅ Reserva de aniversário criada com ID:', birthdayReservationId);
      
      // Verificar se a reserva foi realmente salva com os dados corretos
      const verifyResult = await client.query('SELECT id, id_casa_evento, aniversariante_nome, pg_typeof(id_casa_evento) as tipo_coluna FROM birthday_reservations WHERE id = $1', [birthdayReservationId]);
      if (verifyResult.rows.length > 0) {
        const row = verifyResult.rows[0];
        console.log('📋 Dados salvos na reserva de aniversário (verificado no banco):', {
          id: row.id,
          id_casa_evento: row.id_casa_evento,
          id_casa_evento_tipo_coluna: row.tipo_coluna,
          id_casa_evento_valor_bruto: row.id_casa_evento,
          aniversariante_nome: row.aniversariante_nome,
          esperado_id_casa_evento: placeId,
          esperado_tipo: typeof placeId,
          valores_iguais: String(row.id_casa_evento) === String(placeId),
          valores_iguais_com_cast: Number(row.id_casa_evento) === Number(placeId)
        });
        
        // Testar se a reserva pode ser encontrada com a query de busca (sem CAST)
        const testQueryResult1 = await client.query('SELECT id FROM birthday_reservations WHERE id_casa_evento = $1 AND id = $2', [placeId, birthdayReservationId]);
        console.log('🔍 Teste de busca (sem CAST): Reserva encontrada?', testQueryResult1.rows.length > 0);
        
        // Testar se a reserva pode ser encontrada com a query de busca (com CAST)
        const testQueryResult2 = await client.query('SELECT id FROM birthday_reservations WHERE CAST(id_casa_evento AS INTEGER) = $1 AND id = $2', [placeId, birthdayReservationId]);
        console.log('🔍 Teste de busca (com CAST): Reserva encontrada?', testQueryResult2.rows.length > 0);
        
        // Testar com string
        const testQueryResult3 = await client.query('SELECT id FROM birthday_reservations WHERE id_casa_evento::text = $1 AND id = $2', [String(placeId), birthdayReservationId]);
        console.log('🔍 Teste de busca (como string): Reserva encontrada?', testQueryResult3.rows.length > 0);
      }

      // 🎂 NOVA FUNCIONALIDADE: Criar reserva de restaurante automaticamente
      let restaurantReservationId = null;
      
      // Converter area_id para número se necessário
      const areaIdNumber = area_id ? (typeof area_id === 'string' ? parseInt(area_id) : area_id) : null;
      const hasValidAreaId = areaIdNumber && !isNaN(areaIdNumber) && areaIdNumber > 0;
      const hasValidReservationTime = reservation_time && reservation_time.trim() !== '';
      const hasValidDataAniversario = data_aniversario && data_aniversario.trim() !== '';
      
      console.log('🔍 Verificando condições para criar reserva de restaurante:', {
        area_id: area_id,
        areaIdNumber: areaIdNumber,
        reservation_time: reservation_time,
        data_aniversario: data_aniversario,
        hasValidAreaId: hasValidAreaId,
        hasValidReservationTime: hasValidReservationTime,
        hasValidDataAniversario: hasValidDataAniversario,
        allConditionsMet: hasValidAreaId && hasValidReservationTime && hasValidDataAniversario
      });
      
      if (hasValidAreaId && hasValidReservationTime && hasValidDataAniversario) {
        try {
          console.log('🎂 Criando reserva de restaurante automaticamente...');
          const reservationDate = data_aniversario.includes('T') ? data_aniversario.split('T')[0] : data_aniversario;
          const reservationTime = reservation_time.includes(':') && reservation_time.split(':').length === 2 
            ? `${reservation_time}:00` 
            : reservation_time;
          
          console.log('📅 Dados da reserva de restaurante:', {
            reservationDate,
            reservationTime,
            area_id,
            placeId
          });
          
          const restaurantReservationData = {
            client_name: aniversariante_nome || '',
            client_phone: whatsapp || '',
            client_email: email || null,
            reservation_date: reservationDate,
            reservation_time: reservationTime,
            number_of_people: quantidade_convidados || 0,
            area_id: areaIdNumber, // Usar o número convertido
            status: 'NOVA', // Status padrão para novas reservas
            origin: 'SITE',
            notes: `🎂 Reserva de Aniversário - ${decoracao_tipo || 'Decoração'}. ID Reserva Aniversário: ${birthdayReservationId}`,
            establishment_id: placeId,
          };

          const restaurantInsert = `
            INSERT INTO restaurant_reservations (
              client_name, client_phone, client_email, reservation_date, reservation_time,
              number_of_people, area_id, status, origin, notes, establishment_id,
              created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
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
          ];

          const restaurantResult = await client.query(restaurantInsert, restaurantParams);
          restaurantReservationId = restaurantResult.rows[0].id;
          console.log('✅ Reserva de restaurante criada automaticamente com ID:', restaurantReservationId);

          // Criar lista de convidados automaticamente vinculada à reserva de restaurante
          try {
            console.log('📝 Criando lista de convidados automaticamente...');
            
            // Gerar token único para a lista
            const { customAlphabet } = await import('nanoid');
            const nanoid = customAlphabet('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', 24);
            const shareableLinkToken = nanoid();
            
            // Data de expiração: fim do dia da reserva
            const expiresAt = `${reservationDate} 23:59:59`;
            
            // Inserir na tabela guest_lists (correta) vinculada à reserva de restaurante
            const guestListInsert = `
              INSERT INTO guest_lists (
                reservation_id, reservation_type, event_type, shareable_link_token, expires_at
              ) VALUES ($1, $2, $3, $4, $5)
              RETURNING id
            `;
            
            const guestListParams = [
              restaurantReservationId, // ID da reserva de restaurante criada
              'restaurant', // Tipo de reserva
              'aniversario', // Tipo de evento
              shareableLinkToken,
              expiresAt
            ];

            const guestListResult = await client.query(guestListInsert, guestListParams);
            const guestListId = guestListResult.rows[0].id;
            console.log('✅ Lista de convidados criada automaticamente com ID:', guestListId);
            console.log('   Vinculada à reserva de restaurante ID:', restaurantReservationId);
            console.log('   Token:', shareableLinkToken);

            // Criar convidado inicial (aniversariante) na tabela guests
            const guestInsert = `
              INSERT INTO guests (guest_list_id, name, whatsapp)
              VALUES ($1, $2, $3)
              RETURNING id
            `;
            
            const guestResult = await client.query(guestInsert, [
              guestListId,
              aniversariante_nome || 'Aniversariante',
              whatsapp || null
            ]);
            
            console.log('✅ Convidado inicial (aniversariante) criado na lista com ID:', guestResult.rows[0].id);

          } catch (guestListError) {
            console.warn('⚠️ Erro ao criar lista de convidados (não crítico):', guestListError);
            console.warn('   Stack:', guestListError.stack);
            // Não falha a transação se a lista não for criada
          }

        } catch (restaurantError) {
          console.error('❌ Erro ao criar reserva de restaurante (não crítico):', restaurantError);
          // Não falha a transação se a reserva de restaurante não for criada
        }
      } else {
        console.log('⚠️ Área e/ou horário não fornecidos, pulando criação de reserva de restaurante');
        console.log('⚠️ Valores recebidos:', { 
          area_id: area_id, 
          areaIdNumber: areaIdNumber,
          reservation_time: reservation_time, 
          data_aniversario: data_aniversario,
          hasValidAreaId: hasValidAreaId,
          hasValidReservationTime: hasValidReservationTime,
          hasValidDataAniversario: hasValidDataAniversario
        });
      }

      await client.query('COMMIT');
      console.log('✅ Transação commitada com sucesso');

      // 📧 Enviar emails de confirmação (após commit bem-sucedido)
      try {
        const notificationService = new NotificationService();
        
        // Buscar dados do estabelecimento
        const establishmentResult = await pool.query('SELECT name FROM places WHERE id = $1', [placeId]);
        const establishment_name = establishmentResult.rows[0]?.name || 'Estabelecimento';
        
        // Buscar nome da área se area_id foi fornecido
        let area_name = 'A definir';
        if (areaIdNumber) {
          try {
            const areaResult = await pool.query('SELECT name FROM restaurant_areas WHERE id = $1', [areaIdNumber]);
            if (areaResult.rows.length > 0) {
              area_name = areaResult.rows[0].name;
            }
          } catch (areaError) {
            console.warn('⚠️ Erro ao buscar nome da área:', areaError);
          }
        }

        // Buscar dados dos itens do cardápio (bebidas e comidas)
        // Usar dados completos se disponíveis, senão buscar do banco
        let bebidas = [];
        let comidas = [];
        
        if (bebidas_completas && Array.isArray(bebidas_completas) && bebidas_completas.length > 0) {
          // Usar dados completos enviados pelo frontend
          bebidas = bebidas_completas.map(b => ({
            name: b.name || 'Bebida',
            price: parseFloat(b.price) || 0,
            quantity: parseInt(b.quantity) || 0
          }));
        } else {
          // Fallback: buscar do banco baseado nas quantidades
          for (let i = 1; i <= 10; i++) {
            const quantity = req.body[`item_bar_bebida_${i}`];
            if (quantity && quantity > 0) {
              bebidas.push({
                name: `Bebida ${i}`,
                price: 0,
                quantity: quantity
              });
            }
          }
        }

        if (comidas_completas && Array.isArray(comidas_completas) && comidas_completas.length > 0) {
          // Usar dados completos enviados pelo frontend
          comidas = comidas_completas.map(c => ({
            name: c.name || 'Porção',
            price: parseFloat(c.price) || 0,
            quantity: parseInt(c.quantity) || 0
          }));
        } else {
          // Fallback: buscar do banco baseado nas quantidades
          for (let i = 1; i <= 10; i++) {
            const quantity = req.body[`item_bar_comida_${i}`];
            if (quantity && quantity > 0) {
              comidas.push({
                name: `Porção ${i}`,
                price: 0,
                quantity: quantity
              });
            }
          }
        }

        // Determinar tipo de painel
        let painel_tipo = null;
        if (painel_personalizado) {
          painel_tipo = 'personalizado';
        } else if (painel_estoque_imagem_url) {
          painel_tipo = 'estoque';
        }

        // Preços das decorações (mapeamento)
        const decorationPrices = {
          'Decoração Pequena 1': 200.00,
          'Decoração Pequena 2': 220.00,
          'Decoração Media 3': 250.00,
          'Decoração Media 4': 270.00,
          'Decoração Grande 5': 300.00,
          'Decoração Grande 6': 320.00
        };
        
        // Calcular valor total da reserva
        let valor_total = 0;
        
        // Preço da decoração (usar preço enviado ou buscar do mapeamento)
        if (decoracao_preco) {
          valor_total += parseFloat(decoracao_preco);
        } else if (decoracao_tipo && decorationPrices[decoracao_tipo]) {
          valor_total += decorationPrices[decoracao_tipo];
        }
        
        // Somar preços das bebidas e comidas
        bebidas.forEach(b => {
          valor_total += (parseFloat(b.price) || 0) * (parseInt(b.quantity) || 0);
        });
        
        comidas.forEach(c => {
          valor_total += (parseFloat(c.price) || 0) * (parseInt(c.quantity) || 0);
        });

        // Preparar dados para email do cliente
        const clientEmailData = {
          aniversariante_nome,
          email,
          data_aniversario,
          quantidade_convidados,
          establishment_name,
          area_name,
          reservation_time,
          decoracao_tipo,
          decoracao_preco: decoracao_preco || (decoracao_tipo && decorationPrices[decoracao_tipo] ? decorationPrices[decoracao_tipo] : 0),
          decoracao_imagem: decoracao_imagem || null,
          painel_tipo,
          painel_tema,
          painel_frase,
          painel_estoque_imagem_url,
          bebidas,
          comidas,
          lista_presentes: lista_presentes || [],
          valor_total: valor_total.toFixed(2)
        };

        // Preparar dados para email do admin
        const adminEmailData = {
          ...clientEmailData,
          whatsapp,
          documento
        };

        // Enviar email para o cliente
        if (email) {
          const clientEmailResult = await notificationService.sendBirthdayReservationConfirmationEmail(clientEmailData);
          if (clientEmailResult.success) {
            console.log('✅ Email de confirmação enviado para o cliente');
          } else {
            console.error('❌ Erro ao enviar email para o cliente:', clientEmailResult.error);
          }
        } else {
          console.warn('⚠️ Email do cliente não fornecido, pulando envio');
        }

        // Enviar email para o admin
        const adminEmailResult = await notificationService.sendAdminBirthdayReservationNotification(adminEmailData);
        if (adminEmailResult.success) {
          console.log('✅ Email de notificação enviado para o admin');
        } else {
          console.error('❌ Erro ao enviar email para o admin:', adminEmailResult.error);
        }

      } catch (emailError) {
        // Não falha a criação da reserva se o email falhar
        console.error('❌ Erro ao enviar emails (não crítico):', emailError);
      }

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
          br.id, br.user_id, br.aniversariante_nome,
          TO_CHAR(br.data_aniversario::date, 'YYYY-MM-DD') as data_aniversario,
          br.quantidade_convidados, br.id_casa_evento, br.decoracao_tipo,
          br.decoracao_preco, br.decoracao_imagem,
          br.painel_personalizado, br.painel_estoque_imagem_url, br.painel_tema, br.painel_frase,
          br.item_bar_bebida_1, br.item_bar_bebida_2, br.item_bar_bebida_3, br.item_bar_bebida_4, br.item_bar_bebida_5,
          br.item_bar_bebida_6, br.item_bar_bebida_7, br.item_bar_bebida_8, br.item_bar_bebida_9, br.item_bar_bebida_10,
          br.item_bar_comida_1, br.item_bar_comida_2, br.item_bar_comida_3, br.item_bar_comida_4, br.item_bar_comida_5,
          br.item_bar_comida_6, br.item_bar_comida_7, br.item_bar_comida_8, br.item_bar_comida_9, br.item_bar_comida_10,
          br.bebidas_completas, br.comidas_completas,
          br.lista_presentes, br.documento, br.whatsapp, br.email, br.status,
          br.created_at, br.updated_at,
          p.name as place_name,
          u.name as user_name
        FROM birthday_reservations br
        LEFT JOIN places p ON br.id_casa_evento = p.id
        LEFT JOIN users u ON br.user_id = u.id
      `;
      
      const params = [];
      let paramIndex = 1;

      query += ` WHERE 1=1`;
      
      if (establishment_id) {
        const establishmentIdNumber = typeof establishment_id === 'string' ? parseInt(establishment_id) : establishment_id;
        console.log('🔍 [GET /birthday-reservations] Filtrando reservas por establishment_id:', {
          original: establishment_id,
          converted: establishmentIdNumber,
          type: typeof establishmentIdNumber
        });
        query += ` AND CAST(br.id_casa_evento AS INTEGER) = $${paramIndex++}`;
        params.push(establishmentIdNumber);
      } else {
        console.log('🔍 [GET /birthday-reservations] Buscando todas as reservas (sem filtro de estabelecimento)');
      }

      {
        const scope = establishmentScopeClause(req, 'CAST(br.id_casa_evento AS INTEGER)', paramIndex);
        if (scope.sql) {
          query += scope.sql;
          params.push(...scope.params);
          paramIndex = scope.nextIndex;
        }
      }
      
      query += ` ORDER BY br.created_at DESC`;
      
      console.log('📋 [GET /birthday-reservations] Query SQL:', query);
      console.log('📋 [GET /birthday-reservations] Parâmetros:', params);
      
      // Debug: Verificar todas as reservas antes do filtro
      const allReservationsResult = await pool.query(`
        SELECT br.id, br.id_casa_evento, br.aniversariante_nome, br.created_at,
               pg_typeof(br.id_casa_evento) as id_casa_evento_tipo
        FROM birthday_reservations br
        ORDER BY br.created_at DESC
        LIMIT 10
      `);
      console.log('🔍 [GET /birthday-reservations] Últimas 10 reservas no banco:', allReservationsResult.rows);
      
      // Verificar especificamente se há reservas com id_casa_evento = 7
      if (establishment_id) {
        const establishmentIdNumber = typeof establishment_id === 'string' ? parseInt(establishment_id) : establishment_id;
        
        // Teste 1: Busca direta sem CAST
        const testQuery1 = await pool.query(`
          SELECT id, id_casa_evento, aniversariante_nome 
          FROM birthday_reservations 
          WHERE id_casa_evento = $1
          LIMIT 5
        `, [establishmentIdNumber]);
        console.log(`🔍 [GET /birthday-reservations] Teste 1 (sem CAST, número): Reservas com id_casa_evento = ${establishmentIdNumber}:`, testQuery1.rows.length);
        
        // Teste 2: Busca com CAST
        const testQuery2 = await pool.query(`
          SELECT id, id_casa_evento, aniversariante_nome 
          FROM birthday_reservations 
          WHERE CAST(id_casa_evento AS INTEGER) = $1
          LIMIT 5
        `, [establishmentIdNumber]);
        console.log(`🔍 [GET /birthday-reservations] Teste 2 (com CAST): Reservas com id_casa_evento = ${establishmentIdNumber}:`, testQuery2.rows.length);
        
        // Teste 3: Busca como string
        const testQuery3 = await pool.query(`
          SELECT id, id_casa_evento, aniversariante_nome 
          FROM birthday_reservations 
          WHERE id_casa_evento::text = $1
          LIMIT 5
        `, [String(establishmentIdNumber)]);
        console.log(`🔍 [GET /birthday-reservations] Teste 3 (como string): Reservas com id_casa_evento = ${establishmentIdNumber}:`, testQuery3.rows.length);
        
        // Teste 4: Busca com LIKE (para ver se há algum problema de formatação)
        const testQuery4 = await pool.query(`
          SELECT id, id_casa_evento, aniversariante_nome 
          FROM birthday_reservations 
          WHERE id_casa_evento::text LIKE $1
          LIMIT 5
        `, [`%${establishmentIdNumber}%`]);
        console.log(`🔍 [GET /birthday-reservations] Teste 4 (LIKE): Reservas com id_casa_evento contendo ${establishmentIdNumber}:`, testQuery4.rows.length);
        
        if (testQuery4.rows.length > 0) {
          console.log('⚠️ [GET /birthday-reservations] ATENÇÃO: Encontradas reservas com LIKE:', testQuery4.rows);
        }
      }
      
      const result = await pool.query(query, params);
      
      console.log(`✅ [GET /birthday-reservations] ${result.rows.length} reservas encontradas`);
      if (result.rows.length > 0) {
        console.log('📋 [GET /birthday-reservations] Primeira reserva:', {
          id: result.rows[0].id,
          id_casa_evento: result.rows[0].id_casa_evento,
          id_casa_evento_tipo: typeof result.rows[0].id_casa_evento,
          aniversariante_nome: result.rows[0].aniversariante_nome,
          data_aniversario: result.rows[0].data_aniversario,
          decoracao_preco: result.rows[0].decoracao_preco,
          tem_bebidas_completas: !!result.rows[0].bebidas_completas,
          tem_comidas_completas: !!result.rows[0].comidas_completas
        });
      } else if (establishment_id) {
        console.log('⚠️ [GET /birthday-reservations] Nenhuma reserva encontrada para establishment_id:', establishment_id);
        console.log('⚠️ [GET /birthday-reservations] Verifique se há reservas com id_casa_evento =', establishment_id);
      }

      // Processar os resultados para garantir que JSONB seja convertido corretamente
      const processedRows = result.rows.map(row => {
        // Converter JSONB para objeto JavaScript se necessário
        if (row.bebidas_completas && typeof row.bebidas_completas === 'object') {
          // JSONB já vem como objeto, não precisa fazer nada
        } else if (row.bebidas_completas && typeof row.bebidas_completas === 'string') {
          try {
            row.bebidas_completas = JSON.parse(row.bebidas_completas);
          } catch (e) {
            console.warn('⚠️ Erro ao fazer parse de bebidas_completas:', e);
          }
        }
        
        if (row.comidas_completas && typeof row.comidas_completas === 'object') {
          // JSONB já vem como objeto, não precisa fazer nada
        } else if (row.comidas_completas && typeof row.comidas_completas === 'string') {
          try {
            row.comidas_completas = JSON.parse(row.comidas_completas);
          } catch (e) {
            console.warn('⚠️ Erro ao fazer parse de comidas_completas:', e);
          }
        }
        
        return row;
      });

      res.json(processedRows);

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
          br.id, br.user_id, br.aniversariante_nome,
          TO_CHAR(br.data_aniversario::date, 'YYYY-MM-DD') as data_aniversario,
          br.quantidade_convidados, br.id_casa_evento, br.decoracao_tipo,
          br.decoracao_preco, br.decoracao_imagem,
          br.painel_personalizado, br.painel_estoque_imagem_url, br.painel_tema, br.painel_frase,
          br.item_bar_bebida_1, br.item_bar_bebida_2, br.item_bar_bebida_3, br.item_bar_bebida_4, br.item_bar_bebida_5,
          br.item_bar_bebida_6, br.item_bar_bebida_7, br.item_bar_bebida_8, br.item_bar_bebida_9, br.item_bar_bebida_10,
          br.item_bar_comida_1, br.item_bar_comida_2, br.item_bar_comida_3, br.item_bar_comida_4, br.item_bar_comida_5,
          br.item_bar_comida_6, br.item_bar_comida_7, br.item_bar_comida_8, br.item_bar_comida_9, br.item_bar_comida_10,
          br.bebidas_completas, br.comidas_completas,
          br.lista_presentes, br.documento, br.whatsapp, br.email, br.status,
          br.created_at, br.updated_at,
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