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
      
      if (establishment_id) {
        query += ` AND id_place = ?`;
        params.push(establishment_id);
      }
      
      query += ` ORDER BY 
        CASE WHEN tipo_evento = 'unico' THEN data_do_evento END DESC,
        CASE WHEN tipo_evento = 'semanal' THEN dia_da_semana END ASC
      `;
      
      const [eventos] = await this.pool.execute(query, params);
      
      res.json({
        success: true,
        eventos
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
      
      await this.pool.execute(`
        UPDATE eventos
        SET usado_para_listas = ?
        WHERE id = ?
      `, [habilitar ? 1 : 0, eventoId]);
      
      const [evento] = await this.pool.execute(`
        SELECT * FROM eventos WHERE id = ?
      `, [eventoId]);
      
      res.json({
        success: true,
        message: `Evento ${habilitar ? 'habilitado' : 'desabilitado'} para sistema de listas`,
        evento: evento[0]
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
      const [proximoEventoUnico] = await this.pool.execute(`
        SELECT 
          e.id as evento_id,
          e.nome_do_evento as nome,
          DATE_FORMAT(e.data_do_evento, '%Y-%m-%d') as data_evento,
          e.hora_do_evento as horario_funcionamento,
          e.descricao,
          e.tipo_evento,
          e.dia_da_semana,
          e.usado_para_listas,
          COALESCE(p.name, b.name) as establishment_name,
          e.id_place
        FROM eventos e
        LEFT JOIN places p ON e.id_place = p.id
        LEFT JOIN bars b ON e.id_place = b.id
        WHERE e.tipo_evento = 'unico' 
        AND e.data_do_evento >= CURDATE()
        ${establishment_id ? 'AND e.id_place = ?' : ''}
        ORDER BY e.data_do_evento ASC
        LIMIT 1
      `, establishment_id ? [establishment_id] : []);

      // Query para TODOS os eventos únicos futuros (para listar todos)
      const [todosEventosUnicos] = await this.pool.execute(`
        SELECT 
          e.id as evento_id,
          e.nome_do_evento as nome,
          DATE_FORMAT(e.data_do_evento, '%Y-%m-%d') as data_evento,
          e.hora_do_evento as horario_funcionamento,
          e.descricao,
          e.tipo_evento,
          e.usado_para_listas,
          COALESCE(p.name, b.name) as establishment_name,
          e.id_place
        FROM eventos e
        LEFT JOIN places p ON e.id_place = p.id
        LEFT JOIN bars b ON e.id_place = b.id
        WHERE e.tipo_evento = 'unico' 
        AND e.data_do_evento >= CURDATE()
        ${establishment_id ? 'AND e.id_place = ?' : ''}
        ORDER BY e.data_do_evento ASC
        LIMIT 10
      `, establishment_id ? [establishment_id] : []);

      // Query para eventos semanais ativos (TODOS os eventos semanais)
      const [eventosSemanais] = await this.pool.execute(`
        SELECT 
          e.id as evento_id,
          e.nome_do_evento as nome,
          e.hora_do_evento as horario_funcionamento,
          e.dia_da_semana,
          e.tipo_evento,
          COALESCE(p.name, b.name) as establishment_name,
          e.id_place
        FROM eventos e
        LEFT JOIN places p ON e.id_place = p.id
        LEFT JOIN bars b ON e.id_place = b.id
        WHERE e.tipo_evento = 'semanal'
        ${establishment_id ? 'AND e.id_place = ?' : ''}
        ORDER BY e.dia_da_semana ASC
      `, establishment_id ? [establishment_id] : []);

      // Query para total de convidados (eventos únicos futuros + semanais)
      const [totalConvidados] = await this.pool.execute(`
        SELECT COUNT(DISTINCT lc.lista_convidado_id) as total
        FROM listas_convidados lc
        INNER JOIN listas l ON lc.lista_id = l.lista_id
        INNER JOIN eventos e ON l.evento_id = e.id
        WHERE (
          (e.tipo_evento = 'unico' AND e.data_do_evento >= CURDATE())
          OR e.tipo_evento = 'semanal'
        )
        ${establishment_id ? 'AND e.id_place = ?' : ''}
      `, establishment_id ? [establishment_id] : []);

      // Query para total de check-ins
      const [totalCheckins] = await this.pool.execute(`
        SELECT COUNT(DISTINCT lc.lista_convidado_id) as total
        FROM listas_convidados lc
        INNER JOIN listas l ON lc.lista_id = l.lista_id
        INNER JOIN eventos e ON l.evento_id = e.id
        WHERE lc.status_checkin = 'Check-in'
        AND (
          (e.tipo_evento = 'unico' AND e.data_do_evento >= CURDATE())
          OR e.tipo_evento = 'semanal'
        )
        ${establishment_id ? 'AND e.id_place = ?' : ''}
      `, establishment_id ? [establishment_id] : []);

      // Query para total de promoters ativos
      const [totalPromoters] = await this.pool.execute(`
        SELECT COUNT(DISTINCT promoter_id) as total
        FROM promoters
        WHERE status = 'Ativo'
      `);

      // Query para estatísticas por tipo de lista
      const [estatisticasPorTipo] = await this.pool.execute(`
        SELECT 
          l.tipo,
          COUNT(DISTINCT lc.lista_convidado_id) as total_convidados,
          SUM(CASE WHEN lc.status_checkin = 'Check-in' THEN 1 ELSE 0 END) as total_checkins
        FROM listas l
        INNER JOIN eventos e ON l.evento_id = e.id
        LEFT JOIN listas_convidados lc ON l.lista_id = lc.lista_id
        WHERE (
          (e.tipo_evento = 'unico' AND e.data_do_evento >= CURDATE())
          OR e.tipo_evento = 'semanal'
        )
        ${establishment_id ? 'AND e.id_place = ?' : ''}
        GROUP BY l.tipo
      `, establishment_id ? [establishment_id] : []);

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
      const { establishment_id, status, tipo_evento, data_inicio, data_fim, limit } = req.query;
      
      let query = `
        SELECT 
          e.id as evento_id,
          e.nome_do_evento as nome,
          DATE_FORMAT(e.data_do_evento, '%Y-%m-%d') as data_evento,
          e.hora_do_evento as horario_funcionamento,
          e.descricao,
          e.tipo_evento,
          e.dia_da_semana,
          e.usado_para_listas,
          e.casa_do_evento,
          e.id_place as establishment_id,
          p.nome as promoter_criador_nome,
          COALESCE(pl.name, b.name) as establishment_name,
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
      
      if (establishment_id) {
        query += ` AND e.id_place = ?`;
        params.push(establishment_id);
      }
      
      if (tipo_evento) {
        query += ` AND e.tipo_evento = ?`;
        params.push(tipo_evento);
      }
      
      if (data_inicio && tipo_evento !== 'semanal') {
        query += ` AND e.data_do_evento >= ?`;
        params.push(data_inicio);
      }
      
      if (data_fim && tipo_evento !== 'semanal') {
        query += ` AND e.data_do_evento <= ?`;
        params.push(data_fim);
      }
      
      query += ` GROUP BY e.id`;
      
      // Ordenação: eventos únicos por data, semanais por dia da semana
      query += ` ORDER BY 
        CASE WHEN e.tipo_evento = 'unico' THEN e.data_do_evento END DESC,
        CASE WHEN e.tipo_evento = 'semanal' THEN e.dia_da_semana END ASC
      `;
      
      if (limit) {
        query += ` LIMIT ?`;
        params.push(parseInt(limit));
      }
      
      const [eventos] = await this.pool.execute(query, params);
      
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
      
      const [eventos] = await this.pool.execute(`
        SELECT 
          e.id as evento_id,
          e.nome_do_evento as nome,
          e.data_do_evento as data_evento,
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
          COALESCE(pl.name, b.name) as establishment_name
        FROM eventos e
        LEFT JOIN promoters p ON e.promoter_criador_id = p.promoter_id
        LEFT JOIN places pl ON e.id_place = pl.id
        LEFT JOIN bars b ON e.id_place = b.id
        WHERE e.id = ?
      `, [eventoId]);
      
      if (eventos.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Evento não encontrado'
        });
      }
      
      res.json({
        success: true,
        evento: eventos[0]
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
      
      const [result] = await this.pool.execute(`
        INSERT INTO eventos (
          nome_do_evento, data_do_evento, hora_do_evento, tipo_evento,
          dia_da_semana, descricao, casa_do_evento, local_do_evento,
          promoter_criador_id, id_place, categoria, usado_para_listas
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, TRUE)
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
      
      const [novoEvento] = await this.pool.execute(`
        SELECT * FROM eventos WHERE id = ?
      `, [result.insertId]);
      
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
      
      await this.pool.execute(`
        UPDATE eventos
        SET nome_do_evento = ?, data_do_evento = ?, hora_do_evento = ?,
            tipo_evento = ?, dia_da_semana = ?, descricao = ?,
            usado_para_listas = ?
        WHERE id = ?
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
      
      const [eventoAtualizado] = await this.pool.execute(`
        SELECT * FROM eventos WHERE id = ?
      `, [eventoId]);
      
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
      const [evento] = await this.pool.execute(`
        SELECT 
          e.id,
          e.nome_do_evento,
          e.usado_para_listas,
          e.tipo_evento,
          e.data_do_evento,
          COALESCE(p.name, b.name) as establishment_name
        FROM eventos e
        LEFT JOIN places p ON e.id_place = p.id
        LEFT JOIN bars b ON e.id_place = b.id
        WHERE e.id = ?
      `, [eventoId]);
      
      if (evento.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Evento não encontrado'
        });
      }
      
      console.log('📋 [getListasEvento] Evento encontrado:', evento[0]);
      
      // Buscar listas do evento
      const [listas] = await this.pool.execute(`
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
        WHERE l.evento_id = ?
        GROUP BY l.lista_id
        ORDER BY l.tipo, l.nome
      `, [eventoId]);
      
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
        
        const [convidados] = await this.pool.execute(`
          SELECT 
            lc.*,
            GROUP_CONCAT(b.nome SEPARATOR ', ') as beneficios
          FROM listas_convidados lc
          LEFT JOIN lista_convidado_beneficio lcb ON lc.lista_convidado_id = lcb.lista_convidado_id
          LEFT JOIN beneficios b ON lcb.beneficio_id = b.beneficio_id
          WHERE lc.lista_id = ?
          GROUP BY lc.lista_convidado_id
          ORDER BY lc.nome_convidado
        `, [lista.lista_id]);
        
        console.log(`✅ [getListasEvento] Lista ${lista.lista_id}: ${convidados.length} convidados`);
        
        lista.convidados = convidados;
      }
      
      console.log('🎉 [getListasEvento] Retornando dados completos');
      
      res.json({
        success: true,
        evento: evento[0],
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
      
      const [lista] = await this.pool.execute(`
        SELECT lista_id FROM listas WHERE lista_id = ?
      `, [listaId]);
      
      if (lista.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Lista não encontrada'
        });
      }
      
      const [result] = await this.pool.execute(`
        INSERT INTO listas_convidados (
          lista_id, nome_convidado, telefone_convidado, email_convidado,
          is_vip, observacoes, status_checkin
        ) VALUES (?, ?, ?, ?, ?, ?, 'Pendente')
      `, [listaId, nome_convidado, telefone_convidado, email_convidado, is_vip || false, observacoes]);
      
      const convidadoId = result.insertId;
      
      if (beneficios && Array.isArray(beneficios) && beneficios.length > 0) {
        const beneficioValues = beneficios.map(beneficioId => 
          [convidadoId, beneficioId, false, null]
        );
        
        await this.pool.query(`
          INSERT INTO lista_convidado_beneficio 
          (lista_convidado_id, beneficio_id, utilizado, data_utilizacao)
          VALUES ?
        `, [beneficioValues]);
      }
      
      const [novoConvidado] = await this.pool.execute(`
        SELECT 
          lc.*,
          GROUP_CONCAT(b.nome SEPARATOR ', ') as beneficios
        FROM listas_convidados lc
        LEFT JOIN lista_convidado_beneficio lcb ON lc.lista_convidado_id = lcb.lista_convidado_id
        LEFT JOIN beneficios b ON lcb.beneficio_id = b.beneficio_id
        WHERE lc.lista_convidado_id = ?
        GROUP BY lc.lista_convidado_id
      `, [convidadoId]);
      
      res.status(201).json({
        success: true,
        message: 'Convidado adicionado com sucesso',
        convidado: novoConvidado[0]
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
      const { status_checkin } = req.body;
      
      if (!['Pendente', 'Check-in', 'No-Show'].includes(status_checkin)) {
        return res.status(400).json({
          success: false,
          error: 'Status de check-in inválido'
        });
      }
      
      const dataCheckin = status_checkin === 'Check-in' ? new Date() : null;
      
      await this.pool.execute(`
        UPDATE listas_convidados
        SET status_checkin = ?, data_checkin = ?
        WHERE lista_convidado_id = ?
      `, [status_checkin, dataCheckin, listaConvidadoId]);
      
      const [convidado] = await this.pool.execute(`
        SELECT 
          lc.*,
          l.nome as lista_nome,
          l.tipo as lista_tipo,
          p.nome as promoter_nome,
          GROUP_CONCAT(b.nome SEPARATOR ', ') as beneficios
        FROM listas_convidados lc
        INNER JOIN listas l ON lc.lista_id = l.lista_id
        LEFT JOIN promoters p ON l.promoter_responsavel_id = p.promoter_id
        LEFT JOIN lista_convidado_beneficio lcb ON lc.lista_convidado_id = lcb.lista_convidado_id
        LEFT JOIN beneficios b ON lcb.beneficio_id = b.beneficio_id
        WHERE lc.lista_convidado_id = ?
        GROUP BY lc.lista_convidado_id
      `, [listaConvidadoId]);
      
      res.json({
        success: true,
        message: `Check-in atualizado para: ${status_checkin}`,
        convidado: convidado[0]
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
      
      if (status) {
        query += ` AND p.status = ?`;
        params.push(status);
      }
      
      query += ` GROUP BY p.promoter_id`;
      query += ` ORDER BY total_checkins DESC, p.nome ASC`;
      
      if (limit) {
        query += ` LIMIT ?`;
        params.push(parseInt(limit));
      }
      
      const [promoters] = await this.pool.execute(query, params);
      
      res.json({
        success: true,
        promoters
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
      
      if (status) {
        query += ` AND h.status = ?`;
        params.push(status);
      }
      
      if (establishment_id) {
        query += ` AND h.establishment_id = ?`;
        params.push(establishment_id);
      }
      
      query += ` ORDER BY h.nome ASC`;
      
      if (limit) {
        query += ` LIMIT ?`;
        params.push(parseInt(limit));
      }
      
      const [hostess] = await this.pool.execute(query, params);
      
      res.json({
        success: true,
        hostess
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
      
      if (ativo !== undefined) {
        query += ` AND ativo = ?`;
        params.push(ativo === 'true' ? 1 : 0);
      }
      
      query += ` ORDER BY tipo, nome`;
      
      const [beneficios] = await this.pool.execute(query, params);
      
      res.json({
        success: true,
        beneficios
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
      
      const [result] = await this.pool.execute(`
        INSERT INTO listas (
          evento_id, promoter_responsavel_id, nome, tipo, observacoes
        ) VALUES (?, ?, ?, ?, ?)
      `, [evento_id, promoter_responsavel_id, nome, tipo, observacoes]);
      
      const [novaLista] = await this.pool.execute(`
        SELECT 
          l.*,
          p.nome as promoter_nome
        FROM listas l
        LEFT JOIN promoters p ON l.promoter_responsavel_id = p.promoter_id
        WHERE l.lista_id = ?
      `, [result.insertId]);
      
      res.status(201).json({
        success: true,
        message: 'Lista criada com sucesso',
        lista: novaLista[0]
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
      
      const [lista] = await this.pool.execute(`
        SELECT 
          l.*,
          e.nome_do_evento as evento_nome,
          e.data_do_evento as data_evento,
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
        WHERE l.lista_id = ?
        GROUP BY l.lista_id
      `, [listaId]);
      
      if (lista.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Lista não encontrada'
        });
      }
      
      const [convidados] = await this.pool.execute(`
        SELECT 
          lc.*,
          GROUP_CONCAT(DISTINCT b.nome SEPARATOR ', ') as beneficios,
          GROUP_CONCAT(DISTINCT b.beneficio_id) as beneficio_ids
        FROM listas_convidados lc
        LEFT JOIN lista_convidado_beneficio lcb ON lc.lista_convidado_id = lcb.lista_convidado_id
        LEFT JOIN beneficios b ON lcb.beneficio_id = b.beneficio_id
        WHERE lc.lista_id = ?
        GROUP BY lc.lista_convidado_id
        ORDER BY lc.status_checkin DESC, lc.nome_convidado ASC
      `, [listaId]);
      
      res.json({
        success: true,
        lista: lista[0],
        convidados
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
      const [evento] = await this.pool.execute(`
        SELECT 
          e.id as evento_id,
          e.nome_do_evento as nome,
          e.data_do_evento as data_evento,
          e.hora_do_evento as horario,
          e.tipo_evento,
          e.id_place as establishment_id,
          COALESCE(pl.name, b.name) as establishment_name
        FROM eventos e
        LEFT JOIN places pl ON e.id_place = pl.id
        LEFT JOIN bars b ON e.id_place = b.id
        WHERE e.id = ?
      `, [eventoId]);
      
      if (evento.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Evento não encontrado'
        });
      }
      
      const eventoInfo = evento[0];
      console.log('📋 Evento Info:', {
        evento_id: eventoInfo.evento_id,
        nome: eventoInfo.nome,
        data_evento: eventoInfo.data_evento,
        establishment_id: eventoInfo.establishment_id,
        establishment_name: eventoInfo.establishment_name
      });
      
      // 2. Buscar reservas de mesa vinculadas ao evento (via convidados)
      const [reservasMesa] = await this.pool.execute(`
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
        WHERE r.evento_id = ?
        GROUP BY r.id
        ORDER BY r.data_reserva DESC
      `, [eventoId]);
      
      // 3. Buscar convidados de reservas
      const [convidadosReservas] = await this.pool.execute(`
        SELECT 
          c.id,
          'convidado_reserva' as tipo,
          c.nome,
          c.email,
          c.documento,
          c.status,
          c.data_checkin,
          r.nome_lista as origem,
          u.name as responsavel
        FROM convidados c
        INNER JOIN reservas r ON c.reserva_id = r.id
        LEFT JOIN users u ON r.user_id = u.id
        WHERE r.evento_id = ?
        ORDER BY c.nome ASC
      `, [eventoId]);
      
      // 4. Buscar listas e convidados de promoters
      const [listasPromoters] = await this.pool.execute(`
        SELECT 
          lc.lista_convidado_id as id,
          'convidado_promoter' as tipo,
          lc.nome_convidado as nome,
          lc.telefone_convidado as telefone,
          lc.status_checkin,
          lc.data_checkin,
          lc.is_vip,
          lc.observacoes,
          l.nome as origem,
          l.tipo as tipo_lista,
          p.nome as responsavel,
          p.promoter_id
        FROM listas_convidados lc
        INNER JOIN listas l ON lc.lista_id = l.lista_id
        LEFT JOIN promoters p ON l.promoter_responsavel_id = p.promoter_id
        WHERE l.evento_id = ?
        ORDER BY lc.nome_convidado ASC
      `, [eventoId]);
      
      // 5. Buscar promoters vinculados ao evento
      const [promoters] = await this.pool.execute(`
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
        LEFT JOIN listas l ON p.promoter_id = l.promoter_responsavel_id AND l.evento_id = ?
        LEFT JOIN listas_convidados lc ON l.lista_id = lc.lista_id
        WHERE EXISTS (
          SELECT 1 FROM listas WHERE promoter_responsavel_id = p.promoter_id AND evento_id = ?
        )
        GROUP BY p.promoter_id
        ORDER BY p.nome ASC
      `, [eventoId, eventoId]);
      
      // 6. Buscar reservas grandes (camarotes) do estabelecimento na mesma data
      // Só busca se tiver establishment_id e data_evento (não é evento semanal)
      let camarotes = [];
      if (eventoInfo.establishment_id && eventoInfo.data_evento) {
        try {
          const [camarotesResult] = await this.pool.execute(`
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
              SUM(CASE WHEN g.checked_in = 1 THEN 1 ELSE 0 END) as convidados_checkin
            FROM large_reservations lr
            LEFT JOIN guest_lists gl ON lr.id = gl.reservation_id AND gl.reservation_type = 'large'
            LEFT JOIN guests g ON gl.id = g.guest_list_id
            WHERE lr.establishment_id = ?
            AND DATE(lr.reservation_date) = DATE(?)
            GROUP BY lr.id
            ORDER BY lr.reservation_time ASC
          `, [eventoInfo.establishment_id, eventoInfo.data_evento]);
          camarotes = camarotesResult;
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
          const [guestListsResult] = await this.pool.execute(`
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
              rr.checked_in as reservation_checked_in,
              rr.checkin_time as reservation_checkin_time,
              COALESCE(u.name, 'Sistema') as created_by_name,
              COUNT(DISTINCT g.id) as total_guests,
              SUM(CASE WHEN g.checked_in = 1 THEN 1 ELSE 0 END) as guests_checked_in
            FROM guest_lists gl
            INNER JOIN restaurant_reservations rr ON gl.reservation_id = rr.id AND gl.reservation_type = 'restaurant'
            LEFT JOIN users u ON rr.created_by = u.id
            LEFT JOIN guests g ON gl.id = g.guest_list_id
            WHERE rr.establishment_id = ?
            AND DATE(rr.reservation_date) = DATE(?)
            GROUP BY gl.id
            ORDER BY rr.reservation_time ASC
          `, [eventoInfo.establishment_id, eventoInfo.data_evento]);
          
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
          
          const [convidadosReservasRestauranteResult] = await this.pool.execute(`
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
            WHERE rr.establishment_id = ?
            AND DATE(rr.reservation_date) = DATE(?)
            ORDER BY g.name ASC
          `, [eventoInfo.establishment_id, eventoInfo.data_evento]);
          
          convidadosReservasRestaurante = convidadosReservasRestauranteResult;
          console.log(`✅ Convidados de reservas restaurante encontrados: ${convidadosReservasRestaurante.length}`);
          
          if (convidadosReservasRestaurante.length > 0) {
            console.log('📋 Primeiros convidados:', convidadosReservasRestaurante.slice(0, 3));
          } else {
            // Debug: verificar se há reservas no establishment/date
            const [reservasDebug] = await this.pool.execute(`
              SELECT COUNT(*) as total FROM restaurant_reservations 
              WHERE establishment_id = ? AND DATE(reservation_date) = DATE(?)
            `, [eventoInfo.establishment_id, eventoInfo.data_evento]);
            console.log('🔍 Reservas no establishment/date:', reservasDebug[0].total);
            
            // Debug: verificar se há guest_lists para essas reservas
            const [guestListsDebug] = await this.pool.execute(`
              SELECT COUNT(*) as total FROM guest_lists gl
              INNER JOIN restaurant_reservations rr ON gl.reservation_id = rr.id AND gl.reservation_type = 'restaurant'
              WHERE rr.establishment_id = ? AND DATE(rr.reservation_date) = DATE(?)
            `, [eventoInfo.establishment_id, eventoInfo.data_evento]);
            console.log('🔍 Guest lists encontradas:', guestListsDebug[0].total);
          }
        } catch (err) {
          console.error('❌ Erro ao buscar convidados de reservas restaurante:', err);
          convidadosReservasRestaurante = [];
        }
      } else {
        console.log('⚠️ Evento não possui establishment_id ou data_evento, pulando busca de convidados de reservas restaurante');
      }
      
      // 9. Calcular estatísticas gerais
      const totalReservasMesa = reservasMesa.length;
      const totalConvidadosReservas = convidadosReservas.length;
      const checkinConvidadosReservas = convidadosReservas.filter(c => c.status === 'CHECK-IN').length;
      
      const totalPromoters = promoters.length;
      const totalConvidadosPromoters = listasPromoters.length;
      const checkinConvidadosPromoters = listasPromoters.filter(c => c.status_checkin === 'Check-in').length;
      
      const totalCamarotes = camarotes.length;
      const checkinCamarotes = camarotes.filter(c => c.checked_in).length;
      
      const totalReservasRestaurante = reservasRestaurante.length;
      const totalConvidadosReservasRestaurante = convidadosReservasRestaurante.length;
      const checkinConvidadosReservasRestaurante = convidadosReservasRestaurante.filter(c => c.status_checkin === 1 || c.status_checkin === true).length;
      
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
