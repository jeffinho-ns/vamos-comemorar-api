// controllers/EventosController.js

/**
 * Controller para gerenciamento de Eventos e Listas
 * VERSÃO 2: Integrado com tabela 'eventos' existente
 * Suporta eventos únicos e semanais
 */

class EventosController {
  constructor(pool) {
    this.pool = pool;
  }

  /**
   * GET /api/v1/eventos/todos
   * Lista TODOS os eventos (sistema antigo) para habilitar uso com listas
   */
  async getTodosEventos(req, res) {
    try {
      const { establishment_id } = req.query;
      
      let query = `
        SELECT 
          id as evento_id,
          nome_do_evento as nome,
          data_do_evento as data_evento,
          hora_do_evento as horario_funcionamento,
          tipo_evento,
          dia_da_semana,
          usado_para_listas,
          casa_do_evento,
          id_place as establishment_id
        FROM eventos
        WHERE 1=1
      `;
      
      const params = [];
      
      let paramIndex = 1;
      if (establishment_id) {
        query += ` AND id_place = $${paramIndex++}`;
        params.push(establishment_id);
      }
      
      query += ` ORDER BY 
        CASE WHEN tipo_evento = 'unico' THEN data_do_evento END DESC,
        CASE WHEN tipo_evento = 'semanal' THEN dia_da_semana END ASC
      `;
      
      const eventosResult = await this.pool.query(query, params);
      
      res.json({
        success: true,
        eventos: eventosResult.rows
      });
    } catch (error) {
      console.error('❌ Erro ao listar todos os eventos:', error);
      res.status(500).json({
        success: false,
        error: 'Erro ao listar eventos',
        details: error.message
      });
    }
  }

  /**
   * PUT /api/v1/eventos/:eventoId/habilitar-listas
   * Habilita um evento existente para usar sistema de listas
   */
  async habilitarParaListas(req, res) {
    try {
      const { eventoId } = req.params;
      const { habilitar } = req.body;
      
      await this.pool.query(`
        UPDATE eventos
        SET usado_para_listas = $1
        WHERE id = $2
      `, [habilitar ? true : false, eventoId]);
      
      const eventoResult = await this.pool.query(`
        SELECT * FROM eventos WHERE id = $1
      `, [eventoId]);
      
      res.json({
        success: true,
        message: `Evento ${habilitar ? 'habilitado' : 'desabilitado'} para sistema de listas`,
        evento: eventoResult.rows[0]
      });
    } catch (error) {
      console.error('❌ Erro ao habilitar evento:', error);
      res.status(500).json({
        success: false,
        error: 'Erro ao habilitar evento',
        details: error.message
      });
    }
  }

  /**
   * GET /api/v1/eventos/dashboard
   * Retorna dados consolidados para o dashboard de eventos
   * Suporta eventos únicos e semanais
   */
  async getDashboard(req, res) {
    try {
      const { establishment_id } = req.query;
      
      console.log('📊 Dashboard request - establishment_id:', establishment_id);
      console.log('📊 Buscando TODOS os eventos (únicos e semanais) para o estabelecimento:', establishment_id || 'TODOS');
      
      // Query para buscar o próximo evento único
      const proximoEventoParams = [];
      let proximoEventoParamIndex = 1;
      const proximoEventoQuery = `
        SELECT 
          e.id as evento_id,
          e.nome_do_evento as nome,
          TO_CHAR(e.data_do_evento, 'YYYY-MM-DD') as data_evento,
          e.hora_do_evento as horario_funcionamento,
          e.descricao,
          e.tipo_evento,
          e.dia_da_semana,
          e.usado_para_listas,
          COALESCE(CAST(p.name AS TEXT), CAST(b.name AS TEXT)) as establishment_name,
          e.id_place
        FROM eventos e
        LEFT JOIN places p ON e.id_place = p.id
        LEFT JOIN bars b ON e.id_place = b.id
        WHERE e.tipo_evento = 'unico' 
        AND e.data_do_evento >= CURRENT_DATE
        ${establishment_id ? `AND e.id_place = $${proximoEventoParamIndex++}` : ''}
        ORDER BY e.data_do_evento ASC
        LIMIT 1
      `;
      if (establishment_id) proximoEventoParams.push(establishment_id);
      const proximoEventoUnicoResult = await this.pool.query(proximoEventoQuery, proximoEventoParams);
      const proximoEventoUnico = proximoEventoUnicoResult.rows;

      // Query para TODOS os eventos únicos futuros (para listar todos)
      const todosEventosParams = [];
      let todosEventosParamIndex = 1;
      const todosEventosQuery = `
        SELECT 
          e.id as evento_id,
          e.nome_do_evento as nome,
          TO_CHAR(e.data_do_evento, 'YYYY-MM-DD') as data_evento,
          e.hora_do_evento as horario_funcionamento,
          e.descricao,
          e.tipo_evento,
          e.usado_para_listas,
          COALESCE(CAST(p.name AS TEXT), CAST(b.name AS TEXT)) as establishment_name,
          e.id_place
        FROM eventos e
        LEFT JOIN places p ON e.id_place = p.id
        LEFT JOIN bars b ON e.id_place = b.id
        WHERE e.tipo_evento = 'unico' 
        AND e.data_do_evento >= CURRENT_DATE
        ${establishment_id ? `AND e.id_place = $${todosEventosParamIndex++}` : ''}
        ORDER BY e.data_do_evento ASC
        LIMIT 10
      `;
      if (establishment_id) todosEventosParams.push(establishment_id);
      const todosEventosUnicosResult = await this.pool.query(todosEventosQuery, todosEventosParams);
      const todosEventosUnicos = todosEventosUnicosResult.rows;

      // Query para eventos semanais ativos (TODOS os eventos semanais)
      const eventosSemanaisParams = [];
      let eventosSemanaisParamIndex = 1;
      const eventosSemanaisQuery = `
        SELECT 
          e.id as evento_id,
          e.nome_do_evento as nome,
          e.hora_do_evento as horario_funcionamento,
          e.dia_da_semana,
          e.tipo_evento,
          COALESCE(CAST(p.name AS TEXT), CAST(b.name AS TEXT)) as establishment_name,
          e.id_place
        FROM eventos e
        LEFT JOIN places p ON e.id_place = p.id
        LEFT JOIN bars b ON e.id_place = b.id
        WHERE e.tipo_evento = 'semanal'
        ${establishment_id ? `AND e.id_place = $${eventosSemanaisParamIndex++}` : ''}
        ORDER BY e.dia_da_semana ASC
      `;
      if (establishment_id) eventosSemanaisParams.push(establishment_id);
      const eventosSemanaisResult = await this.pool.query(eventosSemanaisQuery, eventosSemanaisParams);
      const eventosSemanais = eventosSemanaisResult.rows;

      // Query para total de convidados (eventos únicos futuros + semanais)
      const totalConvidadosParams = [];
      let totalConvidadosParamIndex = 1;
      const totalConvidadosQuery = `
        SELECT COUNT(DISTINCT lc.lista_convidado_id) as total
        FROM listas_convidados lc
        INNER JOIN listas l ON lc.lista_id = l.lista_id
        INNER JOIN eventos e ON l.evento_id = e.id
        WHERE (
          (e.tipo_evento = 'unico' AND e.data_do_evento >= CURRENT_DATE)
          OR e.tipo_evento = 'semanal'
        )
        ${establishment_id ? `AND e.id_place = $${totalConvidadosParamIndex++}` : ''}
      `;
      if (establishment_id) totalConvidadosParams.push(establishment_id);
      const totalConvidadosResult = await this.pool.query(totalConvidadosQuery, totalConvidadosParams);
      const totalConvidados = totalConvidadosResult.rows;

      // Query para total de check-ins
      const totalCheckinsParams = [];
      let totalCheckinsParamIndex = 1;
      const totalCheckinsQuery = `
        SELECT COUNT(DISTINCT lc.lista_convidado_id) as total
        FROM listas_convidados lc
        INNER JOIN listas l ON lc.lista_id = l.lista_id
        INNER JOIN eventos e ON l.evento_id = e.id
        WHERE lc.status_checkin = 'Check-in'
        AND (
          (e.tipo_evento = 'unico' AND e.data_do_evento >= CURRENT_DATE)
          OR e.tipo_evento = 'semanal'
        )
        ${establishment_id ? `AND e.id_place = $${totalCheckinsParamIndex++}` : ''}
      `;
      if (establishment_id) totalCheckinsParams.push(establishment_id);
      const totalCheckinsResult = await this.pool.query(totalCheckinsQuery, totalCheckinsParams);
      const totalCheckins = totalCheckinsResult.rows;

      // Query para total de promoters ativos
      const totalPromotersResult = await this.pool.query(`
        SELECT COUNT(DISTINCT promoter_id) as total
        FROM promoters
        WHERE status::TEXT = 'Ativo'
      `);
      const totalPromoters = totalPromotersResult.rows;

      // Query para estatísticas por tipo de lista
      const estatisticasParams = [];
      let estatisticasParamIndex = 1;
      const estatisticasQuery = `
        SELECT 
          l.tipo,
          COUNT(DISTINCT lc.lista_convidado_id) as total_convidados,
          SUM(CASE WHEN lc.status_checkin = 'Check-in' THEN 1 ELSE 0 END) as total_checkins
        FROM listas l
        INNER JOIN eventos e ON l.evento_id = e.id
        LEFT JOIN listas_convidados lc ON l.lista_id = lc.lista_id
        WHERE (
          (e.tipo_evento = 'unico' AND e.data_do_evento >= CURRENT_DATE)
          OR e.tipo_evento = 'semanal'
        )
        ${establishment_id ? `AND e.id_place = $${estatisticasParamIndex++}` : ''}
        GROUP BY l.tipo
      `;
      if (establishment_id) estatisticasParams.push(establishment_id);
      const estatisticasPorTipoResult = await this.pool.query(estatisticasQuery, estatisticasParams);
      const estatisticasPorTipo = estatisticasPorTipoResult.rows;

      console.log('✅ Dashboard data encontrada:');
      console.log('   - Próximo evento único:', proximoEventoUnico.length > 0 ? proximoEventoUnico[0].nome : 'Nenhum');
      console.log('   - Total de eventos únicos futuros:', todosEventosUnicos.length);
      if (todosEventosUnicos.length > 0) {
        console.log('   - Eventos únicos:', todosEventosUnicos.map(e => `${e.nome} (${e.data_evento})`).join(', '));
      }
      console.log('   - Eventos semanais:', eventosSemanais.length);
      if (eventosSemanais.length > 0) {
        console.log('   - Nomes dos eventos semanais:', eventosSemanais.map(e => e.nome).join(', '));
      }
      console.log('   - Total de convidados:', totalConvidados[0]?.total || 0);

      res.json({
        success: true,
        dashboard: {
          proximoEvento: proximoEventoUnico.length > 0 ? proximoEventoUnico[0] : null,
          todosEventosUnicos: todosEventosUnicos,
          eventosSemanais: eventosSemanais,
          totalConvidados: totalConvidados[0]?.total || 0,
          totalCheckins: totalCheckins[0]?.total || 0,
          totalPromotersAtivos: totalPromoters[0]?.total || 0,
          estatisticasPorTipo: estatisticasPorTipo
        }
      });
    } catch (error) {
      console.error('❌ Erro ao buscar dashboard:', error);
      console.error('Stack trace:', error.stack);
      res.status(500).json({
        success: false,
        error: 'Erro ao buscar dados do dashboard',
        details: error.message
      });
    }
  }

  /**
   * GET /api/v1/eventos
   * Lista todos os eventos (únicos e semanais) com filtros opcionais
   */
  async getEventos(req, res) {
    try {
      const { establishment_id, status, tipo_evento, data_inicio, data_fim, data_evento, limit } = req.query;
      
      let query = `
        SELECT 
          e.id as evento_id,
          e.nome_do_evento as nome,
          TO_CHAR(e.data_do_evento, 'YYYY-MM-DD') as data_evento,
          e.hora_do_evento as horario_funcionamento,
          e.descricao,
          e.tipo_evento,
          e.dia_da_semana,
          e.usado_para_listas,
          e.casa_do_evento,
          e.id_place as establishment_id,
          p.nome as promoter_criador_nome,
          COALESCE(CAST(pl.name AS TEXT), CAST(b.name AS TEXT)) as establishment_name,
          COUNT(DISTINCT l.lista_id) as total_listas,
          COUNT(DISTINCT lc.lista_convidado_id) as total_convidados,
          SUM(CASE WHEN lc.status_checkin = 'Check-in' THEN 1 ELSE 0 END) as total_checkins
        FROM eventos e
        LEFT JOIN promoters p ON e.promoter_criador_id = p.promoter_id
        LEFT JOIN places pl ON e.id_place = pl.id
        LEFT JOIN bars b ON e.id_place = b.id
        LEFT JOIN listas l ON e.id = l.evento_id
        LEFT JOIN listas_convidados lc ON l.lista_id = lc.lista_id
        WHERE 1=1
      `;
      
      const params = [];
      let paramIndex = 1;
      
      if (establishment_id) {
        query += ` AND e.id_place = $${paramIndex++}`;
        params.push(establishment_id);
      }
      
      if (tipo_evento) {
        query += ` AND e.tipo_evento = $${paramIndex++}`;
        params.push(tipo_evento);
      }
      
      // Novo: filtro por data específica (útil para vincular reservas)
      // Só aplica filtro de data se não for evento semanal (verifica o tipo do evento na linha, não o parâmetro)
      if (data_evento) {
        query += ` AND (e.tipo_evento = 'semanal' OR e.data_do_evento = $${paramIndex++})`;
        params.push(data_evento);
      }
      
      if (data_inicio) {
        query += ` AND (e.tipo_evento = 'semanal' OR e.data_do_evento >= $${paramIndex++})`;
        params.push(data_inicio);
      }
      
      if (data_fim) {
        query += ` AND (e.tipo_evento = 'semanal' OR e.data_do_evento <= $${paramIndex++})`;
        params.push(data_fim);
      }
      
      query += ` GROUP BY e.id, e.nome_do_evento, e.data_do_evento, e.hora_do_evento, e.descricao, e.tipo_evento, e.dia_da_semana, e.usado_para_listas, e.casa_do_evento, e.id_place, p.nome, pl.name, b.name`;
      
      // Ordenação: eventos únicos por data, semanais por dia da semana
      query += ` ORDER BY 
        CASE WHEN e.tipo_evento = 'unico' THEN e.data_do_evento END DESC,
        CASE WHEN e.tipo_evento = 'semanal' THEN e.dia_da_semana END ASC
      `;
      
      if (limit) {
        query += ` LIMIT $${paramIndex++}`;
        params.push(parseInt(limit));
      }
      
      const eventosResult = await this.pool.query(query, params);
      const eventos = eventosResult.rows;
      
      res.json({
        success: true,
        eventos
      });
    } catch (error) {
      console.error('❌ Erro ao listar eventos:', error);
      res.status(500).json({
        success: false,
        error: 'Erro ao listar eventos'
      });
    }
  }

  /**
   * GET /api/v1/eventos/:eventoId
   * Busca um evento específico com detalhes
   */
  async getEvento(req, res) {
    try {
      const { eventoId } = req.params;
      
      const eventosResult = await this.pool.query(`
        SELECT 
          e.id as evento_id,
          e.nome_do_evento as nome,
          TO_CHAR(e.data_do_evento, 'YYYY-MM-DD') as data_evento,
          e.hora_do_evento as horario_funcionamento,
          e.descricao,
          e.tipo_evento,
          e.dia_da_semana,
          e.usado_para_listas,
          e.casa_do_evento,
          e.local_do_evento,
          e.categoria,
          e.id_place as establishment_id,
          p.nome as promoter_criador_nome,
          p.email as promoter_criador_email,
          COALESCE(CAST(pl.name AS TEXT), CAST(b.name AS TEXT)) as establishment_name
        FROM eventos e
        LEFT JOIN promoters p ON e.promoter_criador_id = p.promoter_id
        LEFT JOIN places pl ON e.id_place = pl.id
        LEFT JOIN bars b ON e.id_place = b.id
        WHERE e.id = $1
      `, [eventoId]);
      
      if (eventosResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Evento não encontrado'
        });
      }
      
      res.json({
        success: true,
        evento: eventosResult.rows[0]
      });
    } catch (error) {
      console.error('❌ Erro ao buscar evento:', error);
      res.status(500).json({
        success: false,
        error: 'Erro ao buscar evento'
      });
    }
  }

  /**
   * POST /api/v1/eventos
   * Cria um novo evento (único ou semanal)
   */
  async createEvento(req, res) {
    try {
      const {
        nome,
        data_evento,
        hora_evento,
        tipo_evento,
        dia_da_semana,
        descricao,
        casa_evento,
        local_evento,
        promoter_criador_id,
        establishment_id,
        categoria
      } = req.body;
      
      // Validações
      if (!nome || !hora_evento || !tipo_evento) {
        return res.status(400).json({
          success: false,
          error: 'Nome, hora e tipo de evento são obrigatórios'
        });
      }

      // Validação específica por tipo
      if (tipo_evento === 'unico' && !data_evento) {
        return res.status(400).json({
          success: false,
          error: 'Data é obrigatória para eventos únicos'
        });
      }

      if (tipo_evento === 'semanal' && !dia_da_semana) {
        return res.status(400).json({
          success: false,
          error: 'Dia da semana é obrigatório para eventos semanais (0=Dom, 1=Seg, ...)'
        });
      }
      
      const result = await this.pool.query(`
        INSERT INTO eventos (
          nome_do_evento, data_do_evento, hora_do_evento, tipo_evento,
          dia_da_semana, descricao, casa_do_evento, local_do_evento,
          promoter_criador_id, id_place, categoria, usado_para_listas
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, TRUE) RETURNING id
      `, [
        nome, 
        tipo_evento === 'unico' ? data_evento : null,
        hora_evento, 
        tipo_evento,
        tipo_evento === 'semanal' ? dia_da_semana : null,
        descricao, 
        casa_evento,
        local_evento,
        promoter_criador_id, 
        establishment_id,
        categoria
      ]);
      
      const novoEventoResult = await this.pool.query(`
        SELECT * FROM eventos WHERE id = $1
      `, [result.rows[0].id]);
      const novoEvento = novoEventoResult.rows;
      
      res.status(201).json({
        success: true,
        message: 'Evento criado com sucesso',
        evento: novoEvento[0]
      });
    } catch (error) {
      console.error('❌ Erro ao criar evento:', error);
      res.status(500).json({
        success: false,
        error: 'Erro ao criar evento'
      });
    }
  }

  /**
   * PUT /api/v1/eventos/:eventoId
   * Atualiza um evento existente
   */
  async updateEvento(req, res) {
    try {
      const { eventoId } = req.params;
      const {
        nome,
        data_evento,
        hora_evento,
        tipo_evento,
        dia_da_semana,
        descricao,
        usado_para_listas
      } = req.body;
      
      await this.pool.query(`
        UPDATE eventos
        SET nome_do_evento = $1, data_do_evento = $2, hora_do_evento = $3,
            tipo_evento = $4, dia_da_semana = $5, descricao = $6,
            usado_para_listas = $7
        WHERE id = $8
      `, [
        nome, 
        tipo_evento === 'unico' ? data_evento : null,
        hora_evento,
        tipo_evento,
        tipo_evento === 'semanal' ? dia_da_semana : null,
        descricao,
        usado_para_listas,
        eventoId
      ]);
      
      const eventoAtualizadoResult = await this.pool.query(`
        SELECT * FROM eventos WHERE id = $1
      `, [eventoId]);
      const eventoAtualizado = eventoAtualizadoResult.rows;
      
      res.json({
        success: true,
        message: 'Evento atualizado com sucesso',
        evento: eventoAtualizado[0]
      });
    } catch (error) {
      console.error('❌ Erro ao atualizar evento:', error);
      res.status(500).json({
        success: false,
        error: 'Erro ao atualizar evento'
      });
    }
  }

  /**
   * GET /api/v1/eventos/:eventoId/listas
   * Retorna todas as listas de um evento e seus convidados
   */
  async getListasEvento(req, res) {
    try {
      const { eventoId } = req.params;
      
      console.log('🔍 [getListasEvento] Buscando listas para evento_id:', eventoId);
      
      // Primeiro, verificar se o evento existe
      const eventoResult = await this.pool.query(`
        SELECT 
          e.id,
          e.nome_do_evento,
          e.usado_para_listas,
          e.tipo_evento,
          e.data_do_evento,
          COALESCE(CAST(p.name AS TEXT), CAST(b.name AS TEXT)) as establishment_name
        FROM eventos e
        LEFT JOIN places p ON e.id_place = p.id
        LEFT JOIN bars b ON e.id_place = b.id
        WHERE e.id = $1
      `, [eventoId]);
      
      if (eventoResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Evento não encontrado'
        });
      }
      
      console.log('📋 [getListasEvento] Evento encontrado:', eventoResult.rows[0]);
      
      // Buscar listas do evento
      const listasResult = await this.pool.query(`
        SELECT 
          l.*,
          p.nome as promoter_nome,
          p.email as promoter_email,
          p.telefone as promoter_telefone,
          COUNT(DISTINCT lc.lista_convidado_id) as total_convidados,
          SUM(CASE WHEN lc.status_checkin = 'Check-in' THEN 1 ELSE 0 END) as total_checkins,
          SUM(CASE WHEN lc.status_checkin = 'Pendente' THEN 1 ELSE 0 END) as total_pendentes,
          SUM(CASE WHEN lc.status_checkin = 'No-Show' THEN 1 ELSE 0 END) as total_noshow
        FROM listas l
        LEFT JOIN promoters p ON l.promoter_responsavel_id = p.promoter_id
        LEFT JOIN listas_convidados lc ON l.lista_id = lc.lista_id
        WHERE l.evento_id = $1
        GROUP BY l.lista_id, l.evento_id, l.promoter_responsavel_id, l.nome, l.tipo, l.observacoes, l.criado_em, p.nome, p.email, p.telefone
        ORDER BY l.tipo, l.nome
      `, [eventoId]);
      const listas = listasResult.rows;
      
      console.log(`✅ [getListasEvento] Encontradas ${listas.length} listas`);
      
      if (listas.length > 0) {
        console.log('📋 [getListasEvento] Listas encontradas:', listas.map(l => ({
          lista_id: l.lista_id,
          nome: l.nome,
          tipo: l.tipo,
          promoter: l.promoter_nome,
          total_convidados: l.total_convidados
        })));
      }
      
      // Buscar convidados de cada lista
      for (let lista of listas) {
        console.log(`🔍 [getListasEvento] Buscando convidados para lista_id: ${lista.lista_id} (${lista.nome})`);
        
        const convidadosResult = await this.pool.query(`
          SELECT 
            lc.*,
            STRING_AGG(b.nome, ', ') as beneficios
          FROM listas_convidados lc
          LEFT JOIN lista_convidado_beneficio lcb ON lc.lista_convidado_id = lcb.lista_convidado_id
          LEFT JOIN beneficios b ON lcb.beneficio_id = b.beneficio_id
          WHERE lc.lista_id = $1
          GROUP BY lc.lista_convidado_id
          ORDER BY lc.nome_convidado
        `, [lista.lista_id]);
        const convidados = convidadosResult.rows;
        
        console.log(`✅ [getListasEvento] Lista ${lista.lista_id}: ${convidados.length} convidados`);
        
        lista.convidados = convidados;
      }
      
      console.log('🎉 [getListasEvento] Retornando dados completos');
      
      res.json({
        success: true,
        evento: eventoResult.rows[0],
        listas
      });
    } catch (error) {
      console.error('❌ [getListasEvento] Erro ao buscar listas do evento:', error);
      console.error('Stack:', error.stack);
      res.status(500).json({
        success: false,
        error: 'Erro ao buscar listas do evento',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  /**
   * POST /api/v1/listas/:listaId/convidado
   * Adiciona um convidado a uma lista
   */
  async addConvidado(req, res) {
    try {
      const { listaId } = req.params;
      const {
        nome_convidado,
        telefone_convidado,
        email_convidado,
        is_vip,
        observacoes,
        beneficios
      } = req.body;
      
      if (!nome_convidado) {
        return res.status(400).json({
          success: false,
          error: 'Nome do convidado é obrigatório'
        });
      }
      
      const listaResult = await this.pool.query(`
        SELECT lista_id FROM listas WHERE lista_id = $1
      `, [listaId]);
      
      if (listaResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Lista não encontrada'
        });
      }
      
      const result = await this.pool.query(`
        INSERT INTO listas_convidados (
          lista_id, nome_convidado, telefone_convidado, email_convidado,
          is_vip, observacoes, status_checkin
        ) VALUES ($1, $2, $3, $4, $5, $6, 'Pendente') RETURNING lista_convidado_id
      `, [listaId, nome_convidado, telefone_convidado, email_convidado, is_vip || false, observacoes]);
      
      const convidadoId = result.rows[0].lista_convidado_id;
      
      if (beneficios && Array.isArray(beneficios) && beneficios.length > 0) {
        // PostgreSQL requires individual INSERT statements or using unnest
        for (const beneficioId of beneficios) {
          await this.pool.query(`
            INSERT INTO lista_convidado_beneficio 
            (lista_convidado_id, beneficio_id, utilizado, data_utilizacao)
            VALUES ($1, $2, $3, $4)
          `, [convidadoId, beneficioId, false, null]);
        }
      }
      
      const novoConvidadoResult = await this.pool.query(`
        SELECT 
          lc.*,
          STRING_AGG(b.nome, ', ') as beneficios
        FROM listas_convidados lc
        LEFT JOIN lista_convidado_beneficio lcb ON lc.lista_convidado_id = lcb.lista_convidado_id
        LEFT JOIN beneficios b ON lcb.beneficio_id = b.beneficio_id
        WHERE lc.lista_convidado_id = $1
        GROUP BY lc.lista_convidado_id
      `, [convidadoId]);
      
      res.status(201).json({
        success: true,
        message: 'Convidado adicionado com sucesso',
        convidado: novoConvidadoResult.rows[0]
      });
    } catch (error) {
      console.error('❌ Erro ao adicionar convidado:', error);
      res.status(500).json({
        success: false,
        error: 'Erro ao adicionar convidado'
      });
    }
  }

  /**
   * PUT /api/v1/checkin/:listaConvidadoId
   * Atualiza o status de check-in de um convidado
   */
  async updateCheckin(req, res) {
    try {
      const { listaConvidadoId } = req.params;
      const { status_checkin, entrada_tipo, entrada_valor } = req.body;
      
      if (!['Pendente', 'Check-in', 'No-Show'].includes(status_checkin)) {
        return res.status(400).json({
          success: false,
          error: 'Status de check-in inválido'
        });
      }
      
      const dataCheckin = status_checkin === 'Check-in' ? new Date() : null;
      
      // Atualizar com campos de entrada
      await this.pool.query(`
        UPDATE listas_convidados
        SET status_checkin = $1, 
            data_checkin = $2,
            entrada_tipo = $3,
            entrada_valor = $4
        WHERE lista_convidado_id = $5
      `, [status_checkin, dataCheckin, entrada_tipo || null, entrada_valor || null, listaConvidadoId]);
      
      const convidadoResult = await this.pool.query(`
        SELECT 
          lc.*,
          l.nome as lista_nome,
          l.tipo as lista_tipo,
          p.nome as promoter_nome,
          p.promoter_id,
          STRING_AGG(b.nome, ', ') as beneficios
        FROM listas_convidados lc
        INNER JOIN listas l ON lc.lista_id = l.lista_id
        LEFT JOIN promoters p ON l.promoter_responsavel_id = p.promoter_id
        LEFT JOIN lista_convidado_beneficio lcb ON lc.lista_convidado_id = lcb.lista_convidado_id
        LEFT JOIN beneficios b ON lcb.beneficio_id = b.beneficio_id
        WHERE lc.lista_convidado_id = $1
        GROUP BY lc.lista_convidado_id, l.nome, l.tipo, p.nome, p.promoter_id
      `, [listaConvidadoId]);
      
      const convidado = convidadoResult.rows[0];
      console.log(`✅ Check-in atualizado: ${convidado?.nome_convidado || 'N/A'} - Tipo: ${entrada_tipo || 'N/A'} - Valor: R$ ${entrada_valor || 0}`);
      
      res.json({
        success: true,
        message: `Check-in atualizado para: ${status_checkin}`,
        convidado: convidado
      });
    } catch (error) {
      console.error('❌ Erro ao atualizar check-in:', error);
      res.status(500).json({
        success: false,
        error: 'Erro ao atualizar check-in'
      });
    }
  }

  /**
   * GET /api/v1/promoters
   * Lista promoters com estatísticas
   */
  async getPromoters(req, res) {
    try {
      const { status, limit } = req.query;
      
      let query = `
        SELECT 
          p.*,
          COUNT(DISTINCT l.lista_id) as total_listas,
          COUNT(DISTINCT lc.lista_convidado_id) as total_convidados,
          SUM(CASE WHEN lc.status_checkin = 'Check-in' THEN 1 ELSE 0 END) as total_checkins
        FROM promoters p
        LEFT JOIN listas l ON p.promoter_id = l.promoter_responsavel_id
        LEFT JOIN listas_convidados lc ON l.lista_id = lc.lista_id
        WHERE 1=1
      `;
      
      const params = [];
      let paramIndex = 1;
      
      if (status) {
        query += ` AND p.status::TEXT = $${paramIndex++}`;
        params.push(status);
      }
      
      query += ` GROUP BY p.promoter_id`;
      query += ` ORDER BY total_checkins DESC, p.nome ASC`;
      
      if (limit) {
        query += ` LIMIT $${paramIndex++}`;
        params.push(parseInt(limit));
      }
      
      const promotersResult = await this.pool.query(query, params);
      
      res.json({
        success: true,
        promoters: promotersResult.rows
      });
    } catch (error) {
      console.error('❌ Erro ao listar promoters:', error);
      res.status(500).json({
        success: false,
        error: 'Erro ao listar promoters'
      });
    }
  }

  /**
   * GET /api/v1/hostess
   * Lista hostess
   */
  async getHostess(req, res) {
    try {
      const { status, establishment_id, limit } = req.query;
      
      let query = `
        SELECT 
          h.*,
          COALESCE(pl.name, b.name) as establishment_name
        FROM hostess h
        LEFT JOIN places pl ON h.establishment_id = pl.id
        LEFT JOIN bars b ON h.establishment_id = b.id
        WHERE 1=1
      `;
      
      const params = [];
      let paramIndex = 1;
      
      if (status) {
        query += ` AND h.status = $${paramIndex++}`;
        params.push(status);
      }
      
      if (establishment_id) {
        query += ` AND h.establishment_id = $${paramIndex++}`;
        params.push(establishment_id);
      }
      
      query += ` ORDER BY h.nome ASC`;
      
      if (limit) {
        query += ` LIMIT $${paramIndex++}`;
        params.push(parseInt(limit));
      }
      
      const hostessResult = await this.pool.query(query, params);
      
      res.json({
        success: true,
        hostess: hostessResult.rows
      });
    } catch (error) {
      console.error('❌ Erro ao listar hostess:', error);
      res.status(500).json({
        success: false,
        error: 'Erro ao listar hostess'
      });
    }
  }

  /**
   * GET /api/v1/beneficios
   * Lista benefícios
   */
  async getBeneficios(req, res) {
    try {
      const { ativo } = req.query;
      
      let query = `SELECT * FROM beneficios WHERE 1=1`;
      const params = [];
      let paramIndex = 1;
      
      if (ativo !== undefined) {
        query += ` AND ativo = $${paramIndex++}`;
        params.push(ativo === 'true' ? true : false);
      }
      
      query += ` ORDER BY tipo, nome`;
      
      const beneficiosResult = await this.pool.query(query, params);
      
      res.json({
        success: true,
        beneficios: beneficiosResult.rows
      });
    } catch (error) {
      console.error('❌ Erro ao listar benefícios:', error);
      res.status(500).json({
        success: false,
        error: 'Erro ao listar benefícios'
      });
    }
  }

  /**
   * POST /api/v1/listas
   * Cria uma nova lista
   */
  async createLista(req, res) {
    try {
      const {
        evento_id,
        promoter_responsavel_id,
        nome,
        tipo,
        observacoes
      } = req.body;
      
      if (!evento_id || !nome || !tipo) {
        return res.status(400).json({
          success: false,
          error: 'Evento, nome e tipo são obrigatórios'
        });
      }
      
      const result = await this.pool.query(`
        INSERT INTO listas (
          evento_id, promoter_responsavel_id, nome, tipo, observacoes
        ) VALUES ($1, $2, $3, $4, $5) RETURNING lista_id
      `, [evento_id, promoter_responsavel_id, nome, tipo, observacoes]);
      
      const novaListaResult = await this.pool.query(`
        SELECT 
          l.*,
          p.nome as promoter_nome
        FROM listas l
        LEFT JOIN promoters p ON l.promoter_responsavel_id = p.promoter_id
        WHERE l.lista_id = $1
      `, [result.rows[0].lista_id]);
      
      res.status(201).json({
        success: true,
        message: 'Lista criada com sucesso',
        lista: novaListaResult.rows[0]
      });
    } catch (error) {
      console.error('❌ Erro ao criar lista:', error);
      res.status(500).json({
        success: false,
        error: 'Erro ao criar lista'
      });
    }
  }

  /**
   * GET /api/v1/listas/:listaId/detalhes
   * Retorna detalhes completos de uma lista
   */
  async getDetalhesLista(req, res) {
    try {
      const { listaId } = req.params;
      
      const listaResult = await this.pool.query(`
        SELECT 
          l.*,
          e.nome_do_evento as evento_nome,
          TO_CHAR(e.data_do_evento, 'YYYY-MM-DD') as data_evento,
          e.hora_do_evento as horario_funcionamento,
          e.tipo_evento,
          e.dia_da_semana,
          p.nome as promoter_nome,
          p.email as promoter_email,
          p.telefone as promoter_telefone,
          COUNT(DISTINCT lc.lista_convidado_id) as total_convidados,
          SUM(CASE WHEN lc.status_checkin = 'Check-in' THEN 1 ELSE 0 END) as total_checkins,
          SUM(CASE WHEN lc.status_checkin = 'Pendente' THEN 1 ELSE 0 END) as total_pendentes
        FROM listas l
        INNER JOIN eventos e ON l.evento_id = e.id
        LEFT JOIN promoters p ON l.promoter_responsavel_id = p.promoter_id
        LEFT JOIN listas_convidados lc ON l.lista_id = lc.lista_id
        WHERE l.lista_id = $1
        GROUP BY l.lista_id, l.evento_id, l.promoter_responsavel_id, l.nome, l.tipo, l.observacoes, l.criado_em, e.nome_do_evento, e.data_do_evento, e.hora_do_evento, e.tipo_evento, e.dia_da_semana, p.nome, p.email, p.telefone
      `, [listaId]);
      
      if (listaResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Lista não encontrada'
        });
      }
      
      const convidadosResult = await this.pool.query(`
        SELECT 
          lc.*,
          STRING_AGG(DISTINCT b.nome, ', ') as beneficios,
          STRING_AGG(DISTINCT CAST(b.beneficio_id AS TEXT), ', ') as beneficio_ids
        FROM listas_convidados lc
        LEFT JOIN lista_convidado_beneficio lcb ON lc.lista_convidado_id = lcb.lista_convidado_id
        LEFT JOIN beneficios b ON lcb.beneficio_id = b.beneficio_id
        WHERE lc.lista_id = $1
        GROUP BY lc.lista_convidado_id
        ORDER BY lc.status_checkin DESC, lc.nome_convidado ASC
      `, [listaId]);
      
      res.json({
        success: true,
        lista: listaResult.rows[0],
        convidados: convidadosResult.rows
      });
    } catch (error) {
      console.error('❌ Erro ao buscar detalhes da lista:', error);
      res.status(500).json({
        success: false,
        error: 'Erro ao buscar detalhes da lista'
      });
    }
  }
  /**
   * GET /api/v1/eventos/:eventoId/checkins
   * Retorna todas as listas de check-ins consolidadas para um evento específico
   * Inclui: reservas de mesas, convidados de listas, promoters e convidados VIP
   */
  async getCheckinsConsolidados(req, res) {
    try {
      const { eventoId } = req.params;
      
      console.log('🔍 Buscando check-ins consolidados para evento:', eventoId);
      
      // 1. Buscar informações do evento
      const eventoResult = await this.pool.query(`
        SELECT 
          e.id as evento_id,
          e.nome_do_evento as nome,
          TO_CHAR(e.data_do_evento, 'YYYY-MM-DD') as data_evento,
          e.hora_do_evento as horario,
          e.tipo_evento,
          e.id_place as establishment_id,
          COALESCE(CAST(pl.name AS TEXT), CAST(b.name AS TEXT)) as establishment_name
        FROM eventos e
        LEFT JOIN places pl ON e.id_place = pl.id
        LEFT JOIN bars b ON e.id_place = b.id
        WHERE e.id = $1
      `, [eventoId]);
      
      if (eventoResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Evento não encontrado'
        });
      }
      
      const eventoInfo = eventoResult.rows[0];
      console.log('📋 Evento Info:', {
        evento_id: eventoInfo.evento_id,
        nome: eventoInfo.nome,
        data_evento: eventoInfo.data_evento,
        establishment_id: eventoInfo.establishment_id,
        establishment_name: eventoInfo.establishment_name
      });
      
      // Vincular automaticamente reservas de restaurante não vinculadas a este evento
      // quando têm o mesmo establishment_id e data_evento
      if (eventoInfo.establishment_id && eventoInfo.data_evento) {
        try {
          console.log('🔗 Vinculando reservas automaticamente ao evento:', eventoId);
          const updateResult = await this.pool.query(`
            UPDATE restaurant_reservations 
            SET evento_id = $1 
            WHERE establishment_id = $2 
            AND reservation_date::DATE = $3::DATE
            AND evento_id IS NULL
          `, [eventoId, eventoInfo.establishment_id, eventoInfo.data_evento]);
          console.log(`✅ ${updateResult.rowCount} reservas vinculadas automaticamente`);
        } catch (err) {
          console.error('⚠️ Erro ao vincular reservas automaticamente:', err);
          // Continua mesmo se falhar (coluna pode não existir ainda)
        }
      }
      
      // 2. Buscar reservas de mesa vinculadas ao evento (via convidados)
      const reservasMesaResult = await this.pool.query(`
        SELECT DISTINCT
          r.id as id,
          'reserva_mesa' as tipo,
          r.nome_lista as origem,
          u.name as responsavel,
          r.data_reserva,
          r.quantidade_convidados,
          COUNT(c.id) as total_convidados,
          SUM(CASE WHEN c.status = 'CHECK-IN' THEN 1 ELSE 0 END) as convidados_checkin
        FROM reservas r
        LEFT JOIN users u ON r.user_id = u.id
        LEFT JOIN convidados c ON r.id = c.reserva_id
        WHERE r.evento_id = $1
        GROUP BY r.id
        ORDER BY r.data_reserva DESC
      `, [eventoId]);
      
      // 3. Buscar convidados de reservas
      const convidadosReservasResult = await this.pool.query(`
        SELECT 
          c.id,
          'convidado_reserva' as tipo,
          c.nome,
          c.email,
          c.documento,
          c.status,
          c.data_checkin,
          c.entrada_tipo,
          c.entrada_valor,
          r.nome_lista as origem,
          u.name as responsavel
        FROM convidados c
        INNER JOIN reservas r ON c.reserva_id = r.id
        LEFT JOIN users u ON r.user_id = u.id
        WHERE r.evento_id = $1
        ORDER BY c.nome ASC
      `, [eventoId]);
      
      // 4. Buscar listas e convidados de promoters
      const listasPromotersResult = await this.pool.query(`
        SELECT 
          lc.lista_convidado_id as id,
          'convidado_promoter' as tipo,
          lc.nome_convidado as nome,
          lc.telefone_convidado as telefone,
          lc.status_checkin,
          lc.data_checkin,
          lc.is_vip,
          lc.observacoes,
          lc.entrada_tipo,
          lc.entrada_valor,
          l.nome as origem,
          l.tipo as tipo_lista,
          p.nome as responsavel,
          p.promoter_id
        FROM listas_convidados lc
        INNER JOIN listas l ON lc.lista_id = l.lista_id
        LEFT JOIN promoters p ON l.promoter_responsavel_id = p.promoter_id
        WHERE l.evento_id = $1
        ORDER BY lc.nome_convidado ASC
      `, [eventoId]);
      
      // 5. Buscar promoters vinculados ao evento
      const promotersResult = await this.pool.query(`
        SELECT DISTINCT
          p.promoter_id as id,
          'promoter' as tipo,
          p.nome,
          p.email,
          p.telefone,
          p.tipo_categoria,
          COUNT(DISTINCT l.lista_id) as total_listas,
          COUNT(DISTINCT lc.lista_convidado_id) as total_convidados,
          SUM(CASE WHEN lc.status_checkin = 'Check-in' THEN 1 ELSE 0 END) as convidados_checkin
        FROM promoters p
        LEFT JOIN listas l ON p.promoter_id = l.promoter_responsavel_id AND l.evento_id = $1
        LEFT JOIN listas_convidados lc ON l.lista_id = lc.lista_id
        WHERE EXISTS (
          SELECT 1 FROM listas WHERE promoter_responsavel_id = p.promoter_id AND evento_id = $1
        )
        GROUP BY p.promoter_id
        ORDER BY p.nome ASC
      `, [eventoId]);
      
      // 6. Buscar reservas grandes (camarotes) do estabelecimento na mesma data
      // Só busca se tiver establishment_id e data_evento (não é evento semanal)
      let camarotes = [];
      if (eventoInfo.establishment_id && eventoInfo.data_evento) {
        try {
          const camarotesResult = await this.pool.query(`
            SELECT 
              lr.id,
              'camarote' as tipo,
              lr.client_name as responsavel,
              lr.event_type as origem,
              lr.reservation_date,
              lr.reservation_time,
              lr.number_of_people,
              lr.checked_in,
              lr.checkin_time,
              COUNT(g.id) as total_convidados,
              SUM(CASE WHEN g.checked_in = TRUE THEN 1 ELSE 0 END) as convidados_checkin
            FROM large_reservations lr
            LEFT JOIN guest_lists gl ON lr.id = gl.reservation_id AND gl.reservation_type = 'large'
            LEFT JOIN guests g ON gl.id = g.guest_list_id
            WHERE lr.establishment_id = $1
            AND lr.reservation_date::DATE = $2::DATE
            GROUP BY lr.id
            ORDER BY lr.reservation_time ASC
          `, [eventoInfo.establishment_id, eventoInfo.data_evento]);
          camarotes = camarotesResult.rows;
        } catch (err) {
          console.error('Erro ao buscar camarotes:', err);
          camarotes = [];
        }
      }

      // 7. Buscar guest_lists de reservas de restaurante (estilo Sistema de Reservas)
      // Só busca se tiver establishment_id e data_evento (não é evento semanal)
      let reservasRestaurante = [];
      let guestListsRestaurante = [];
      if (eventoInfo.establishment_id && eventoInfo.data_evento) {
        try {
          // Buscar guest_lists completas (estrutura igual ao Sistema de Reservas)
          // Tenta filtrar por evento_id se a coluna existir, caso contrário usa filtro tradicional
          let guestListsResult;
          try {
            const result = await this.pool.query(`
              SELECT 
                gl.id as guest_list_id,
                gl.reservation_type,
                gl.event_type,
                gl.shareable_link_token,
                gl.expires_at,
                gl.owner_checked_in,
                gl.owner_checkin_time,
                CASE WHEN gl.expires_at >= NOW() THEN 1 ELSE 0 END AS is_valid,
                rr.client_name as owner_name,
                rr.id as reservation_id,
                rr.reservation_date,
                rr.reservation_time,
                rr.number_of_people,
                rr.origin,
                rr.table_number,
                rr.checked_in as reservation_checked_in,
                rr.checkin_time as reservation_checkin_time,
                COALESCE(CAST(u.name AS TEXT), 'Sistema') as created_by_name,
                ra.name as area_name,
                COUNT(DISTINCT g.id) as total_guests,
                SUM(CASE WHEN g.checked_in = TRUE THEN 1 ELSE 0 END) as guests_checked_in
              FROM guest_lists gl
              INNER JOIN restaurant_reservations rr ON gl.reservation_id = rr.id AND gl.reservation_type = 'restaurant'
              LEFT JOIN users u ON rr.created_by = u.id
              LEFT JOIN restaurant_areas ra ON rr.area_id = ra.id
              LEFT JOIN guests g ON gl.id = g.guest_list_id
              WHERE rr.establishment_id = $1
              AND rr.reservation_date::DATE = $2::DATE
              AND (rr.evento_id = $3 OR rr.evento_id IS NULL)
              GROUP BY gl.id, gl.reservation_type, gl.event_type, gl.shareable_link_token, gl.expires_at, gl.owner_checked_in, gl.owner_checkin_time, rr.client_name, rr.id, rr.reservation_date, rr.reservation_time, rr.number_of_people, rr.origin, rr.table_number, rr.checked_in, rr.checkin_time, u.name, ra.name
              ORDER BY rr.reservation_time ASC
            `, [eventoInfo.establishment_id, eventoInfo.data_evento, eventoId]);
            guestListsResult = result.rows;
          } catch (err) {
            // Fallback: se a coluna evento_id não existir, usa a query sem esse filtro
            console.log('⚠️ Coluna evento_id não encontrada, usando filtro tradicional');
            const result = await this.pool.query(`
              SELECT 
                gl.id as guest_list_id,
                gl.reservation_type,
                gl.event_type,
                gl.shareable_link_token,
                gl.expires_at,
                gl.owner_checked_in,
                gl.owner_checkin_time,
                CASE WHEN gl.expires_at >= NOW() THEN 1 ELSE 0 END AS is_valid,
                rr.client_name as owner_name,
                rr.id as reservation_id,
                rr.reservation_date,
                rr.reservation_time,
                rr.number_of_people,
                rr.origin,
                rr.table_number,
                rr.checked_in as reservation_checked_in,
                rr.checkin_time as reservation_checkin_time,
                COALESCE(CAST(u.name AS TEXT), 'Sistema') as created_by_name,
                ra.name as area_name,
                COUNT(DISTINCT g.id) as total_guests,
                SUM(CASE WHEN g.checked_in = TRUE THEN 1 ELSE 0 END) as guests_checked_in
              FROM guest_lists gl
              INNER JOIN restaurant_reservations rr ON gl.reservation_id = rr.id AND gl.reservation_type = 'restaurant'
              LEFT JOIN users u ON rr.created_by = u.id
              LEFT JOIN restaurant_areas ra ON rr.area_id = ra.id
              LEFT JOIN guests g ON gl.id = g.guest_list_id
              WHERE rr.establishment_id = $1
              AND rr.reservation_date::DATE = $2::DATE
              GROUP BY gl.id, gl.reservation_type, gl.event_type, gl.shareable_link_token, gl.expires_at, gl.owner_checked_in, gl.owner_checkin_time, rr.client_name, rr.id, rr.reservation_date, rr.reservation_time, rr.number_of_people, rr.origin, rr.table_number, rr.checked_in, rr.checkin_time, u.name, ra.name
              ORDER BY rr.reservation_time ASC
            `, [eventoInfo.establishment_id, eventoInfo.data_evento]);
            guestListsResult = result.rows;
          }
          
          guestListsRestaurante = guestListsResult;
          console.log(`✅ Guest lists de reservas restaurante encontradas: ${guestListsRestaurante.length}`);
          
          // Para compatibilidade: também retornar no formato antigo
          reservasRestaurante = guestListsResult.map(gl => ({
            id: gl.reservation_id,
            tipo: 'reserva_restaurante',
            responsavel: gl.owner_name,
            origem: gl.origin,
            reservation_date: gl.reservation_date,
            reservation_time: gl.reservation_time,
            number_of_people: gl.number_of_people,
            table_number: gl.table_number,
            area_name: gl.area_name,
            checked_in: gl.reservation_checked_in,
            checkin_time: gl.reservation_checkin_time,
            total_convidados: gl.total_guests || 0,
            convidados_checkin: gl.guests_checked_in || 0,
            guest_list_id: gl.guest_list_id
          }));
        } catch (err) {
          console.error('❌ Erro ao buscar guest_lists de reservas restaurante:', err);
          reservasRestaurante = [];
          guestListsRestaurante = [];
        }
      }

      // 8. Buscar convidados das reservas de restaurante
      // Só busca se tiver establishment_id e data_evento (não é evento semanal)
      let convidadosReservasRestaurante = [];
      if (eventoInfo.establishment_id && eventoInfo.data_evento) {
        try {
          console.log('🔍 Buscando convidados de reservas restaurante:', {
            establishment_id: eventoInfo.establishment_id,
            data_evento: eventoInfo.data_evento
          });
          
          const convidadosReservasRestauranteResult = await this.pool.query(`
            SELECT 
              g.id,
              'convidado_reserva_restaurante' as tipo,
              g.name as nome,
              g.whatsapp as telefone,
              NULL as data_nascimento,
              g.checked_in as status_checkin,
              g.checkin_time as data_checkin,
              rr.client_name as responsavel,
              rr.origin as origem,
              rr.id as reserva_id
            FROM guests g
            INNER JOIN guest_lists gl ON g.guest_list_id = gl.id
            INNER JOIN restaurant_reservations rr ON gl.reservation_id = rr.id AND gl.reservation_type = 'restaurant'
            WHERE rr.establishment_id = $1
            AND rr.reservation_date::DATE = $2::DATE
            ORDER BY g.name ASC
          `, [eventoInfo.establishment_id, eventoInfo.data_evento]);
          
          convidadosReservasRestaurante = convidadosReservasRestauranteResult.rows;
          console.log(`✅ Convidados de reservas restaurante encontrados: ${convidadosReservasRestaurante.length}`);
          
          if (convidadosReservasRestaurante.length > 0) {
            console.log('📋 Primeiros convidados:', convidadosReservasRestaurante.slice(0, 3));
          } else {
            // Debug: verificar se há reservas no establishment/date
            const reservasDebugResult = await this.pool.query(`
              SELECT COUNT(*) as total FROM restaurant_reservations 
              WHERE establishment_id = $1 AND reservation_date::DATE = $2::DATE
            `, [eventoInfo.establishment_id, eventoInfo.data_evento]);
            console.log('🔍 Reservas no establishment/date:', reservasDebugResult.rows[0]?.total || 0);
            
            // Debug: verificar se há guest_lists para essas reservas
            const guestListsDebugResult = await this.pool.query(`
              SELECT COUNT(*) as total FROM guest_lists gl
              INNER JOIN restaurant_reservations rr ON gl.reservation_id = rr.id AND gl.reservation_type = 'restaurant'
              WHERE rr.establishment_id = $1 AND rr.reservation_date::DATE = $2::DATE
            `, [eventoInfo.establishment_id, eventoInfo.data_evento]);
            console.log('🔍 Guest lists encontradas:', guestListsDebugResult.rows[0]?.total || 0);
          }
        } catch (err) {
          console.error('❌ Erro ao buscar convidados de reservas restaurante:', err);
          convidadosReservasRestaurante = [];
        }
      } else {
        console.log('⚠️ Evento não possui establishment_id ou data_evento, pulando busca de convidados de reservas restaurante');
      }
      
      // 9. Calcular estatísticas gerais
      const reservasMesa = reservasMesaResult.rows;
      const convidadosReservas = convidadosReservasResult.rows;
      const listasPromoters = listasPromotersResult.rows;
      const promoters = promotersResult.rows;
      
      const totalReservasMesa = reservasMesa.length;
      const totalConvidadosReservas = convidadosReservas.length;
      const checkinConvidadosReservas = convidadosReservas.filter(c => c.status === 'CHECK-IN').length;
      
      const totalPromoters = promoters.length;
      const totalConvidadosPromoters = listasPromoters.length;
      const checkinConvidadosPromoters = listasPromoters.filter(c => c.status_checkin === 'Check-in').length;
      
      const totalCamarotes = camarotes.length;
      const checkinCamarotes = camarotes.filter(c => c.checked_in === true || c.checked_in === 1).length;
      
      const totalReservasRestaurante = reservasRestaurante.length;
      const totalConvidadosReservasRestaurante = convidadosReservasRestaurante.length;
      const checkinConvidadosReservasRestaurante = convidadosReservasRestaurante.filter(c => c.status_checkin === true || c.status_checkin === 1).length;
      
      console.log('✅ Check-ins consolidados encontrados:');
      console.log(`   - Reservas de mesa: ${totalReservasMesa}`);
      console.log(`   - Convidados de reservas: ${totalConvidadosReservas} (${checkinConvidadosReservas} check-ins)`);
      console.log(`   - Reservas de restaurante: ${totalReservasRestaurante}`);
      console.log(`   - Convidados de reservas restaurante: ${totalConvidadosReservasRestaurante} (${checkinConvidadosReservasRestaurante} check-ins)`);
      console.log(`   - Promoters: ${totalPromoters}`);
      console.log(`   - Convidados de promoters: ${totalConvidadosPromoters} (${checkinConvidadosPromoters} check-ins)`);
      console.log(`   - Camarotes: ${totalCamarotes} (${checkinCamarotes} check-ins)`);
      
      console.log('📊 Resumo final dos dados:', {
        reservasMesa: reservasMesa.length,
        convidadosReservas: convidadosReservas.length,
        reservasRestaurante: reservasRestaurante.length,
        convidadosReservasRestaurante: convidadosReservasRestaurante.length,
        promoters: promoters.length,
        convidadosPromoters: listasPromoters.length,
        camarotes: camarotes.length
      });

      res.json({
        success: true,
        evento: eventoInfo,
        dados: {
          reservasMesa: reservasMesa,
          convidadosReservas: convidadosReservas,
          reservasRestaurante: reservasRestaurante,
          convidadosReservasRestaurante: convidadosReservasRestaurante,
          guestListsRestaurante: guestListsRestaurante,
          promoters: promoters,
          convidadosPromoters: listasPromoters,
          camarotes: camarotes
        },
        estatisticas: {
          totalReservasMesa,
          totalConvidadosReservas,
          checkinConvidadosReservas,
          totalReservasRestaurante,
          totalConvidadosReservasRestaurante,
          checkinConvidadosReservasRestaurante,
          totalPromoters,
          totalConvidadosPromoters,
          checkinConvidadosPromoters,
          totalCamarotes,
          checkinCamarotes,
          totalGeral: totalConvidadosReservas + totalConvidadosReservasRestaurante + totalConvidadosPromoters + camarotes.reduce((sum, c) => sum + c.total_convidados, 0),
          checkinGeral: checkinConvidadosReservas + checkinConvidadosReservasRestaurante + checkinConvidadosPromoters + camarotes.reduce((sum, c) => sum + c.convidados_checkin, 0)
        }
      });
    } catch (error) {
      console.error('❌ Erro ao buscar check-ins consolidados:', error);
      res.status(500).json({
        success: false,
        error: 'Erro ao buscar check-ins consolidados',
        details: error.message
      });
    }
  }

}

module.exports = EventosController;
