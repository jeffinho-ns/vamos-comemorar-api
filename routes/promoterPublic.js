// routes/promoterPublic.js

const express = require('express');
const router = express.Router();
const fetch = require('node-fetch');

module.exports = (pool) => {
  /**
   * @route   GET /api/promoter/test
   * @desc    Endpoint de teste
   * @access  Public
   */
  router.get('/test', (req, res) => {
    res.json({ 
      success: true, 
      message: 'Rota de promoter pública funcionando!',
      timestamp: new Date().toISOString()
    });
  });

  /**
   * @route   GET /api/promoter/:codigo
   * @desc    Retorna dados públicos do promoter por código
   * @access  Public
   */
  router.get('/:codigo', async (req, res) => {
    try {
      const { codigo } = req.params;
      console.log('🔍 Buscando promoter público com código:', codigo);

      // Buscar promoter
      const promotersResult = await pool.query(
        `SELECT 
          p.promoter_id,
          p.nome,
          p.apelido,
          p.email,
          p.foto_url,
          p.instagram,
          p.observacoes,
          p.status,
          pl.name as establishment_name
         FROM promoters p
         LEFT JOIN places pl ON p.establishment_id = pl.id
         WHERE p.codigo_identificador = $1 AND p.ativo = TRUE AND p.status::TEXT = 'Ativo'
         LIMIT 1`,
        [codigo]
      );

      console.log('📊 Promoters encontrados:', promotersResult.rows.length);

      if (promotersResult.rows.length === 0) {
        console.log('❌ Promoter não encontrado com código:', codigo);
        return res.status(404).json({ 
          success: false, 
          error: 'Promoter não encontrado' 
        });
      }

      const promoter = promotersResult.rows[0];
      console.log('✅ Promoter encontrado:', { id: promoter.promoter_id, nome: promoter.nome });

      // Buscar estatísticas do promoter
      console.log('📊 Buscando estatísticas...');
      const statsResult = await pool.query(
        `SELECT 
          COUNT(DISTINCT c.id) as total_convidados,
          COUNT(DISTINCT CASE WHEN c.status = 'confirmado' THEN c.id END) as total_confirmados
         FROM promoter_convidados c
         WHERE c.promoter_id = $1`,
        [promoter.promoter_id]
      );
      console.log('✅ Estatísticas obtidas:', statsResult.rows[0]);

      // Buscar user_id se existir (pode não existir na tabela)
      let userId = null;
      try {
        const userResult = await pool.query(
          'SELECT id FROM users WHERE email = $1 LIMIT 1',
          [promoter.email]
        );
        if (userResult.rows.length > 0) {
          userId = userResult.rows[0].id;
        }
      } catch (userError) {
        console.log('⚠️ Não foi possível buscar user_id:', userError.message);
      }

      res.json({
        success: true,
        promoter: {
          id: promoter.promoter_id,
          nome: promoter.nome,
          apelido: promoter.apelido,
          email: promoter.email,
          foto_url: promoter.foto_url,
          instagram: promoter.instagram,
          observacoes: promoter.observacoes,
          establishment_name: promoter.establishment_name,
          user_id: userId,
          stats: statsResult.rows[0] || { total_convidados: 0, total_confirmados: 0 }
        }
      });

    } catch (error) {
      console.error('❌ Erro ao buscar promoter público:', error);
      console.error('❌ Stack:', error.stack);
      console.error('❌ SQL Message:', error.sqlMessage);
      res.status(500).json({ 
        success: false, 
        error: 'Erro interno do servidor',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  });

  /**
   * @route   POST /api/promoter/:codigo/convidado
   * @desc    Adiciona um convidado à lista do promoter
   * @access  Public
   */
  router.post('/:codigo/convidado', async (req, res) => {
    try {
      const { codigo } = req.params;
      const { nome, whatsapp, evento_id } = req.body;

      if (!nome || !nome.trim()) {
        return res.status(400).json({ 
          success: false, 
          error: 'Nome é obrigatório' 
        });
      }

      if (!whatsapp || !whatsapp.trim()) {
        return res.status(400).json({ 
          success: false, 
          error: 'WhatsApp é obrigatório' 
        });
      }

      // Verificar se promoter existe e está ativo
      const promotersResult = await pool.query(
        `SELECT promoter_id, nome 
         FROM promoters 
         WHERE codigo_identificador = $1 AND ativo = TRUE AND status::TEXT = 'Ativo'
         LIMIT 1`,
        [codigo]
      );

      if (promotersResult.rows.length === 0) {
        return res.status(404).json({ 
          success: false, 
          error: 'Promoter não encontrado' 
        });
      }

      const promoter = promotersResult.rows[0];

      // Verificar se já existe um convidado com o mesmo WhatsApp para este promoter
      let existingGuestsResult;
      if (evento_id) {
        existingGuestsResult = await pool.query(
          `SELECT id FROM promoter_convidados 
           WHERE promoter_id = $1 AND whatsapp = $2 AND evento_id = $3
           LIMIT 1`,
          [promoter.promoter_id, whatsapp.trim(), evento_id]
        );
      } else {
        existingGuestsResult = await pool.query(
          `SELECT id FROM promoter_convidados 
           WHERE promoter_id = $1 AND whatsapp = $2 AND evento_id IS NULL
           LIMIT 1`,
          [promoter.promoter_id, whatsapp.trim()]
        );
      }

      if (existingGuestsResult.rows.length > 0) {
        return res.status(400).json({ 
          success: false, 
          error: 'Você já está nesta lista!' 
        });
      }

      // Adicionar o convidado na tabela promoter_convidados
      const result = await pool.query(
        `INSERT INTO promoter_convidados (
          promoter_id, 
          nome, 
          whatsapp,
          evento_id,
          status
        ) VALUES ($1, $2, $3, $4, 'pendente') RETURNING id`,
        [promoter.promoter_id, nome.trim(), whatsapp.trim(), evento_id || null]
      );

      // NOVO: Também adicionar na tabela listas_convidados se houver uma lista para este promoter/evento
      try {
        if (evento_id) {
          // Buscar lista do promoter para este evento
          const listasResult = await pool.query(
            `SELECT lista_id FROM listas 
             WHERE promoter_responsavel_id = $1 AND evento_id = $2
             LIMIT 1`,
            [promoter.promoter_id, evento_id]
          );

          if (listasResult.rows.length > 0) {
            const lista_id = listasResult.rows[0].lista_id;

            // Verificar se já existe na lista (evitar duplicatas)
            const existeNaListaResult = await pool.query(
              `SELECT lista_convidado_id FROM listas_convidados 
               WHERE lista_id = $1 AND nome_convidado = $2 AND telefone_convidado = $3`,
              [lista_id, nome.trim(), whatsapp.trim()]
            );

            if (existeNaListaResult.rows.length === 0) {
              // Inserir na tabela listas_convidados
              await pool.query(
                `INSERT INTO listas_convidados (
                  lista_id,
                  nome_convidado,
                  telefone_convidado,
                  status_checkin,
                  is_vip
                ) VALUES ($1, $2, $3, 'Pendente', FALSE)`,
                [lista_id, nome.trim(), whatsapp.trim()]
              );

              console.log(`✅ Convidado também adicionado à lista ${lista_id}`);
            }
          }
        }
      } catch (listaError) {
        // Log do erro mas não falha a operação principal
        console.error('⚠️ Erro ao adicionar convidado à lista:', listaError);
      }

      res.status(201).json({ 
        success: true, 
        message: 'Você foi adicionado à lista com sucesso!',
        convidado: { 
          id: result.rows[0].id, 
          nome: nome.trim(), 
          whatsapp: whatsapp.trim(),
          promoter_nome: promoter.nome
        }
      });

    } catch (error) {
      console.error('❌ Erro ao adicionar convidado à lista do promoter:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Erro interno do servidor' 
      });
    }
  });

  /**
   * @route   GET /api/promoter/:codigo/eventos
   * @desc    Retorna eventos disponíveis do promoter
   * @access  Public
   */
  router.get('/:codigo/eventos', async (req, res) => {
    try {
      const { codigo } = req.params;
      console.log('🔍 Buscando eventos para promoter:', codigo);

      // Buscar promoter com establishment_id - simplificado para evitar problemas com tipos de dados
      // Usar schema explícito se necessário
      const promotersResult = await pool.query(
        `SELECT promoter_id, establishment_id 
         FROM meu_backup_db.promoters 
         WHERE codigo_identificador = $1 AND ativo = TRUE
         LIMIT 1`,
        [codigo]
      );

      console.log('📊 Promoters encontrados para eventos:', promotersResult.rows.length);

      if (promotersResult.rows.length === 0) {
        console.log('❌ Promoter não encontrado para eventos:', codigo);
        return res.status(404).json({ 
          success: false, 
          error: 'Promoter não encontrado' 
        });
      }

      const promoter = promotersResult.rows[0];
      console.log('✅ Promoter encontrado para eventos:', promoter.promoter_id, 'establishment_id:', promoter.establishment_id);

      // Buscar eventos usando a API /api/events
      console.log('📊 Buscando eventos via API...');
      const BASE_IMAGE_URL = 'https://grupoideiaum.com.br/cardapio-agilizaiapp/';
      const API_BASE_URL = process.env.API_BASE_URL || 'https://vamos-comemorar-api.onrender.com';
      
      try {
        // Buscar todos os eventos da API /api/events
        let allEvents = [];
        try {
          const eventsResponse = await fetch(`${API_BASE_URL}/api/events?tipo=unico`, {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json'
            }
          });

          if (eventsResponse.ok) {
            allEvents = await eventsResponse.json();
            console.log('✅ Eventos obtidos da API:', allEvents.length);
          } else {
            const errorText = await eventsResponse.text();
            console.error('❌ Erro ao buscar eventos da API:', eventsResponse.status, errorText);
            throw new Error(`API retornou status ${eventsResponse.status}`);
          }
        } catch (fetchError) {
          console.error('❌ Erro ao buscar da API:', fetchError.message);
          throw fetchError;
        }
        console.log('📊 Total de eventos retornados pela API:', allEvents.length);

        // Buscar eventos associados ao promoter via promoter_eventos
        const promoterEventsResult = await pool.query(
          `SELECT DISTINCT evento_id 
           FROM meu_backup_db.promoter_eventos 
           WHERE promoter_id = $1 AND LOWER(status) = 'ativo'`,
          [promoter.promoter_id]
        );
        const promoterEventIds = new Set(promoterEventsResult.rows.map(row => row.evento_id));

        // Filtrar eventos
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const filteredEvents = allEvents
          .filter(event => {
            // Eventos associados ao promoter
            if (promoterEventIds.has(event.id)) {
              return true;
            }
            
            // OU eventos únicos do estabelecimento do promoter que não têm data ou têm data futura
            if (promoter.establishment_id) {
              const matchesEstablishment = event.id_place === promoter.establishment_id || 
                                          (event.casa_do_evento && 
                                           event.casa_do_evento.toLowerCase().includes('high'));
              
              if (matchesEstablishment && event.tipoEvento === 'unico') {
                if (!event.data_do_evento) {
                  return true;
                }
                const eventDate = new Date(event.data_do_evento);
                eventDate.setHours(0, 0, 0, 0);
                return eventDate >= today;
              }
            }
            
            return false;
          })
          .map(event => ({
            id: event.id,
            nome: event.nome_do_evento,
            data: event.data_do_evento || null,
            hora: event.hora_do_evento || null,
            local_nome: event.local_do_evento || null,
            local_endereco: null, // A API não retorna endereço diretamente
            imagem_url: event.imagem_do_evento_url || (event.imagem_do_evento ? `${BASE_IMAGE_URL}${event.imagem_do_evento}` : null)
          }))
          .sort((a, b) => {
            // Ordenar: eventos sem data primeiro, depois por data
            if (!a.data && !b.data) return 0;
            if (!a.data) return 1;
            if (!b.data) return -1;
            return new Date(a.data) - new Date(b.data);
          })
          .slice(0, 20);

        console.log('✅ Eventos filtrados:', filteredEvents.length);

        res.json({
          success: true,
          eventos: filteredEvents
        });

    } catch (error) {
      console.error('❌ Erro ao buscar eventos do promoter:', error);
      console.error('❌ Stack:', error.stack);
      if (error.code) {
        console.error('❌ Error Code:', error.code);
      }
      if (error.detail) {
        console.error('❌ Error Detail:', error.detail);
      }
      if (error.hint) {
        console.error('❌ Error Hint:', error.hint);
      }
      res.status(500).json({ 
        success: false, 
        error: 'Erro interno do servidor',
        message: error.message,
        details: process.env.NODE_ENV === 'development' ? {
          message: error.message,
          code: error.code,
          detail: error.detail,
          hint: error.hint
        } : undefined
      });
    }
  });

  /**
   * @route   GET /api/promoter/:codigo/convidados
   * @desc    Retorna lista de convidados do promoter (pública)
   * @access  Public
   */
  router.get('/:codigo/convidados', async (req, res) => {
    try {
      const { codigo } = req.params;
      const { evento_id } = req.query;
      console.log('🔍 Buscando convidados para promoter:', codigo);

      // Buscar promoter
      const promotersResult = await pool.query(
        `SELECT promoter_id FROM promoters 
         WHERE codigo_identificador = $1 AND ativo = TRUE AND status::TEXT = 'Ativo'
         LIMIT 1`,
        [codigo]
      );

      console.log('📊 Promoters encontrados para convidados:', promotersResult.rows.length);

      if (promotersResult.rows.length === 0) {
        console.log('❌ Promoter não encontrado para convidados:', codigo);
        return res.status(404).json({ 
          success: false, 
          error: 'Promoter não encontrado' 
        });
      }

      const promoter = promotersResult.rows[0];
      console.log('✅ Promoter encontrado para convidados:', promoter.promoter_id);

      // Buscar convidados
      let query = `
        SELECT 
          c.id,
          c.nome,
          c.status,
          c.created_at,
          e.nome_do_evento as evento_nome,
          e.data_do_evento as evento_data
        FROM promoter_convidados c
        LEFT JOIN eventos e ON c.evento_id = e.id
        WHERE c.promoter_id = $1
      `;

      const params = [promoter.promoter_id];

      if (evento_id) {
        query += ` AND c.evento_id = $2`;
        params.push(evento_id);
      }

      query += ` ORDER BY c.created_at DESC`;

      console.log('📊 Executando query de convidados...');
      const convidadosResult = await pool.query(query, params);
      console.log('✅ Convidados encontrados:', convidadosResult.rows.length);

      // Ocultar informações sensíveis (WhatsApp) na listagem pública
      const convidadosPublicos = convidadosResult.rows.map(c => ({
        id: c.id,
        nome: c.nome,
        status: c.status,
        evento_nome: c.evento_nome,
        evento_data: c.evento_data
      }));

      res.json({
        success: true,
        convidados: convidadosPublicos
      });

    } catch (error) {
      console.error('❌ Erro ao buscar convidados do promoter:', error);
      console.error('❌ Stack:', error.stack);
      console.error('❌ SQL Message:', error.sqlMessage);
      res.status(500).json({ 
        success: false, 
        error: 'Erro interno do servidor',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  });

  return router;
};

