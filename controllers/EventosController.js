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
      
      // Query para buscar o próximo evento único
      const [proximoEventoUnico] = await this.pool.execute(`
        SELECT 
          id as evento_id,
          nome_do_evento as nome,
          data_do_evento as data_evento,
          hora_do_evento as horario_funcionamento,
          descricao,
          tipo_evento,
          dia_da_semana,
          usado_para_listas
        FROM eventos
        WHERE tipo_evento = 'unico' 
        AND data_do_evento >= CURDATE()
        AND usado_para_listas = TRUE
        ${establishment_id ? 'AND id_place = ?' : ''}
        ORDER BY data_do_evento ASC
        LIMIT 1
      `, establishment_id ? [establishment_id] : []);

      // Query para eventos semanais ativos
      const [eventosSemanais] = await this.pool.execute(`
        SELECT 
          id as evento_id,
          nome_do_evento as nome,
          hora_do_evento as horario_funcionamento,
          dia_da_semana,
          tipo_evento
        FROM eventos
        WHERE tipo_evento = 'semanal'
        AND usado_para_listas = TRUE
        ${establishment_id ? 'AND id_place = ?' : ''}
        ORDER BY dia_da_semana ASC
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

      console.log('✅ Dashboard data:', {
        proximoEvento: proximoEventoUnico.length,
        eventosSemanais: eventosSemanais.length,
        totalConvidados: totalConvidados[0]?.total || 0
      });

      res.json({
        success: true,
        dashboard: {
          proximoEvento: proximoEventoUnico.length > 0 ? proximoEventoUnico[0] : null,
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
          e.data_do_evento as data_evento,
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
        WHERE e.usado_para_listas = TRUE
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
      
      // Buscar convidados de cada lista
      for (let lista of listas) {
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
        
        lista.convidados = convidados;
      }
      
      res.json({
        success: true,
        listas
      });
    } catch (error) {
      console.error('❌ Erro ao buscar listas do evento:', error);
      res.status(500).json({
        success: false,
        error: 'Erro ao buscar listas do evento'
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
}

module.exports = EventosController;
