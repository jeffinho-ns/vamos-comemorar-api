// routes/promotersAdvanced.js

const express = require('express');
const router = express.Router();
const authenticateToken = require('../middleware/auth');
const authorizeRoles = require('../middleware/authorize');
const bcrypt = require('bcryptjs');

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
        let paramIndex = 1;
        
        if (status) {
          query += ` AND p.status = $${paramIndex++}`;
          params.push(status);
        }
        
        if (categoria) {
          query += ` AND p.tipo_categoria = $${paramIndex++}`;
          params.push(categoria);
        }
        
        if (establishment_id) {
          query += ` AND p.establishment_id = $${paramIndex++}`;
          params.push(establishment_id);
        }
        
        query += ` GROUP BY p.promoter_id, p.nome, p.apelido, p.email, p.telefone, p.whatsapp, p.codigo_identificador, p.tipo_categoria, p.comissao_percentual, p.link_convite, p.observacoes, p.status, p.establishment_id, p.foto_url, p.instagram, p.data_cadastro, p.ativo, p.created_at, p.updated_at, pc.max_convidados_por_evento, pc.max_convidados_por_data, pc.quota_mesas, pc.quota_entradas, pc.entradas_gratuitas, pc.desconto_especial_percentual, pc.valor_minimo_consumo, pc.pode_reservar_mesas_vip, pc.pode_selecionar_areas, pl.name`;
        query += ` ORDER BY p.nome ASC`;
        
        if (limit) {
          query += ` LIMIT $${paramIndex++}`;
          params.push(parseInt(limit));
          
          if (offset) {
            query += ` OFFSET $${paramIndex++}`;
            params.push(parseInt(offset));
          }
        }
        
        const promotersResult = await pool.query(query, params);
        const promoters = promotersResult.rows;
        
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
   * @route   GET /api/v1/promoters/statistics
   * @desc    Retorna estatísticas gerais de promoters
   * @access  Private (Admin, Gerente)
   */
  router.get(
    '/statistics',
    authenticateToken,
    authorizeRoles('admin', 'gerente'),
    async (req, res) => {
      try {
        const { establishment_id } = req.query;
        
        // Total de promoters
        let totalPromotersQuery = 'SELECT COUNT(*) as total FROM promoters WHERE 1=1';
        const totalPromotersParams = [];
        
        if (establishment_id) {
          totalPromotersQuery += ' AND establishment_id = $1';
          totalPromotersParams.push(establishment_id);
        }
        
        const totalPromotersResult = await pool.query(totalPromotersQuery, totalPromotersParams);
        const totalPromoters = parseInt(totalPromotersResult.rows[0].total) || 0;
        
        // Total de promoters ativos
        let activePromotersQuery = `SELECT COUNT(*) as total FROM promoters WHERE status = 'Ativo' AND ativo = TRUE`;
        const activePromotersParams = [];
        
        if (establishment_id) {
          activePromotersQuery += ' AND establishment_id = $1';
          activePromotersParams.push(establishment_id);
        }
        
        const activePromotersResult = await pool.query(activePromotersQuery, activePromotersParams);
        const activePromoters = parseInt(activePromotersResult.rows[0].total) || 0;
        
        // Total de convidados reais (de listas_convidados vinculadas a promoters)
        let totalConvidadosQuery = `
          SELECT COUNT(DISTINCT lc.lista_convidado_id) as total
          FROM listas_convidados lc
          INNER JOIN listas l ON lc.lista_id = l.lista_id
          INNER JOIN promoters p ON l.promoter_responsavel_id = p.promoter_id
          WHERE 1=1
        `;
        const totalConvidadosParams = [];
        let paramIndex = 1;
        
        if (establishment_id) {
          totalConvidadosQuery += ` AND EXISTS (
            SELECT 1 FROM eventos e 
            WHERE e.id = l.evento_id 
            AND e.id_place = $${paramIndex++}
          )`;
          totalConvidadosParams.push(establishment_id);
        }
        
        const totalConvidadosResult = await pool.query(totalConvidadosQuery, totalConvidadosParams);
        const totalConvidados = parseInt(totalConvidadosResult.rows[0].total) || 0;
        
        // Receita total real - buscar de múltiplas fontes
        // 1. Receita de entrada_valor dos check-ins de convidados de promoters (listas_convidados)
        let receitaConvidadosQuery = `
          SELECT COALESCE(SUM(COALESCE(lc.entrada_valor, 0)), 0) as receita_total
          FROM listas_convidados lc
          INNER JOIN listas l ON lc.lista_id = l.lista_id
          INNER JOIN promoters p ON l.promoter_responsavel_id = p.promoter_id
          INNER JOIN eventos e ON l.evento_id = e.id
          WHERE lc.status_checkin = 'Check-in'
          AND lc.entrada_valor IS NOT NULL
          AND lc.entrada_valor > 0
        `;
        const receitaConvidadosParams = [];
        let receitaConvidadosParamIndex = 1;
        
        if (establishment_id) {
          receitaConvidadosQuery += ` AND e.id_place = $${receitaConvidadosParamIndex++}`;
          receitaConvidadosParams.push(establishment_id);
        }
        
        const receitaConvidadosResult = await pool.query(receitaConvidadosQuery, receitaConvidadosParams);
        let receitaTotal = parseFloat(receitaConvidadosResult.rows[0].receita_total) || 0;
        
        // 2. Receita de reservas vinculadas a promoters (via listas)
        let receitaReservasQuery = `
          SELECT COALESCE(SUM(
            CASE 
              WHEN r.valor_total IS NOT NULL AND r.valor_total > 0 THEN r.valor_total
              WHEN r.consumacao_total IS NOT NULL AND r.consumacao_total > 0 THEN r.consumacao_total
              ELSE 0
            END
          ), 0) as receita_total
          FROM reservas r
          INNER JOIN eventos e ON r.evento_id = e.id
          WHERE EXISTS (
            SELECT 1 FROM listas l
            INNER JOIN promoters p ON l.promoter_responsavel_id = p.promoter_id
            WHERE l.evento_id = e.id
          )
        `;
        const receitaReservasParams = [];
        let receitaReservasParamIndex = 1;
        
        if (establishment_id) {
          receitaReservasQuery += ` AND e.id_place = $${receitaReservasParamIndex++}`;
          receitaReservasParams.push(establishment_id);
        }
        
        try {
          const receitaReservasResult = await pool.query(receitaReservasQuery, receitaReservasParams);
          const receitaReservas = parseFloat(receitaReservasResult.rows[0].receita_total) || 0;
          receitaTotal += receitaReservas;
        } catch (e) {
          console.log('⚠️ Erro ao buscar receita de reservas:', e.message);
        }
        
        // 3. Receita de promoter_performance se existir
        let receitaPerformanceQuery = `
          SELECT COALESCE(SUM(pp.receita_gerada), 0) as receita_total
          FROM promoter_performance pp
          INNER JOIN promoters p ON pp.promoter_id = p.promoter_id
          WHERE pp.receita_gerada IS NOT NULL
          AND pp.receita_gerada > 0
        `;
        const receitaPerformanceParams = [];
        let receitaPerformanceParamIndex = 1;
        
        if (establishment_id) {
          receitaPerformanceQuery += ` AND p.establishment_id = $${receitaPerformanceParamIndex++}`;
          receitaPerformanceParams.push(establishment_id);
        }
        
        try {
          const receitaPerformanceResult = await pool.query(receitaPerformanceQuery, receitaPerformanceParams);
          const receitaPerformance = parseFloat(receitaPerformanceResult.rows[0].receita_total) || 0;
          // Somar receita de performance (pode ter dados adicionais)
          receitaTotal += receitaPerformance;
        } catch (e) {
          // Tabela pode não existir, continuar
          console.log('⚠️ Tabela promoter_performance não encontrada');
        }
        
        res.json({
          success: true,
          statistics: {
            total_promoters: totalPromoters,
            active_promoters: activePromoters,
            total_convidados: totalConvidados,
            receita_total: receitaTotal
          }
        });
        
      } catch (error) {
        console.error('❌ Erro ao buscar estatísticas de promoters:', error);
        res.status(500).json({
          success: false,
          error: 'Erro ao buscar estatísticas de promoters',
          details: error.message
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
        const promotersResult = await pool.query(
          `SELECT p.*, pl.name as establishment_name 
           FROM promoters p 
           LEFT JOIN places pl ON p.establishment_id = pl.id 
           WHERE p.promoter_id = $1`,
          [id]
        );
        
        if (promotersResult.rows.length === 0) {
          return res.status(404).json({
            success: false,
            error: 'Promoter não encontrado'
          });
        }
        
        const promoter = promotersResult.rows[0];
        
        // Buscar condições do promoter
        const condicoesResult = await pool.query(
          'SELECT * FROM promoter_condicoes WHERE promoter_id = $1 AND ativo = TRUE',
          [id]
        );
        
        // Buscar permissões do promoter
        const permissoesResult = await pool.query(
          'SELECT * FROM promoter_permissoes WHERE promoter_id = $1',
          [id]
        );
        
        // Buscar histórico de performance
        const performanceResult = await pool.query(
          `SELECT 
            pp.*,
            e.nome_do_evento as evento_nome,
            e.data_do_evento
           FROM promoter_performance pp
           LEFT JOIN eventos e ON pp.evento_id = e.id
           WHERE pp.promoter_id = $1
           ORDER BY pp.data_evento DESC
           LIMIT 10`,
          [id]
        );
        
        // Buscar alertas não lidos
        const alertasResult = await pool.query(
          `SELECT 
            pa.*,
            e.nome_do_evento as evento_nome
           FROM promoter_alertas pa
           LEFT JOIN eventos e ON pa.evento_id = e.id
           WHERE pa.promoter_id = $1 AND pa.lido = FALSE
           ORDER BY pa.prioridade DESC, pa.created_at DESC`,
          [id]
        );
        
        // Buscar listas ativas
        const listasResult = await pool.query(
          `SELECT 
            l.*,
            e.nome_do_evento as evento_nome,
            e.data_do_evento,
            COUNT(lc.lista_convidado_id) as total_convidados,
            SUM(CASE WHEN lc.status_checkin = 'Check-in' THEN 1 ELSE 0 END) as checkins
           FROM listas l
           LEFT JOIN eventos e ON l.evento_id = e.id
           LEFT JOIN listas_convidados lc ON l.lista_id = lc.lista_id
           WHERE l.promoter_responsavel_id = $1
           GROUP BY l.lista_id, l.evento_id, l.promoter_responsavel_id, l.nome, l.tipo, l.observacoes, l.criado_em, e.nome_do_evento, e.data_do_evento
           ORDER BY e.data_do_evento DESC`,
          [id]
        );
        
        // Buscar convites ativos
        const convitesResult = await pool.query(
          `SELECT 
            pc.*,
            e.nome_do_evento as evento_nome
           FROM promoter_convites pc
           LEFT JOIN eventos e ON pc.evento_id = e.id
           WHERE pc.promoter_id = $1 AND pc.ativo = TRUE
           ORDER BY pc.created_at DESC`,
          [id]
        );
        
        res.json({
          success: true,
          promoter: {
            ...promoter,
            condicoes: condicoesResult.rows[0] || null,
            permissoes: permissoesResult.rows[0] || null,
            performance: performanceResult.rows,
            alertas: alertasResult.rows,
            listas: listasResult.rows,
            convites: convitesResult.rows
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
      const client = await pool.connect();
      
      try {
        await client.query('BEGIN');
        
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
          await client.query('ROLLBACK').catch(rollbackError => {
            console.error('❌ Erro ao fazer rollback:', rollbackError);
          });
          return res.status(400).json({
            success: false,
            error: 'Nome e email são obrigatórios'
          });
        }
        
        // Verificar se email já existe
        const existingEmailResult = await client.query(
          'SELECT promoter_id FROM promoters WHERE email = $1',
          [email]
        );
        
        if (existingEmailResult.rows.length > 0) {
          await client.query('ROLLBACK').catch(rollbackError => {
            console.error('❌ Erro ao fazer rollback:', rollbackError);
          });
          return res.status(400).json({
            success: false,
            error: 'Email já está em uso por outro promoter'
          });
        }
        
        // Gerar código identificador único se não fornecido
        let finalCodigoIdentificador = codigo_identificador;
        
        if (!finalCodigoIdentificador) {
          // Gerar código baseado no nome e timestamp
          const nomeSlug = nome.toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '') // Remove acentos
            .replace(/[^a-z0-9]/g, '-')
            .replace(/-+/g, '-')
            .substring(0, 20);
          const timestamp = Date.now().toString().slice(-6);
          finalCodigoIdentificador = `${nomeSlug}-${timestamp}`;
        }
        
        // Verificar se código identificador já existe
        const existingCodeResult = await client.query(
          'SELECT promoter_id FROM promoters WHERE codigo_identificador = $1',
          [finalCodigoIdentificador]
        );
        
        if (existingCodeResult.rows.length > 0) {
          // Se existir, adicionar timestamp adicional
          finalCodigoIdentificador = `${finalCodigoIdentificador}-${Date.now().toString().slice(-4)}`;
        }
        
        // Gerar link de convite público
        const frontendUrl = process.env.FRONTEND_URL || 'https://www.agilizaiapp.com.br';
        const linkConviteGerado = `${frontendUrl}/promoter/${finalCodigoIdentificador}`;
        
        console.log('📝 Dados do promoter a serem inseridos:', {
          nome, apelido, email, telefone, whatsapp, 
          codigo: finalCodigoIdentificador, 
          link: linkConviteGerado
        });
        
        // Verificar se a coluna user_id existe na tabela promoters
        let hasUserIdColumn = false;
        try {
          // Tentar verificar em diferentes schemas possíveis
          const columnCheckResult = await client.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'promoters' 
            AND column_name = 'user_id'
            LIMIT 1
          `);
          hasUserIdColumn = columnCheckResult.rows.length > 0;
          console.log('ℹ️ Verificação da coluna user_id:', hasUserIdColumn ? 'existe' : 'não existe');
        } catch (checkError) {
          console.warn('⚠️ Não foi possível verificar se a coluna user_id existe:', checkError.message);
          // Em caso de erro, assumir que não existe para evitar problemas
          hasUserIdColumn = false;
        }
        
        // Criar usuário automaticamente para o promoter (se a coluna user_id existir)
        let userId = null;
        if (hasUserIdColumn) {
          try {
            const defaultPassword = 'Promoter@2025';
            const hashedPassword = await bcrypt.hash(defaultPassword, 10);
            
            // Verificar se já existe um usuário com este email
            const existingUserResult = await client.query(
              'SELECT id FROM users WHERE email = $1',
              [email]
            );
            
            if (existingUserResult.rows.length > 0) {
              // Se o usuário já existe, atualizar para role promoter e senha padrão
              userId = existingUserResult.rows[0].id;
              await client.query(
                `UPDATE users SET 
                  name = $1, 
                  role = 'promoter', 
                  password = $2, 
                  telefone = $3
                WHERE id = $4`,
                [nome, hashedPassword, telefone || null, userId]
              );
              console.log('✅ Usuário existente atualizado para promoter com ID:', userId);
            } else {
              // Criar novo usuário
              const userResult = await client.query(
                `INSERT INTO users (name, email, password, role, telefone)
                 VALUES ($1, $2, $3, 'promoter', $4)
                 RETURNING id`,
                [nome, email, hashedPassword, telefone || null]
              );
              userId = userResult.rows[0].id;
              console.log('✅ Usuário criado automaticamente com ID:', userId);
            }
          } catch (userError) {
            console.error('⚠️ Erro ao criar/atualizar usuário para promoter:', userError.message);
            // Se o erro abortou a transação, fazer rollback e retornar erro
            if (userError.code === '25P02') {
              await client.query('ROLLBACK').catch(rollbackError => {
                console.error('❌ Erro ao fazer rollback:', rollbackError);
              });
              return res.status(500).json({
                success: false,
                error: 'Erro ao criar usuário para o promoter',
                details: userError.message
              });
            }
            // Continuar sem user_id se houver erro na criação do usuário (não crítico)
            userId = null;
          }
        } else {
          console.log('ℹ️ Coluna user_id não existe na tabela promoters, pulando criação de usuário');
        }
        
        // Inserir promoter (com ou sem user_id dependendo da estrutura da tabela)
        // Tratar valores vazios como null e establishment_id 0 como null
        const cleanApelido = apelido && apelido.trim() !== '' ? apelido : null;
        const cleanTelefone = telefone && telefone.trim() !== '' ? telefone : null;
        const cleanWhatsapp = whatsapp && whatsapp.trim() !== '' ? whatsapp : null;
        const cleanObservacoes = observacoes && observacoes.trim() !== '' ? observacoes : null;
        const cleanFotoUrl = foto_url && foto_url.trim() !== '' ? foto_url : null;
        const cleanInstagram = instagram && instagram.trim() !== '' ? instagram : null;
        const cleanEstablishmentId = establishment_id && establishment_id !== 0 ? establishment_id : null;
        
        let result;
        try {
          if (hasUserIdColumn) {
            // Se a coluna existe, sempre incluir (mesmo que seja NULL)
            result = await client.query(
              `INSERT INTO promoters (
                nome, apelido, email, telefone, whatsapp, codigo_identificador, 
                tipo_categoria, comissao_percentual, link_convite, observacoes,
                establishment_id, foto_url, instagram, data_cadastro, status, ativo, user_id
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, CURRENT_DATE, 'Ativo', TRUE, $14) RETURNING promoter_id`,
              [
                nome, 
                cleanApelido, 
                email, 
                cleanTelefone, 
                cleanWhatsapp, 
                finalCodigoIdentificador,
                tipo_categoria || 'Standard', 
                comissao_percentual !== undefined && comissao_percentual !== null ? comissao_percentual : 0, 
                linkConviteGerado, 
                cleanObservacoes,
                cleanEstablishmentId, 
                cleanFotoUrl, 
                cleanInstagram, 
                userId
              ]
            );
          } else {
            // Se a coluna não existe, não incluir na query
            result = await client.query(
              `INSERT INTO promoters (
                nome, apelido, email, telefone, whatsapp, codigo_identificador, 
                tipo_categoria, comissao_percentual, link_convite, observacoes,
                establishment_id, foto_url, instagram, data_cadastro, status, ativo
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, CURRENT_DATE, 'Ativo', TRUE) RETURNING promoter_id`,
              [
                nome, 
                cleanApelido, 
                email, 
                cleanTelefone, 
                cleanWhatsapp, 
                finalCodigoIdentificador,
                tipo_categoria || 'Standard', 
                comissao_percentual !== undefined && comissao_percentual !== null ? comissao_percentual : 0, 
                linkConviteGerado, 
                cleanObservacoes,
                cleanEstablishmentId, 
                cleanFotoUrl, 
                cleanInstagram
              ]
            );
          }
        } catch (insertError) {
          console.error('❌ Erro ao inserir promoter:', insertError);
          console.error('❌ Detalhes do erro de INSERT:', {
            message: insertError.message,
            code: insertError.code,
            constraint: insertError.constraint,
            column: insertError.column,
            detail: insertError.detail
          });
          await client.query('ROLLBACK').catch(rollbackError => {
            console.error('❌ Erro ao fazer rollback:', rollbackError);
          });
          return res.status(500).json({
            success: false,
            error: 'Erro ao criar promoter',
            details: insertError.message,
            code: insertError.code,
            constraint: insertError.constraint,
            column: insertError.column
          });
        }
        
        const promoterId = result.rows[0].promoter_id;
        console.log('✅ Promoter criado com ID:', promoterId, 'vinculado ao usuário:', userId);
        
        console.log('📝 Inserindo condições:', {
          max_convidados_por_evento, max_convidados_por_data,
          quota_mesas, quota_entradas, entradas_gratuitas,
          desconto_especial_percentual, valor_minimo_consumo
        });
        
        // Inserir condições padrão
        try {
          await client.query(
            `INSERT INTO promoter_condicoes (
              promoter_id, max_convidados_por_evento, max_convidados_por_data,
              quota_mesas, quota_entradas, entradas_gratuitas, desconto_especial_percentual,
              valor_minimo_consumo, horario_checkin_inicio, horario_checkin_fim,
              politica_no_show, pode_reservar_mesas_vip, pode_selecionar_areas, 
              areas_permitidas, mesas_reservadas, ativo
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, TRUE)`,
            [
              promoterId, 
              max_convidados_por_evento !== undefined && max_convidados_por_evento !== null ? max_convidados_por_evento : null, 
              max_convidados_por_data !== undefined && max_convidados_por_data !== null ? max_convidados_por_data : null,
              quota_mesas !== undefined && quota_mesas !== null ? quota_mesas : null, 
              quota_entradas !== undefined && quota_entradas !== null ? quota_entradas : null, 
              entradas_gratuitas !== undefined && entradas_gratuitas !== null ? entradas_gratuitas : null, 
              desconto_especial_percentual !== undefined && desconto_especial_percentual !== null ? desconto_especial_percentual : null,
              valor_minimo_consumo !== undefined && valor_minimo_consumo !== null ? valor_minimo_consumo : null, 
              horario_checkin_inicio || null, 
              horario_checkin_fim || null,
              politica_no_show || null, 
              pode_reservar_mesas_vip !== undefined ? (pode_reservar_mesas_vip ? true : false) : false, 
              pode_selecionar_areas !== undefined ? (pode_selecionar_areas ? true : false) : false,
              areas_permitidas ? JSON.stringify(areas_permitidas) : null,
              mesas_reservadas ? JSON.stringify(mesas_reservadas) : null
            ]
          );
          console.log('✅ Condições inseridas');
        } catch (condicoesError) {
          console.error('❌ Erro ao inserir condições:', condicoesError);
          console.error('❌ Detalhes do erro de condições:', {
            message: condicoesError.message,
            code: condicoesError.code,
            constraint: condicoesError.constraint,
            column: condicoesError.column
          });
          // Se o erro abortou a transação, fazer rollback e retornar erro
          if (condicoesError.code === '25P02') {
            await client.query('ROLLBACK').catch(rollbackError => {
              console.error('❌ Erro ao fazer rollback:', rollbackError);
            });
            return res.status(500).json({
              success: false,
              error: 'Erro ao criar condições do promoter',
              details: condicoesError.message
            });
          }
          // Continuar mesmo se houver erro nas condições (não é crítico)
          console.warn('⚠️ Continuando sem condições, promoter será criado sem elas');
        }
        
        // Inserir permissões padrão
        console.log('📝 Inserindo permissões...');
        try {
          await client.query(
            `INSERT INTO promoter_permissoes (
              promoter_id, pode_ver_lista_convidados, pode_adicionar_convidados,
              pode_remover_convidados, pode_gerar_link_convite, pode_gerar_qr_code,
              pode_ver_historico, pode_ver_relatorios, pode_ultrapassar_limites,
              pode_aprovar_convidados_extra, pode_editar_eventos, pode_criar_eventos
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
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
          console.log('✅ Permissões inseridas');
        } catch (permissoesError) {
          console.error('❌ Erro ao inserir permissões:', permissoesError);
          console.error('❌ Detalhes do erro de permissões:', {
            message: permissoesError.message,
            code: permissoesError.code,
            constraint: permissoesError.constraint,
            column: permissoesError.column
          });
          // Se o erro abortou a transação, fazer rollback e retornar erro
          if (permissoesError.code === '25P02') {
            await client.query('ROLLBACK').catch(rollbackError => {
              console.error('❌ Erro ao fazer rollback:', rollbackError);
            });
            return res.status(500).json({
              success: false,
              error: 'Erro ao criar permissões do promoter',
              details: permissoesError.message
            });
          }
          // Continuar mesmo se houver erro nas permissões (não é crítico)
          console.warn('⚠️ Continuando sem permissões, promoter será criado sem elas');
        }
        
        await client.query('COMMIT');
        console.log('✅ Transaction committed com sucesso');
        
        res.status(201).json({
          success: true,
          message: 'Promoter criado com sucesso',
          promoter_id: promoterId,
          codigo_identificador: finalCodigoIdentificador,
          link_convite: linkConviteGerado
        });
        
      } catch (error) {
        await client.query('ROLLBACK').catch(rollbackError => {
          console.error('❌ Erro ao fazer rollback:', rollbackError);
        });
        console.error('❌ Erro ao criar promoter:', error);
        console.error('❌ Stack trace:', error.stack);
        console.error('❌ Dados recebidos:', JSON.stringify(req.body, null, 2));
        console.error('❌ Código do erro:', error.code);
        console.error('❌ Detalhes do erro:', error.detail);
        console.error('❌ Constraint violada:', error.constraint);
        
        // Retornar mensagem de erro mais detalhada
        let errorMessage = 'Erro ao criar promoter';
        if (error.code === '23505') { // Unique violation
          errorMessage = 'Já existe um promoter com este email ou código identificador';
        } else if (error.code === '23503') { // Foreign key violation
          errorMessage = 'Erro de referência: verifique se o estabelecimento existe';
        } else if (error.code === '23502') { // Not null violation
          errorMessage = `Campo obrigatório não informado: ${error.column || 'desconhecido'}`;
        } else if (error.message) {
          errorMessage = error.message;
        }
        
        res.status(500).json({
          success: false,
          error: errorMessage,
          details: error.message,
          code: error.code,
          constraint: error.constraint,
          column: error.column,
          stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
      } finally {
        client.release();
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
        const promotersResult = await pool.query(
          'SELECT promoter_id FROM promoters WHERE promoter_id = $1',
          [id]
        );
        
        if (promotersResult.rows.length === 0) {
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
        let paramIndex = 1;
        
        allowedFields.forEach(field => {
          if (updateData[field] !== undefined) {
            updateFields.push(`${field} = $${paramIndex++}`);
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
        
        await pool.query(
          `UPDATE promoters SET ${updateFields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE promoter_id = $${paramIndex}`,
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
   * @route   DELETE /api/v1/promoters/:id
   * @desc    Exclui um promoter
   * @access  Private (Admin, Gerente)
   */
  router.delete(
    '/:id',
    authenticateToken,
    authorizeRoles('admin', 'gerente'),
    async (req, res) => {
      const client = await pool.connect();
      
      try {
        await client.query('BEGIN');
        
        const { id } = req.params;
        
        // Verificar se promoter existe
        const promotersResult = await client.query(
          'SELECT promoter_id, nome FROM promoters WHERE promoter_id = $1',
          [id]
        );
        
        if (promotersResult.rows.length === 0) {
          await client.query('ROLLBACK');
          return res.status(404).json({
            success: false,
            error: 'Promoter não encontrado'
          });
        }
        
        const promoter = promotersResult.rows[0];
        console.log(`🗑️ Excluindo promoter: ${promoter.nome} (ID: ${id})`);
        
        // Verificar se há relacionamentos que impedem a exclusão
        // Verificar listas ativas
        const listasResult = await client.query(
          'SELECT COUNT(*) as total FROM listas WHERE promoter_responsavel_id = $1',
          [id]
        );
        
        if (parseInt(listasResult.rows[0].total) > 0) {
          await client.query('ROLLBACK');
          return res.status(400).json({
            success: false,
            error: 'Não é possível excluir promoter com listas associadas. Remova as listas primeiro.'
          });
        }
        
        // Excluir condições do promoter
        await client.query(
          'DELETE FROM promoter_condicoes WHERE promoter_id = $1',
          [id]
        );
        
        // Excluir permissões do promoter
        await client.query(
          'DELETE FROM promoter_permissoes WHERE promoter_id = $1',
          [id]
        );
        
        // Excluir relacionamentos promoter-eventos
        await client.query(
          'DELETE FROM promoter_eventos WHERE promoter_id = $1',
          [id]
        );
        
        // Excluir convidados do promoter
        await client.query(
          'DELETE FROM promoter_convidados WHERE promoter_id = $1',
          [id]
        );
        
        // Excluir performance do promoter
        await client.query(
          'DELETE FROM promoter_performance WHERE promoter_id = $1',
          [id]
        );
        
        // Excluir alertas do promoter
        await client.query(
          'DELETE FROM promoter_alertas WHERE promoter_id = $1',
          [id]
        );
        
        // Excluir convites do promoter
        await client.query(
          'DELETE FROM promoter_convites WHERE promoter_id = $1',
          [id]
        );
        
        // Excluir o promoter
        await client.query(
          'DELETE FROM promoters WHERE promoter_id = $1',
          [id]
        );
        
        await client.query('COMMIT');
        console.log(`✅ Promoter ${promoter.nome} excluído com sucesso`);
        
        res.json({
          success: true,
          message: 'Promoter excluído com sucesso'
        });
        
      } catch (error) {
        await client.query('ROLLBACK').catch(rollbackError => {
          console.error('❌ Erro ao fazer rollback:', rollbackError);
        });
        console.error('❌ Erro ao excluir promoter:', error);
        res.status(500).json({
          success: false,
          error: 'Erro ao excluir promoter',
          details: error.message
        });
      } finally {
        client.release();
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
        const promotersResult = await pool.query(
          'SELECT promoter_id FROM promoters WHERE promoter_id = $1',
          [id]
        );
        
        if (promotersResult.rows.length === 0) {
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
        let paramIndex = 1;
        
        allowedFields.forEach(field => {
          if (condicoes[field] !== undefined) {
            if (field === 'areas_permitidas' || field === 'mesas_reservadas') {
              updateFields.push(`${field} = $${paramIndex++}`);
              updateValues.push(condicoes[field] ? JSON.stringify(condicoes[field]) : null);
            } else {
              updateFields.push(`${field} = $${paramIndex++}`);
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
        const existingResult = await pool.query(
          'SELECT condicao_id FROM promoter_condicoes WHERE promoter_id = $1',
          [id]
        );
        
        if (existingResult.rows.length > 0) {
          // Atualizar existente
          await pool.query(
            `UPDATE promoter_condicoes SET ${updateFields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE promoter_id = $${paramIndex}`,
            updateValues
          );
        } else {
          // Inserir novo
          updateValues.pop(); // Remove o id do final
          updateValues.unshift(id); // Adiciona o id no início
          
          const fieldsToInsert = allowedFields.filter(field => condicoes[field] !== undefined);
          const placeholders = fieldsToInsert.map((_, idx) => `$${idx + 2}`).join(', ');
          
          await pool.query(
            `INSERT INTO promoter_condicoes (promoter_id, ${fieldsToInsert.join(', ')}, ativo) VALUES ($1, ${placeholders}, TRUE)`,
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
        const promotersResult = await pool.query(
          'SELECT promoter_id FROM promoters WHERE promoter_id = $1',
          [id]
        );
        
        if (promotersResult.rows.length === 0) {
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
        let paramIndex = 1;
        
        allowedFields.forEach(field => {
          if (permissoes[field] !== undefined) {
            updateFields.push(`${field} = $${paramIndex++}`);
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
        const existingResult = await pool.query(
          'SELECT permissao_id FROM promoter_permissoes WHERE promoter_id = $1',
          [id]
        );
        
        if (existingResult.rows.length > 0) {
          // Atualizar existente
          await pool.query(
            `UPDATE promoter_permissoes SET ${updateFields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE promoter_id = $${paramIndex}`,
            updateValues
          );
        } else {
          // Inserir novo
          updateValues.pop(); // Remove o id do final
          updateValues.unshift(id); // Adiciona o id no início
          
          const fieldsToInsert = allowedFields.filter(field => permissoes[field] !== undefined);
          const placeholders = fieldsToInsert.map((_, idx) => `$${idx + 2}`).join(', ');
          
          await pool.query(
            `INSERT INTO promoter_permissoes (promoter_id, ${fieldsToInsert.join(', ')}) VALUES ($1, ${placeholders})`,
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
        const promotersResult = await pool.query(
          'SELECT nome FROM promoters WHERE promoter_id = $1',
          [id]
        );
        
        if (promotersResult.rows.length === 0) {
          return res.status(404).json({
            success: false,
            error: 'Promoter não encontrado'
          });
        }
        
        // Buscar performance do período
        const periodoDays = parseInt(periodo) || 30;
        const performanceResult = await pool.query(
          `SELECT 
            pp.*,
            e.nome_do_evento as evento_nome,
            e.data_do_evento,
            pl.name as establishment_name
           FROM promoter_performance pp
           LEFT JOIN eventos e ON pp.evento_id = e.id
           LEFT JOIN places pl ON e.id_place = pl.id
           WHERE pp.promoter_id = $1 
           AND pp.data_evento >= CURRENT_DATE - INTERVAL $2
           ORDER BY pp.data_evento DESC`,
          [id, `${periodoDays} days`]
        );
        
        // Calcular estatísticas gerais
        const statsResult = await pool.query(
          `SELECT 
            COUNT(*) as total_eventos,
            AVG(taxa_comparecimento) as media_taxa_comparecimento,
            SUM(receita_gerada) as receita_total,
            SUM(consumacao_total) as consumacao_total,
            SUM(entradas_vendidas) as entradas_vendidas,
            SUM(comissao_calculada) as comissao_total
           FROM promoter_performance 
           WHERE promoter_id = $1 
           AND data_evento >= CURRENT_DATE - INTERVAL $2`,
          [id, `${periodoDays} days`]
        );
        
        res.json({
          success: true,
          promoter: promotersResult.rows[0],
          performance: performanceResult.rows,
          estatisticas: statsResult.rows[0] || {
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
        
        const periodoDays = parseInt(periodo) || 30;
        const rankingResult = await pool.query(
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
           WHERE pp.data_evento >= CURRENT_DATE - INTERVAL $1
           AND p.status::TEXT = 'Ativo' AND p.ativo = TRUE
           GROUP BY p.promoter_id, p.nome, p.tipo_categoria
           ORDER BY receita_total DESC, media_taxa_comparecimento DESC
           LIMIT $2`,
          [`${periodoDays} days`, parseInt(limite) || 10]
        );
        const ranking = rankingResult.rows;
        
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
        const promotersResult = await pool.query(
          'SELECT nome FROM promoters WHERE promoter_id = $1',
          [id]
        );
        
        if (promotersResult.rows.length === 0) {
          return res.status(404).json({
            success: false,
            error: 'Promoter não encontrado'
          });
        }
        
        // Gerar código único
        const codigo_convite = `PROMO${id}_${Date.now()}`;
        const link_convite = `${process.env.FRONTEND_URL || 'https://www.agilizaiapp.com.br'}/convite/${codigo_convite}`;
        
        // Inserir convite
        const result = await pool.query(
          `INSERT INTO promoter_convites (
            promoter_id, evento_id, codigo_convite, link_convite, 
            max_usos, data_expiracao, observacoes, ativo
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE) RETURNING convite_id`,
          [id, evento_id, codigo_convite, link_convite, max_usos, data_expiracao, observacoes]
        );
        
        res.status(201).json({
          success: true,
          message: 'Convite gerado com sucesso',
          convite: {
            convite_id: result.rows[0].convite_id,
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
            e.nome_do_evento as evento_nome
           FROM promoter_alertas pa
           LEFT JOIN eventos e ON pa.evento_id = e.id
           WHERE pa.promoter_id = $1
        `;
        
        const params = [id];
        let paramIndex = 2;
        
        if (lido !== undefined) {
          query += ` AND pa.lido = $${paramIndex++}`;
          params.push(lido === 'true');
        }
        
        if (prioridade) {
          query += ` AND pa.prioridade = $${paramIndex++}`;
          params.push(prioridade);
        }
        
        query += ` ORDER BY pa.prioridade DESC, pa.created_at DESC LIMIT $${paramIndex++}`;
        params.push(parseInt(limite));
        
        const alertasResult = await pool.query(query, params);
        const alertas = alertasResult.rows;
        
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
        
        await pool.query(
          'UPDATE promoter_alertas SET lido = TRUE, data_leitura = NOW() WHERE alerta_id = $1',
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

  /**
   * @route   PUT /api/v1/promoters/:id/reset-password
   * @desc    Reseta a senha de um promoter para o padrão
   * @access  Private (Admin, Gerente)
   */
  router.put(
    '/:id/reset-password',
    authenticateToken,
    authorizeRoles('admin', 'gerente'),
    async (req, res) => {
      const client = await pool.connect();
      
      try {
        await client.query('BEGIN');
        
        const { id } = req.params;
        const { password } = req.body; // Senha opcional, padrão: Promoter@2025
        
        // Verificar se promoter existe
        const promotersResult = await client.query(
          'SELECT promoter_id, nome, email FROM promoters WHERE promoter_id = $1',
          [id]
        );
        
        if (promotersResult.rows.length === 0) {
          await client.query('ROLLBACK');
          return res.status(404).json({
            success: false,
            error: 'Promoter não encontrado'
          });
        }
        
        const promoter = promotersResult.rows[0];
        const newPassword = password || 'Promoter@2025';
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        
        // Verificar se existe usuário com este email
        const userResult = await client.query(
          'SELECT id FROM users WHERE email = $1',
          [promoter.email]
        );
        
        if (userResult.rows.length === 0) {
          // Criar novo usuário
          const tempCpf = `00000000${String(promoter.promoter_id).padStart(3, '0')}`;
          const newUserResult = await client.query(
            `INSERT INTO users (name, email, password, role, cpf)
             VALUES ($1, $2, $3, 'promoter', $4)
             RETURNING id`,
            [promoter.nome, promoter.email, hashedPassword, tempCpf]
          );
          
          const userId = newUserResult.rows[0].id;
          
          // Vincular user_id ao promoter se a coluna existir
          try {
            const columnCheck = await client.query(
              `SELECT column_name 
               FROM information_schema.columns 
               WHERE table_name = 'promoters' 
               AND column_name = 'user_id'
               LIMIT 1`
            );
            
            if (columnCheck.rows.length > 0) {
              await client.query(
                'UPDATE promoters SET user_id = $1 WHERE promoter_id = $2',
                [userId, promoter.promoter_id]
              );
            }
          } catch (e) {
            // Coluna não existe, continuar
          }
          
          await client.query('COMMIT');
          
          return res.json({
            success: true,
            message: 'Usuário criado e senha definida com sucesso',
            user_id: userId
          });
        } else {
          // Atualizar senha do usuário existente
          const userId = userResult.rows[0].id;
          
          await client.query(
            'UPDATE users SET password = $1, role = $2 WHERE id = $3',
            [hashedPassword, 'promoter', userId]
          );
          
          await client.query('COMMIT');
          
          return res.json({
            success: true,
            message: 'Senha resetada com sucesso',
            user_id: userId
          });
        }
        
      } catch (error) {
        await client.query('ROLLBACK').catch(rollbackError => {
          console.error('❌ Erro ao fazer rollback:', rollbackError);
        });
        console.error('❌ Erro ao resetar senha do promoter:', error);
        res.status(500).json({
          success: false,
          error: 'Erro ao resetar senha do promoter',
          details: error.message
        });
      } finally {
        client.release();
      }
    }
  );

  /**
   * @route   GET /api/v1/promoters/:id/convidados
   * @desc    Busca todos os convidados de um promoter específico
   * @access  Private (Admin, Gerente)
   */
  router.get(
    '/:id/convidados',
    authenticateToken,
    authorizeRoles('admin', 'gerente'),
    async (req, res) => {
      try {
        const { id } = req.params;
        const { evento_id, data_evento, status } = req.query;
        
        let query = `
          SELECT 
            c.id as convidado_id,
            c.nome,
            c.whatsapp as telefone,
            c.whatsapp,
            c.status,
            c.checkin_realizado,
            c.created_at as data_cadastro,
            e.id as evento_id,
            e.nome_do_evento as evento_nome,
            e.data_do_evento,
            e.hora_do_evento,
            p.nome as promoter_nome,
            p.codigo_identificador as promoter_codigo
          FROM promoter_convidados c
          LEFT JOIN eventos e ON c.evento_id = e.id
          LEFT JOIN promoters p ON c.promoter_id = p.promoter_id
          WHERE c.promoter_id = $1
        `;
        
        const params = [id];
        let paramIndex = 2;
        
        if (evento_id) {
          query += ` AND c.evento_id = $${paramIndex++}`;
          params.push(evento_id);
        }
        
        if (data_evento) {
          query += ` AND e.data_do_evento = $${paramIndex++}`;
          params.push(data_evento);
        }
        
        if (status) {
          query += ` AND c.status = $${paramIndex++}`;
          params.push(status);
        }
        
        query += ` ORDER BY e.data_do_evento DESC, c.created_at DESC`;
        
        const convidadosResult = await pool.query(query, params);
        const convidados = convidadosResult.rows;
        
        res.json({
          success: true,
          convidados
        });
        
      } catch (error) {
        console.error('❌ Erro ao buscar convidados do promoter:', error);
        res.status(500).json({
          success: false,
          error: 'Erro ao buscar convidados do promoter'
        });
      }
    }
  );

  return router;
};