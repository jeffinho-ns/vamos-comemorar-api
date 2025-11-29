// routes/promoterPublic.js

const express = require('express');
const router = express.Router();

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
         FROM meu_backup_db.promoters p
         LEFT JOIN meu_backup_db.places pl ON p.establishment_id = pl.id
         WHERE p.codigo_identificador = $1 AND p.ativo = TRUE AND LOWER(p.status) = 'ativo'
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
         FROM meu_backup_db.promoter_convidados c
         WHERE c.promoter_id = $1`,
        [promoter.promoter_id]
      );
      console.log('✅ Estatísticas obtidas:', statsResult.rows[0]);

      // Buscar user_id se existir (pode não existir na tabela)
      let userId = null;
      try {
        const userResult = await pool.query(
          'SELECT id FROM meu_backup_db.users WHERE email = $1 LIMIT 1',
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
         FROM meu_backup_db.promoters 
         WHERE codigo_identificador = $1 AND ativo = TRUE AND LOWER(status) = 'ativo'
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
          `SELECT id FROM meu_backup_db.promoter_convidados 
           WHERE promoter_id = $1 AND whatsapp = $2 AND evento_id = $3
           LIMIT 1`,
          [promoter.promoter_id, whatsapp.trim(), evento_id]
        );
      } else {
        existingGuestsResult = await pool.query(
          `SELECT id FROM meu_backup_db.promoter_convidados 
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
        `INSERT INTO meu_backup_db.promoter_convidados (
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
            `SELECT lista_id FROM meu_backup_db.listas 
             WHERE promoter_responsavel_id = $1 AND evento_id = $2
             LIMIT 1`,
            [promoter.promoter_id, evento_id]
          );

          if (listasResult.rows.length > 0) {
            const lista_id = listasResult.rows[0].lista_id;

            // Verificar se já existe na lista (evitar duplicatas)
            const existeNaListaResult = await pool.query(
              `SELECT lista_convidado_id FROM meu_backup_db.listas_convidados 
               WHERE lista_id = $1 AND nome_convidado = $2 AND telefone_convidado = $3`,
              [lista_id, nome.trim(), whatsapp.trim()]
            );

            if (existeNaListaResult.rows.length === 0) {
              // Inserir na tabela listas_convidados
              await pool.query(
                `INSERT INTO meu_backup_db.listas_convidados (
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
      console.log('🔍 [EVENTOS] Buscando eventos para promoter:', codigo);

      // Buscar promoter com establishment_id - usar schema explícito
      let promotersResult;
      try {
        promotersResult = await pool.query(
          `SELECT promoter_id, establishment_id 
           FROM meu_backup_db.promoters 
           WHERE codigo_identificador = $1 AND ativo = TRUE
           LIMIT 1`,
          [codigo]
        );
        console.log('📊 [EVENTOS] Query de promoter executada com sucesso');
      } catch (promoterQueryError) {
        console.error('❌ [EVENTOS] Erro na query de promoter:', promoterQueryError);
        throw promoterQueryError;
      }

      console.log('📊 [EVENTOS] Promoters encontrados:', promotersResult.rows.length);

      if (promotersResult.rows.length === 0) {
        console.log('❌ [EVENTOS] Promoter não encontrado:', codigo);
        return res.status(404).json({ 
          success: false, 
          error: 'Promoter não encontrado' 
        });
      }

      const promoter = promotersResult.rows[0];
      console.log('✅ [EVENTOS] Promoter encontrado:', {
        promoter_id: promoter.promoter_id,
        establishment_id: promoter.establishment_id,
        establishment_id_type: typeof promoter.establishment_id
      });

      // Buscar eventos diretamente do banco de dados
      console.log('📊 [EVENTOS] Buscando eventos do banco de dados...');
      const BASE_IMAGE_URL = 'https://grupoideiaum.com.br/cardapio-agilizaiapp/';
      
      // Buscar eventos únicos diretamente do banco
      let eventsResult;
      try {
        eventsResult = await pool.query(
          `SELECT
            id, casa_do_evento, nome_do_evento, 
            TO_CHAR(data_do_evento, 'YYYY-MM-DD') as data_do_evento, 
            hora_do_evento,
            local_do_evento, tipo_evento, id_place,
            imagem_do_evento
          FROM meu_backup_db.eventos
          WHERE tipo_evento = 'unico'
          ORDER BY 
            CASE WHEN data_do_evento IS NULL THEN 1 ELSE 0 END,
            data_do_evento ASC NULLS LAST,
            hora_do_evento ASC NULLS LAST`,
          []
        );
        console.log('📊 [EVENTOS] Query de eventos executada com sucesso');
      } catch (eventsQueryError) {
        console.error('❌ [EVENTOS] Erro na query de eventos:', eventsQueryError);
        throw eventsQueryError;
      }
      
      // Adicionar URLs completas das imagens
      const allEvents = eventsResult.rows.map(event => ({
        ...event,
        tipoEvento: event.tipo_evento,
        nome_do_evento: event.nome_do_evento,
        imagem_do_evento_url: event.imagem_do_evento 
          ? `${BASE_IMAGE_URL}${event.imagem_do_evento}`
          : null
      }));
      
      console.log('📊 [EVENTOS] Total de eventos obtidos do banco:', allEvents.length);

      // Buscar eventos associados ao promoter via promoter_eventos
      let promoterEventsResult;
      try {
        // No PostgreSQL, ENUMs podem precisar de cast explícito
        promoterEventsResult = await pool.query(
          `SELECT DISTINCT evento_id 
           FROM meu_backup_db.promoter_eventos 
           WHERE promoter_id = $1 AND status::TEXT = 'ativo'`,
          [promoter.promoter_id]
        );
        console.log('📊 [EVENTOS] Query de promoter_eventos executada com sucesso');
      } catch (promoterEventsQueryError) {
        console.error('❌ [EVENTOS] Erro na query de promoter_eventos:', promoterEventsQueryError.message);
        // Tentar sem o cast se falhar
        try {
          promoterEventsResult = await pool.query(
            `SELECT DISTINCT evento_id 
             FROM meu_backup_db.promoter_eventos 
             WHERE promoter_id = $1 AND status = 'ativo'`,
            [promoter.promoter_id]
          );
          console.log('📊 [EVENTOS] Query de promoter_eventos executada com sucesso (sem cast)');
        } catch (secondError) {
          console.error('❌ [EVENTOS] Erro na segunda tentativa:', secondError.message);
          // Não falhar se a tabela não existir ou houver erro, apenas logar
          promoterEventsResult = { rows: [] };
        }
      }
      
      const promoterEventIds = new Set(promoterEventsResult.rows.map(row => row.evento_id));
      console.log('📊 [EVENTOS] Eventos associados ao promoter:', promoterEventIds.size);

      // Filtrar eventos
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Converter establishment_id para número se necessário
      const establishmentId = promoter.establishment_id ? 
        (typeof promoter.establishment_id === 'string' ? parseInt(promoter.establishment_id, 10) : promoter.establishment_id) 
        : null;
      
      console.log('📊 [EVENTOS] Filtrando eventos com establishment_id:', establishmentId);

      const filteredEvents = allEvents
        .filter(event => {
          // Eventos associados ao promoter
          if (promoterEventIds.has(event.id)) {
            console.log('✅ [EVENTOS] Evento', event.id, 'associado ao promoter');
            return true;
          }
          
          // OU eventos únicos do estabelecimento do promoter que não têm data ou têm data futura
          if (establishmentId) {
            // Converter id_place para número se necessário
            const eventPlaceId = event.id_place ? 
              (typeof event.id_place === 'string' ? parseInt(event.id_place, 10) : event.id_place) 
              : null;
            
            const matchesEstablishment = eventPlaceId === establishmentId || 
                                        (event.casa_do_evento && 
                                         event.casa_do_evento.toLowerCase().includes('high'));
            
            if (matchesEstablishment && event.tipoEvento === 'unico') {
              if (!event.data_do_evento) {
                console.log('✅ [EVENTOS] Evento', event.id, 'sem data, incluindo');
                return true;
              }
              const eventDate = new Date(event.data_do_evento);
              eventDate.setHours(0, 0, 0, 0);
              const isFuture = eventDate >= today;
              if (isFuture) {
                console.log('✅ [EVENTOS] Evento', event.id, 'com data futura, incluindo');
              }
              return isFuture;
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
          local_endereco: null,
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

      console.log('✅ [EVENTOS] Eventos filtrados:', filteredEvents.length);
      console.log('📊 [EVENTOS] Detalhes dos eventos filtrados:', filteredEvents.map(e => ({ id: e.id, nome: e.nome, data: e.data })));

      res.json({
        success: true,
        eventos: filteredEvents
      });

    } catch (error) {
      console.error('❌ [EVENTOS] Erro ao buscar eventos do promoter:', error);
      console.error('❌ [EVENTOS] Stack:', error.stack);
      if (error.code) {
        console.error('❌ [EVENTOS] Error Code:', error.code);
      }
      if (error.detail) {
        console.error('❌ [EVENTOS] Error Detail:', error.detail);
      }
      if (error.hint) {
        console.error('❌ [EVENTOS] Error Hint:', error.hint);
      }
      if (error.message) {
        console.error('❌ [EVENTOS] Error Message:', error.message);
      }
      res.status(500).json({ 
        success: false, 
        error: 'Erro interno do servidor',
        message: error.message,
        details: process.env.NODE_ENV === 'development' ? {
          message: error.message,
          code: error.code,
          detail: error.detail,
          hint: error.hint,
          stack: error.stack
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
        `SELECT promoter_id FROM meu_backup_db.promoters 
         WHERE codigo_identificador = $1 AND ativo = TRUE AND LOWER(status) = 'ativo'
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
        FROM meu_backup_db.promoter_convidados c
        LEFT JOIN meu_backup_db.eventos e ON c.evento_id = e.id
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

