// routes/promotersAdvanced.js

const express = require('express');
const router = express.Router();
const authenticateToken = require('../middleware/auth');
const authorizeRoles = require('../middleware/authorize');

module.exports = (pool) => {
  /**
   * @route   GET /api/v1/promoters/advanced
   * @desc    Lista promoters com informações completas e estatísticas
   * @access  Private (Admin, Gerente)
   */
  router.get(
    '/advanced',
    authenticateToken,
    authorizeRoles('admin', 'gerente'),
    async (req, res) => {
      try {
        const { status, categoria, establishment_id, limit, offset } = req.query;
        
        let query = `
          SELECT 
            p.*,
            pc.max_convidados_por_evento,
            pc.max_convidados_por_data,
            pc.quota_mesas,
            pc.quota_entradas,
            pc.entradas_gratuitas,
            pc.desconto_especial_percentual,
            pc.valor_minimo_consumo,
            pc.pode_reservar_mesas_vip,
            pc.pode_selecionar_areas,
            COUNT(DISTINCT l.lista_id) as total_listas,
            COUNT(DISTINCT lc.lista_convidado_id) as total_convidados,
            SUM(CASE WHEN lc.status_checkin = 'Check-in' THEN 1 ELSE 0 END) as total_checkins,
            AVG(pp.taxa_comparecimento) as media_taxa_comparecimento,
            SUM(pp.receita_gerada) as receita_total_gerada,
            COUNT(DISTINCT pa.alerta_id) as total_alertas_nao_lidos,
            pl.name as establishment_name
          FROM promoters p
          LEFT JOIN promoter_condicoes pc ON p.promoter_id = pc.promoter_id AND pc.ativo = TRUE
          LEFT JOIN promoter_permissoes pp_perm ON p.promoter_id = pp_perm.promoter_id
          LEFT JOIN listas l ON p.promoter_id = l.promoter_responsavel_id
          LEFT JOIN listas_convidados lc ON l.lista_id = lc.lista_id
          LEFT JOIN promoter_performance pp ON p.promoter_id = pp.promoter_id
          LEFT JOIN promoter_alertas pa ON p.promoter_id = pa.promoter_id AND pa.lido = FALSE
          LEFT JOIN places pl ON p.establishment_id = pl.id
          WHERE 1=1
        `;
        
        const params = [];
        
        if (status) {
          query += ` AND p.status = ?`;
          params.push(status);
        }
        
        if (categoria) {
          query += ` AND p.tipo_categoria = ?`;
          params.push(categoria);
        }
        
        if (establishment_id) {
          query += ` AND p.establishment_id = ?`;
          params.push(establishment_id);
        }
        
        query += ` GROUP BY p.promoter_id`;
        query += ` ORDER BY p.nome ASC`;
        
        if (limit) {
          query += ` LIMIT ?`;
          params.push(parseInt(limit));
          
          if (offset) {
            query += ` OFFSET ?`;
            params.push(parseInt(offset));
          }
        }
        
        const [promoters] = await pool.execute(query, params);
        
        res.json({
          success: true,
          promoters,
          total: promoters.length
        });
      } catch (error) {
        console.error('❌ Erro ao listar promoters avançados:', error);
        res.status(500).json({
          success: false,
          error: 'Erro ao listar promoters'
        });
      }
    }
  );

  /**
   * @route   GET /api/v1/promoters/:id/detalhes
   * @desc    Retorna detalhes completos de um promoter específico
   * @access  Private (Admin, Gerente)
   */
  router.get(
    '/:id/detalhes',
    authenticateToken,
    authorizeRoles('admin', 'gerente'),
    async (req, res) => {
      try {
        const { id } = req.params;
        
        // Buscar informações básicas do promoter
        const [promoters] = await pool.execute(
          `SELECT p.*, pl.name as establishment_name 
           FROM promoters p 
           LEFT JOIN places pl ON p.establishment_id = pl.id 
           WHERE p.promoter_id = ?`,
          [id]
        );
        
        if (promoters.length === 0) {
          return res.status(404).json({
            success: false,
            error: 'Promoter não encontrado'
          });
        }
        
        const promoter = promoters[0];
        
        // Buscar condições do promoter
        const [condicoes] = await pool.execute(
          'SELECT * FROM promoter_condicoes WHERE promoter_id = ? AND ativo = TRUE',
          [id]
        );
        
        // Buscar permissões do promoter
        const [permissoes] = await pool.execute(
          'SELECT * FROM promoter_permissoes WHERE promoter_id = ?',
          [id]
        );
        
        // Buscar histórico de performance
        const [performance] = await pool.execute(
          `SELECT 
            pp.*,
            e.nome as evento_nome,
            e.data_do_evento
           FROM promoter_performance pp
           LEFT JOIN eventos e ON pp.evento_id = e.id
           WHERE pp.promoter_id = ?
           ORDER BY pp.data_evento DESC
           LIMIT 10`,
          [id]
        );
        
        // Buscar alertas não lidos
        const [alertas] = await pool.execute(
          `SELECT 
            pa.*,
            e.nome as evento_nome
           FROM promoter_alertas pa
           LEFT JOIN eventos e ON pa.evento_id = e.id
           WHERE pa.promoter_id = ? AND pa.lido = FALSE
           ORDER BY pa.prioridade DESC, pa.created_at DESC`,
          [id]
        );
        
        // Buscar listas ativas
        const [listas] = await pool.execute(
          `SELECT 
            l.*,
            e.nome as evento_nome,
            e.data_do_evento,
            COUNT(lc.lista_convidado_id) as total_convidados,
            SUM(CASE WHEN lc.status_checkin = 'Check-in' THEN 1 ELSE 0 END) as checkins
           FROM listas l
           LEFT JOIN eventos e ON l.evento_id = e.id
           LEFT JOIN listas_convidados lc ON l.lista_id = lc.lista_id
           WHERE l.promoter_responsavel_id = ?
           GROUP BY l.lista_id
           ORDER BY e.data_do_evento DESC`,
          [id]
        );
        
        // Buscar convites ativos
        const [convites] = await pool.execute(
          `SELECT 
            pc.*,
            e.nome as evento_nome
           FROM promoter_convites pc
           LEFT JOIN eventos e ON pc.evento_id = e.id
           WHERE pc.promoter_id = ? AND pc.ativo = TRUE
           ORDER BY pc.created_at DESC`,
          [id]
        );
        
        res.json({
          success: true,
          promoter: {
            ...promoter,
            condicoes: condicoes[0] || null,
            permissoes: permissoes[0] || null,
            performance: performance,
            alertas: alertas,
            listas: listas,
            convites: convites
          }
        });
      } catch (error) {
        console.error('❌ Erro ao buscar detalhes do promoter:', error);
        res.status(500).json({
          success: false,
          error: 'Erro ao buscar detalhes do promoter'
        });
      }
    }
  );

  /**
   * @route   POST /api/v1/promoters
   * @desc    Cria um novo promoter com todas as configurações
   * @access  Private (Admin, Gerente)
   */
  router.post(
    '/',
    authenticateToken,
    authorizeRoles('admin', 'gerente'),
    async (req, res) => {
      const connection = await pool.getConnection();
      
      try {
        await connection.beginTransaction();
        
        const {
          nome,
          apelido,
          email,
          telefone,
          whatsapp,
          codigo_identificador,
          tipo_categoria,
          comissao_percentual,
          link_convite,
          observacoes,
          establishment_id,
          foto_url,
          instagram,
          // Condições
          max_convidados_por_evento,
          max_convidados_por_data,
          quota_mesas,
          quota_entradas,
          entradas_gratuitas,
          desconto_especial_percentual,
          valor_minimo_consumo,
          horario_checkin_inicio,
          horario_checkin_fim,
          politica_no_show,
          pode_reservar_mesas_vip,
          pode_selecionar_areas,
          areas_permitidas,
          mesas_reservadas,
          // Permissões
          permissoes
        } = req.body;
        
        // Validar dados obrigatórios
        if (!nome || !email) {
          return res.status(400).json({
            success: false,
            error: 'Nome e email são obrigatórios'
          });
        }
        
        // Verificar se email já existe
        const [existingEmail] = await connection.execute(
          'SELECT promoter_id FROM promoters WHERE email = ?',
          [email]
        );
        
        if (existingEmail.length > 0) {
          return res.status(400).json({
            success: false,
            error: 'Email já está em uso por outro promoter'
          });
        }
        
        // Verificar se código identificador já existe
        if (codigo_identificador) {
          const [existingCode] = await connection.execute(
            'SELECT promoter_id FROM promoters WHERE codigo_identificador = ?',
            [codigo_identificador]
          );
          
          if (existingCode.length > 0) {
            return res.status(400).json({
              success: false,
              error: 'Código identificador já está em uso'
            });
          }
        }
        
        // Inserir promoter
        const [result] = await connection.execute(
          `INSERT INTO promoters (
            nome, apelido, email, telefone, whatsapp, codigo_identificador, 
            tipo_categoria, comissao_percentual, link_convite, observacoes,
            establishment_id, foto_url, instagram, data_cadastro, status, ativo
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURDATE(), 'Ativo', TRUE)`,
          [
            nome, apelido, email, telefone, whatsapp, codigo_identificador,
            tipo_categoria || 'Standard', comissao_percentual || 0, link_convite, observacoes,
            establishment_id, foto_url, instagram
          ]
        );
        
        const promoterId = result.insertId;
        
        // Inserir condições padrão
        await connection.execute(
          `INSERT INTO promoter_condicoes (
            promoter_id, max_convidados_por_evento, max_convidados_por_data,
            quota_mesas, quota_entradas, entradas_gratuitas, desconto_especial_percentual,
            valor_minimo_consumo, horario_checkin_inicio, horario_checkin_fim,
            politica_no_show, pode_reservar_mesas_vip, pode_selecionar_areas, 
            areas_permitidas, mesas_reservadas, ativo
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, TRUE)`,
          [
            promoterId, max_convidados_por_evento, max_convidados_por_data,
            quota_mesas, quota_entradas, entradas_gratuitas, desconto_especial_percentual,
            valor_minimo_consumo, horario_checkin_inicio, horario_checkin_fim,
            politica_no_show, pode_reservar_mesas_vip || false, pode_selecionar_areas || false,
            areas_permitidas ? JSON.stringify(areas_permitidas) : null,
            mesas_reservadas ? JSON.stringify(mesas_reservadas) : null
          ]
        );
        
        // Inserir permissões padrão
        await connection.execute(
          `INSERT INTO promoter_permissoes (
            promoter_id, pode_ver_lista_convidados, pode_adicionar_convidados,
            pode_remover_convidados, pode_gerar_link_convite, pode_gerar_qr_code,
            pode_ver_historico, pode_ver_relatorios, pode_ultrapassar_limites,
            pode_aprovar_convidados_extra, pode_editar_eventos, pode_criar_eventos
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            promoterId,
            permissoes?.pode_ver_lista_convidados !== false,
            permissoes?.pode_adicionar_convidados !== false,
            permissoes?.pode_remover_convidados !== false,
            permissoes?.pode_gerar_link_convite !== false,
            permissoes?.pode_gerar_qr_code !== false,
            permissoes?.pode_ver_historico !== false,
            permissoes?.pode_ver_relatorios || false,
            permissoes?.pode_ultrapassar_limites || false,
            permissoes?.pode_aprovar_convidados_extra || false,
            permissoes?.pode_editar_eventos || false,
            permissoes?.pode_criar_eventos || false
          ]
        );
        
        await connection.commit();
        
        res.status(201).json({
          success: true,
          message: 'Promoter criado com sucesso',
          promoter_id: promoterId
        });
        
      } catch (error) {
        await connection.rollback();
        console.error('❌ Erro ao criar promoter:', error);
        res.status(500).json({
          success: false,
          error: 'Erro ao criar promoter'
        });
      } finally {
        connection.release();
      }
    }
  );

  /**
   * @route   PUT /api/v1/promoters/:id
   * @desc    Atualiza informações de um promoter
   * @access  Private (Admin, Gerente)
   */
  router.put(
    '/:id',
    authenticateToken,
    authorizeRoles('admin', 'gerente'),
    async (req, res) => {
      try {
        const { id } = req.params;
        const updateData = req.body;
        
        // Verificar se promoter existe
        const [promoters] = await pool.execute(
          'SELECT promoter_id FROM promoters WHERE promoter_id = ?',
          [id]
        );
        
        if (promoters.length === 0) {
          return res.status(404).json({
            success: false,
            error: 'Promoter não encontrado'
          });
        }
        
        // Construir query de atualização dinamicamente
        const allowedFields = [
          'nome', 'apelido', 'email', 'telefone', 'whatsapp', 'codigo_identificador',
          'tipo_categoria', 'comissao_percentual', 'link_convite', 'observacoes', 
          'status', 'establishment_id', 'foto_url', 'instagram', 'ativo'
        ];
        
        const updateFields = [];
        const updateValues = [];
        
        allowedFields.forEach(field => {
          if (updateData[field] !== undefined) {
            updateFields.push(`${field} = ?`);
            updateValues.push(updateData[field]);
          }
        });
        
        if (updateFields.length === 0) {
          return res.status(400).json({
            success: false,
            error: 'Nenhum campo válido para atualização'
          });
        }
        
        updateValues.push(id);
        
        await pool.execute(
          `UPDATE promoters SET ${updateFields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE promoter_id = ?`,
          updateValues
        );
        
        res.json({
          success: true,
          message: 'Promoter atualizado com sucesso'
        });
        
      } catch (error) {
        console.error('❌ Erro ao atualizar promoter:', error);
        res.status(500).json({
          success: false,
          error: 'Erro ao atualizar promoter'
        });
      }
    }
  );

  /**
   * @route   PUT /api/v1/promoters/:id/condicoes
   * @desc    Atualiza condições de um promoter
   * @access  Private (Admin, Gerente)
   */
  router.put(
    '/:id/condicoes',
    authenticateToken,
    authorizeRoles('admin', 'gerente'),
    async (req, res) => {
      try {
        const { id } = req.params;
        const condicoes = req.body;
        
        // Verificar se promoter existe
        const [promoters] = await pool.execute(
          'SELECT promoter_id FROM promoters WHERE promoter_id = ?',
          [id]
        );
        
        if (promoters.length === 0) {
          return res.status(404).json({
            success: false,
            error: 'Promoter não encontrado'
          });
        }
        
        // Atualizar ou inserir condições
        const allowedFields = [
          'max_convidados_por_evento', 'max_convidados_por_data', 'quota_mesas',
          'quota_entradas', 'entradas_gratuitas', 'desconto_especial_percentual',
          'valor_minimo_consumo', 'horario_checkin_inicio', 'horario_checkin_fim',
          'politica_no_show', 'pode_reservar_mesas_vip', 'pode_selecionar_areas',
          'areas_permitidas', 'mesas_reservadas'
        ];
        
        const updateFields = [];
        const updateValues = [];
        
        allowedFields.forEach(field => {
          if (condicoes[field] !== undefined) {
            if (field === 'areas_permitidas' || field === 'mesas_reservadas') {
              updateFields.push(`${field} = ?`);
              updateValues.push(condicoes[field] ? JSON.stringify(condicoes[field]) : null);
            } else {
              updateFields.push(`${field} = ?`);
              updateValues.push(condicoes[field]);
            }
          }
        });
        
        if (updateFields.length === 0) {
          return res.status(400).json({
            success: false,
            error: 'Nenhum campo válido para atualização'
          });
        }
        
        updateValues.push(id);
        
        // Verificar se já existe registro de condições
        const [existing] = await pool.execute(
          'SELECT condicao_id FROM promoter_condicoes WHERE promoter_id = ?',
          [id]
        );
        
        if (existing.length > 0) {
          // Atualizar existente
          await pool.execute(
            `UPDATE promoter_condicoes SET ${updateFields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE promoter_id = ?`,
            updateValues
          );
        } else {
          // Inserir novo
          updateValues.pop(); // Remove o id do final
          updateValues.unshift(id); // Adiciona o id no início
          
          const fieldsToInsert = allowedFields.filter(field => condicoes[field] !== undefined);
          const placeholders = fieldsToInsert.map(() => '?').join(', ');
          
          await pool.execute(
            `INSERT INTO promoter_condicoes (promoter_id, ${fieldsToInsert.join(', ')}, ativo) VALUES (?, ${placeholders}, TRUE)`,
            updateValues
          );
        }
        
        res.json({
          success: true,
          message: 'Condições do promoter atualizadas com sucesso'
        });
        
      } catch (error) {
        console.error('❌ Erro ao atualizar condições do promoter:', error);
        res.status(500).json({
          success: false,
          error: 'Erro ao atualizar condições do promoter'
        });
      }
    }
  );

  /**
   * @route   PUT /api/v1/promoters/:id/permissoes
   * @desc    Atualiza permissões de um promoter
   * @access  Private (Admin, Gerente)
   */
  router.put(
    '/:id/permissoes',
    authenticateToken,
    authorizeRoles('admin', 'gerente'),
    async (req, res) => {
      try {
        const { id } = req.params;
        const permissoes = req.body;
        
        // Verificar se promoter existe
        const [promoters] = await pool.execute(
          'SELECT promoter_id FROM promoters WHERE promoter_id = ?',
          [id]
        );
        
        if (promoters.length === 0) {
          return res.status(404).json({
            success: false,
            error: 'Promoter não encontrado'
          });
        }
        
        // Atualizar ou inserir permissões
        const allowedFields = [
          'pode_ver_lista_convidados', 'pode_adicionar_convidados', 'pode_remover_convidados',
          'pode_gerar_link_convite', 'pode_gerar_qr_code', 'pode_ver_historico',
          'pode_ver_relatorios', 'pode_ultrapassar_limites', 'pode_aprovar_convidados_extra',
          'pode_editar_eventos', 'pode_criar_eventos'
        ];
        
        const updateFields = [];
        const updateValues = [];
        
        allowedFields.forEach(field => {
          if (permissoes[field] !== undefined) {
            updateFields.push(`${field} = ?`);
            updateValues.push(permissoes[field]);
          }
        });
        
        if (updateFields.length === 0) {
          return res.status(400).json({
            success: false,
            error: 'Nenhum campo válido para atualização'
          });
        }
        
        updateValues.push(id);
        
        // Verificar se já existe registro de permissões
        const [existing] = await pool.execute(
          'SELECT permissao_id FROM promoter_permissoes WHERE promoter_id = ?',
          [id]
        );
        
        if (existing.length > 0) {
          // Atualizar existente
          await pool.execute(
            `UPDATE promoter_permissoes SET ${updateFields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE promoter_id = ?`,
            updateValues
          );
        } else {
          // Inserir novo
          updateValues.pop(); // Remove o id do final
          updateValues.unshift(id); // Adiciona o id no início
          
          const fieldsToInsert = allowedFields.filter(field => permissoes[field] !== undefined);
          const placeholders = fieldsToInsert.map(() => '?').join(', ');
          
          await pool.execute(
            `INSERT INTO promoter_permissoes (promoter_id, ${fieldsToInsert.join(', ')}) VALUES (?, ${placeholders})`,
            updateValues
          );
        }
        
        res.json({
          success: true,
          message: 'Permissões do promoter atualizadas com sucesso'
        });
        
      } catch (error) {
        console.error('❌ Erro ao atualizar permissões do promoter:', error);
        res.status(500).json({
          success: false,
          error: 'Erro ao atualizar permissões do promoter'
        });
      }
    }
  );

  /**
   * @route   GET /api/v1/promoters/:id/performance
   * @desc    Retorna relatório de performance de um promoter
   * @access  Private (Admin, Gerente)
   */
  router.get(
    '/:id/performance',
    authenticateToken,
    authorizeRoles('admin', 'gerente'),
    async (req, res) => {
      try {
        const { id } = req.params;
        const { periodo = '30' } = req.query; // dias
        
        // Verificar se promoter existe
        const [promoters] = await pool.execute(
          'SELECT nome FROM promoters WHERE promoter_id = ?',
          [id]
        );
        
        if (promoters.length === 0) {
          return res.status(404).json({
            success: false,
            error: 'Promoter não encontrado'
          });
        }
        
        // Buscar performance do período
        const [performance] = await pool.execute(
          `SELECT 
            pp.*,
            e.nome as evento_nome,
            e.data_do_evento,
            pl.name as establishment_name
           FROM promoter_performance pp
           LEFT JOIN eventos e ON pp.evento_id = e.id
           LEFT JOIN places pl ON e.id_place = pl.id
           WHERE pp.promoter_id = ? 
           AND pp.data_evento >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
           ORDER BY pp.data_evento DESC`,
          [id, parseInt(periodo)]
        );
        
        // Calcular estatísticas gerais
        const [stats] = await pool.execute(
          `SELECT 
            COUNT(*) as total_eventos,
            AVG(taxa_comparecimento) as media_taxa_comparecimento,
            SUM(receita_gerada) as receita_total,
            SUM(consumacao_total) as consumacao_total,
            SUM(entradas_vendidas) as entradas_vendidas,
            SUM(comissao_calculada) as comissao_total
           FROM promoter_performance 
           WHERE promoter_id = ? 
           AND data_evento >= DATE_SUB(CURDATE(), INTERVAL ? DAY)`,
          [id, parseInt(periodo)]
        );
        
        res.json({
          success: true,
          promoter: promoters[0],
          performance: performance,
          estatisticas: stats[0] || {
            total_eventos: 0,
            media_taxa_comparecimento: 0,
            receita_total: 0,
            consumacao_total: 0,
            entradas_vendidas: 0,
            comissao_total: 0
          }
        });
        
      } catch (error) {
        console.error('❌ Erro ao buscar performance do promoter:', error);
        res.status(500).json({
          success: false,
          error: 'Erro ao buscar performance do promoter'
        });
      }
    }
  );

  /**
   * @route   GET /api/v1/promoters/ranking
   * @desc    Retorna ranking de promoters por performance
   * @access  Private (Admin, Gerente)
   */
  router.get(
    '/ranking',
    authenticateToken,
    authorizeRoles('admin', 'gerente'),
    async (req, res) => {
      try {
        const { periodo = '30', limite = '10' } = req.query;
        
        const [ranking] = await pool.execute(
          `SELECT 
            p.promoter_id,
            p.nome,
            p.tipo_categoria,
            COUNT(pp.performance_id) as total_eventos,
            AVG(pp.taxa_comparecimento) as media_taxa_comparecimento,
            SUM(pp.receita_gerada) as receita_total,
            SUM(pp.comissao_calculada) as comissao_total,
            SUM(pp.convidados_convidados) as total_convidados,
            SUM(pp.convidados_compareceram) as total_compareceram
           FROM promoters p
           LEFT JOIN promoter_performance pp ON p.promoter_id = pp.promoter_id
           WHERE pp.data_evento >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
           AND p.status = 'Ativo' AND p.ativo = TRUE
           GROUP BY p.promoter_id
           ORDER BY receita_total DESC, media_taxa_comparecimento DESC
           LIMIT ?`,
          [parseInt(periodo), parseInt(limite)]
        );
        
        res.json({
          success: true,
          ranking: ranking,
          periodo_dias: parseInt(periodo)
        });
        
      } catch (error) {
        console.error('❌ Erro ao buscar ranking de promoters:', error);
        res.status(500).json({
          success: false,
          error: 'Erro ao buscar ranking de promoters'
        });
      }
    }
  );

  /**
   * @route   POST /api/v1/promoters/:id/convite
   * @desc    Gera um novo convite para o promoter
   * @access  Private (Admin, Gerente)
   */
  router.post(
    '/:id/convite',
    authenticateToken,
    authorizeRoles('admin', 'gerente'),
    async (req, res) => {
      try {
        const { id } = req.params;
        const { evento_id, max_usos, data_expiracao, observacoes } = req.body;
        
        // Verificar se promoter existe
        const [promoters] = await pool.execute(
          'SELECT nome FROM promoters WHERE promoter_id = ?',
          [id]
        );
        
        if (promoters.length === 0) {
          return res.status(404).json({
            success: false,
            error: 'Promoter não encontrado'
          });
        }
        
        // Gerar código único
        const codigo_convite = `PROMO${id}_${Date.now()}`;
        const link_convite = `${process.env.FRONTEND_URL || 'https://vamos-comemorar.com.br'}/convite/${codigo_convite}`;
        
        // Inserir convite
        const [result] = await pool.execute(
          `INSERT INTO promoter_convites (
            promoter_id, evento_id, codigo_convite, link_convite, 
            max_usos, data_expiracao, observacoes, ativo
          ) VALUES (?, ?, ?, ?, ?, ?, ?, TRUE)`,
          [id, evento_id, codigo_convite, link_convite, max_usos, data_expiracao, observacoes]
        );
        
        res.status(201).json({
          success: true,
          message: 'Convite gerado com sucesso',
          convite: {
            convite_id: result.insertId,
            codigo_convite,
            link_convite
          }
        });
        
      } catch (error) {
        console.error('❌ Erro ao gerar convite:', error);
        res.status(500).json({
          success: false,
          error: 'Erro ao gerar convite'
        });
      }
    }
  );

  /**
   * @route   GET /api/v1/promoters/:id/alertas
   * @desc    Retorna alertas do promoter
   * @access  Private (Admin, Gerente)
   */
  router.get(
    '/:id/alertas',
    authenticateToken,
    authorizeRoles('admin', 'gerente'),
    async (req, res) => {
      try {
        const { id } = req.params;
        const { lido, prioridade, limite = '50' } = req.query;
        
        let query = `
          SELECT 
            pa.*,
            e.nome as evento_nome
           FROM promoter_alertas pa
           LEFT JOIN eventos e ON pa.evento_id = e.id
           WHERE pa.promoter_id = ?
        `;
        
        const params = [id];
        
        if (lido !== undefined) {
          query += ` AND pa.lido = ?`;
          params.push(lido === 'true');
        }
        
        if (prioridade) {
          query += ` AND pa.prioridade = ?`;
          params.push(prioridade);
        }
        
        query += ` ORDER BY pa.prioridade DESC, pa.created_at DESC LIMIT ?`;
        params.push(parseInt(limite));
        
        const [alertas] = await pool.execute(query, params);
        
        res.json({
          success: true,
          alertas
        });
        
      } catch (error) {
        console.error('❌ Erro ao buscar alertas do promoter:', error);
        res.status(500).json({
          success: false,
          error: 'Erro ao buscar alertas do promoter'
        });
      }
    }
  );

  /**
   * @route   PUT /api/v1/promoters/alertas/:alerta_id/lido
   * @desc    Marca um alerta como lido
   * @access  Private (Admin, Gerente)
   */
  router.put(
    '/alertas/:alerta_id/lido',
    authenticateToken,
    authorizeRoles('admin', 'gerente'),
    async (req, res) => {
      try {
        const { alerta_id } = req.params;
        
        await pool.execute(
          'UPDATE promoter_alertas SET lido = TRUE, data_leitura = NOW() WHERE alerta_id = ?',
          [alerta_id]
        );
        
        res.json({
          success: true,
          message: 'Alerta marcado como lido'
        });
        
      } catch (error) {
        console.error('❌ Erro ao marcar alerta como lido:', error);
        res.status(500).json({
          success: false,
          error: 'Erro ao marcar alerta como lido'
        });
      }
    }
  );

  return router;
};