// routes/giftRules.js
// Sistema de Gerenciamento de Regras de Brindes

const express = require('express');
const auth = require('../middleware/auth');

/**
 * Função auxiliar para verificar e liberar brindes para uma guest list
 * Exportada separadamente para uso em outras rotas
 */
const createCheckAndAwardGifts = (pool) => {
  return async (guestListId) => {
    try {
      // 1. Buscar informações da guest list e reserva
      const guestListResult = await pool.query(`
        SELECT 
          gl.id,
          gl.reservation_id,
          gl.reservation_type,
          COALESCE(rr.establishment_id, lr.establishment_id) as establishment_id,
          COALESCE(rr.evento_id, lr.evento_id) as evento_id,
          COALESCE(rr.reservation_date, lr.reservation_date) as reservation_date,
          COUNT(g.id) FILTER (WHERE g.checked_in = TRUE) as checkins_count
        FROM guest_lists gl
        LEFT JOIN restaurant_reservations rr ON gl.reservation_id = rr.id AND gl.reservation_type = 'restaurant'
        LEFT JOIN large_reservations lr ON gl.reservation_id = lr.id AND gl.reservation_type = 'large'
        LEFT JOIN guests g ON gl.id = g.guest_list_id
        WHERE gl.id = $1
        GROUP BY gl.id, gl.reservation_id, gl.reservation_type, rr.establishment_id, rr.evento_id, rr.reservation_date, lr.establishment_id, lr.evento_id, lr.reservation_date
      `, [guestListId]);

      if (guestListResult.rows.length === 0) {
        return { success: false, message: 'Guest list não encontrada' };
      }

      const guestList = guestListResult.rows[0];
      const establishmentId = guestList.establishment_id;
      const eventoId = guestList.evento_id;
      const checkinsCount = parseInt(guestList.checkins_count || 0);

      if (!establishmentId) {
        return { success: false, message: 'Estabelecimento não encontrado' };
      }

      // 2. Buscar regras ativas para este estabelecimento/evento (apenas ANIVERSARIO)
      let rulesQuery = `
        SELECT id, descricao, checkins_necessarios, status
        FROM gift_rules
        WHERE establishment_id = $1
        AND status = 'ATIVA'
        AND tipo_beneficiario = 'ANIVERSARIO'
        AND (evento_id = $2 OR evento_id IS NULL)
        ORDER BY checkins_necessarios ASC
      `;
      const rulesParams = [establishmentId, eventoId];

      const rulesResult = await pool.query(rulesQuery, rulesParams);
      const rules = rulesResult.rows;

      if (rules.length === 0) {
        return { success: true, message: 'Nenhuma regra de brinde encontrada', gifts: [] };
      }

      // 3. Verificar quais regras foram atingidas e ainda não foram liberadas
      const giftsAwarded = [];
      for (const rule of rules) {
        if (checkinsCount >= rule.checkins_necessarios) {
          // Verificar se já foi liberado
          const existingGiftResult = await pool.query(`
            SELECT id, status 
            FROM guest_list_gifts 
            WHERE guest_list_id = $1 AND gift_rule_id = $2 AND status != 'CANCELADO'
          `, [guestListId, rule.id]);

          if (existingGiftResult.rows.length === 0) {
            // Liberar o brinde
            await pool.query(`
              INSERT INTO guest_list_gifts (guest_list_id, gift_rule_id, status, checkins_count)
              VALUES ($1, $2, 'LIBERADO', $3)
            `, [guestListId, rule.id, checkinsCount]);
            giftsAwarded.push({
              id: rule.id,
              descricao: rule.descricao,
              checkins_necessarios: rule.checkins_necessarios
            });
          }
        }
      }

      return { 
        success: true, 
        gifts: giftsAwarded,
        checkins_count: checkinsCount
      };
    } catch (error) {
      console.error('Erro ao verificar brindes:', error);
      return { success: false, message: 'Erro ao verificar brindes' };
    }
  };
};

/**
 * Função auxiliar para verificar e liberar brindes para um promoter
 */
const createCheckAndAwardPromoterGifts = (pool) => {
  return async (promoterId, eventoId) => {
    try {
      // 1. Buscar informações do promoter e evento (check-ins apenas do dia específico do evento)
      const promoterResult = await pool.query(`
        SELECT 
          p.promoter_id,
          pe.evento_id,
          e.id_place as establishment_id,
          e.data_do_evento,
          COUNT(DISTINCT lc.lista_convidado_id) FILTER (
            WHERE lc.status_checkin = 'Check-in' 
            AND lc.data_checkin IS NOT NULL 
            AND (e.data_do_evento IS NULL OR lc.data_checkin::DATE = e.data_do_evento::DATE)
          ) as checkins_count
        FROM promoters p
        INNER JOIN promoter_eventos pe ON p.promoter_id = pe.promoter_id
        INNER JOIN eventos e ON pe.evento_id = e.id
        LEFT JOIN listas l ON l.promoter_responsavel_id = p.promoter_id AND l.evento_id = pe.evento_id
        LEFT JOIN listas_convidados lc ON l.lista_id = lc.lista_id
        WHERE p.promoter_id = $1 AND pe.evento_id = $2
        GROUP BY p.promoter_id, pe.evento_id, e.id_place, e.data_do_evento
      `, [promoterId, eventoId]);

      if (promoterResult.rows.length === 0) {
        return { success: false, message: 'Promoter não encontrado ou não vinculado ao evento' };
      }

      const promoterData = promoterResult.rows[0];
      const establishmentId = promoterData.establishment_id;
      const checkinsCount = parseInt(promoterData.checkins_count || 0);

      if (!establishmentId) {
        return { success: false, message: 'Estabelecimento não encontrado' };
      }

      // 2. Buscar regras ativas para este estabelecimento/evento/promoter (apenas PROMOTER)
      // Priorizar regras específicas do promoter, depois regras gerais (promoter_id IS NULL)
      let rulesQuery = `
        SELECT id, descricao, checkins_necessarios, status, promoter_id
        FROM gift_rules
        WHERE establishment_id = $1
        AND status = 'ATIVA'
        AND tipo_beneficiario = 'PROMOTER'
        AND (evento_id = $2 OR evento_id IS NULL)
        AND (promoter_id = $3 OR promoter_id IS NULL)
        ORDER BY 
          CASE WHEN promoter_id = $3 THEN 0 ELSE 1 END,  -- Regras específicas primeiro
          checkins_necessarios ASC
      `;
      const rulesParams = [establishmentId, eventoId, promoterId];

      const rulesResult = await pool.query(rulesQuery, rulesParams);
      const rules = rulesResult.rows;

      if (rules.length === 0) {
        return { success: true, message: 'Nenhuma regra de brinde encontrada', gifts: [] };
      }

      // 3. Verificar quais regras foram atingidas e ainda não foram liberadas
      const giftsAwarded = [];
      for (const rule of rules) {
        if (checkinsCount >= rule.checkins_necessarios) {
          // Verificar se já foi liberado
          const existingGiftResult = await pool.query(`
            SELECT id, status 
            FROM promoter_gifts 
            WHERE promoter_id = $1 AND evento_id = $2 AND gift_rule_id = $3 AND status != 'CANCELADO'
          `, [promoterId, eventoId, rule.id]);

          if (existingGiftResult.rows.length === 0) {
            // Liberar o brinde
            await pool.query(`
              INSERT INTO promoter_gifts (promoter_id, evento_id, gift_rule_id, status, checkins_count)
              VALUES ($1, $2, $3, 'LIBERADO', $4)
            `, [promoterId, eventoId, rule.id, checkinsCount]);
            giftsAwarded.push({
              id: rule.id,
              descricao: rule.descricao,
              checkins_necessarios: rule.checkins_necessarios
            });
          }
        }
      }

      return { 
        success: true, 
        gifts: giftsAwarded,
        checkins_count: checkinsCount
      };
    } catch (error) {
      console.error('Erro ao verificar brindes de promoter:', error);
      return { success: false, message: 'Erro ao verificar brindes de promoter' };
    }
  };
};

module.exports = (pool) => {
  const router = express.Router();
  const checkAndAwardGifts = createCheckAndAwardGifts(pool);
  const checkAndAwardPromoterGifts = createCheckAndAwardPromoterGifts(pool);

  /**
   * @route   GET /api/gift-rules
   * @desc    Lista regras de brindes
   * @access  Private
   */
  router.get('/', auth, async (req, res) => {
    try {
      const { establishment_id, evento_id, tipo_beneficiario } = req.query;
      
      // Verificar se a tabela existe primeiro
      try {
        await pool.query('SELECT 1 FROM gift_rules LIMIT 1');
      } catch (tableError) {
        if (tableError.code === '42P01') {
          console.error('❌ Tabela gift_rules não existe! Execute a migração SQL primeiro.');
          return res.status(500).json({ 
            success: false, 
            error: 'Tabela gift_rules não encontrada. Execute a migração SQL: migrations/create_gift_rules_system_postgresql.sql',
            code: 'TABLE_NOT_FOUND'
          });
        }
        throw tableError;
      }
      
      let query = 'SELECT * FROM gift_rules WHERE 1=1';
      const params = [];
      let paramIndex = 1;

      if (establishment_id) {
        query += ` AND establishment_id = $${paramIndex++}`;
        params.push(establishment_id);
      }

      if (evento_id !== undefined) {
        query += ` AND (evento_id = $${paramIndex++} OR evento_id IS NULL)`;
        params.push(evento_id);
      }

      // Filtrar por tipo_beneficiario se fornecido
      if (tipo_beneficiario) {
        query += ` AND tipo_beneficiario = $${paramIndex++}`;
        params.push(tipo_beneficiario);
      } else {
        // Por padrão, se não especificado, retorna apenas ANIVERSARIO (compatibilidade com código existente)
        query += ` AND (tipo_beneficiario = 'ANIVERSARIO' OR tipo_beneficiario IS NULL)`;
      }

      // Filtrar por promoter_id se fornecido
      if (req.query.promoter_id !== undefined) {
        const promoterId = req.query.promoter_id;
        if (promoterId === null || promoterId === 'null' || promoterId === '') {
          // Buscar apenas regras gerais (promoter_id IS NULL)
          query += ` AND promoter_id IS NULL`;
        } else {
          // Buscar regras específicas do promoter OU regras gerais
          query += ` AND (promoter_id = $${paramIndex++} OR promoter_id IS NULL)`;
          params.push(promoterId);
          // Ordenar para que regras específicas apareçam primeiro
          query += ' ORDER BY CASE WHEN promoter_id IS NOT NULL THEN 0 ELSE 1 END, checkins_necessarios ASC';
        }
      } else {
        query += ' ORDER BY checkins_necessarios ASC';
      }

      const result = await pool.query(query, params);
      res.status(200).json({ success: true, rules: result.rows });
    } catch (error) {
      console.error('Erro ao listar regras de brindes:', error);
      console.error('Stack trace:', error.stack);
      res.status(500).json({ 
        success: false, 
        error: 'Erro ao listar regras de brindes',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  });

  /**
   * @route   GET /api/gift-rules/:id
   * @desc    Busca uma regra de brinde específica
   * @access  Private
   */
  router.get('/:id', auth, async (req, res) => {
    try {
      const { id } = req.params;
      const result = await pool.query('SELECT * FROM gift_rules WHERE id = $1', [id]);
      
      if (result.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Regra não encontrada' });
      }

      res.status(200).json({ success: true, rule: result.rows[0] });
    } catch (error) {
      console.error('Erro ao buscar regra de brinde:', error);
      res.status(500).json({ success: false, error: 'Erro ao buscar regra de brinde' });
    }
  });

  /**
   * @route   POST /api/gift-rules
   * @desc    Cria uma nova regra de brinde
   * @access  Private
   */
  router.post('/', auth, async (req, res) => {
    try {
      const { establishment_id, evento_id, descricao, checkins_necessarios, status, tipo_beneficiario, promoter_id, vip_m_limit, vip_f_limit } = req.body;

      if (!establishment_id || !descricao || !checkins_necessarios) {
        return res.status(400).json({ 
          success: false, 
          error: 'establishment_id, descricao e checkins_necessarios são obrigatórios' 
        });
      }

      // tipo_beneficiario padrão é 'ANIVERSARIO' se não fornecido (compatibilidade)
      const beneficiario = tipo_beneficiario || 'ANIVERSARIO';
      
      // Se for regra de promoter e não tiver promoter_id, pode ser regra geral (promoter_id = NULL)
      const promoterIdValue = (beneficiario === 'PROMOTER' && promoter_id) ? parseInt(promoter_id) : null;

      const vipMLimit = typeof vip_m_limit === 'number' ? vip_m_limit : (parseInt(vip_m_limit, 10) || 0);
      const vipFLimit = typeof vip_f_limit === 'number' ? vip_f_limit : (parseInt(vip_f_limit, 10) || 0);

      let result;
      try {
        result = await pool.query(`
          INSERT INTO gift_rules (establishment_id, evento_id, descricao, checkins_necessarios, status, tipo_beneficiario, promoter_id, vip_m_limit, vip_f_limit)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          RETURNING *
        `, [
          establishment_id, evento_id || null, descricao, parseInt(checkins_necessarios), status || 'ATIVA',
          beneficiario, promoterIdValue, vipMLimit, vipFLimit
        ]);
      } catch (insertErr) {
        if (insertErr.code === '42703') {
          result = await pool.query(`
            INSERT INTO gift_rules (establishment_id, evento_id, descricao, checkins_necessarios, status, tipo_beneficiario, promoter_id)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING *
          `, [
            establishment_id, evento_id || null, descricao, parseInt(checkins_necessarios), status || 'ATIVA',
            beneficiario, promoterIdValue
          ]);
          result.rows[0].vip_m_limit = vipMLimit;
          result.rows[0].vip_f_limit = vipFLimit;
        } else {
          throw insertErr;
        }
      }

      res.status(201).json({ success: true, rule: result.rows[0] });
    } catch (error) {
      console.error('Erro ao criar regra de brinde:', error);
      console.error('Stack trace:', error.stack);
      console.error('Detalhes do erro:', {
        code: error.code,
        detail: error.detail,
        table: error.table,
        constraint: error.constraint
      });
      res.status(500).json({ 
        success: false, 
        error: 'Erro ao criar regra de brinde',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined,
        hint: error.code === '42P01' ? 'Tabela gift_rules não existe. Execute a migração SQL primeiro.' : undefined
      });
    }
  });

  /**
   * @route   PUT /api/gift-rules/:id
   * @desc    Atualiza uma regra de brinde
   * @access  Private
   */
  router.put('/:id', auth, async (req, res) => {
    try {
      const { id } = req.params;
      const { descricao, checkins_necessarios, status, evento_id, tipo_beneficiario, promoter_id, vip_m_limit, vip_f_limit } = req.body;

      const updates = [];
      const params = [];
      let paramIndex = 1;

      if (descricao !== undefined) {
        updates.push(`descricao = $${paramIndex++}`);
        params.push(descricao);
      }

      if (checkins_necessarios !== undefined) {
        updates.push(`checkins_necessarios = $${paramIndex++}`);
        params.push(parseInt(checkins_necessarios));
      }

      if (tipo_beneficiario !== undefined) {
        updates.push(`tipo_beneficiario = $${paramIndex++}`);
        params.push(tipo_beneficiario);
      }

      if (promoter_id !== undefined) {
        // Se promoter_id for null, 'null', '', ou 0, significa regra geral
        const promoterIdValue = (promoter_id && promoter_id !== 'null' && promoter_id !== '' && promoter_id !== 0) 
          ? parseInt(promoter_id) 
          : null;
        updates.push(`promoter_id = $${paramIndex++}`);
        params.push(promoterIdValue);
      }

      if (status !== undefined) {
        updates.push(`status = $${paramIndex++}`);
        params.push(status);
      }

      if (evento_id !== undefined) {
        updates.push(`evento_id = $${paramIndex++}`);
        params.push(evento_id || null);
      }

      if (vip_m_limit !== undefined) {
        updates.push(`vip_m_limit = $${paramIndex++}`);
        params.push(typeof vip_m_limit === 'number' ? vip_m_limit : (parseInt(vip_m_limit, 10) || 0));
      }

      if (vip_f_limit !== undefined) {
        updates.push(`vip_f_limit = $${paramIndex++}`);
        params.push(typeof vip_f_limit === 'number' ? vip_f_limit : (parseInt(vip_f_limit, 10) || 0));
      }

      if (updates.length === 0) {
        return res.status(400).json({ success: false, error: 'Nenhum campo para atualizar' });
      }

      params.push(id);
      const query = `
        UPDATE gift_rules 
        SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP
        WHERE id = $${params.length}
        RETURNING *
      `;

      const result = await pool.query(query, params);
      
      if (result.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Regra não encontrada' });
      }

      res.status(200).json({ success: true, rule: result.rows[0] });
    } catch (error) {
      console.error('Erro ao atualizar regra de brinde:', error);
      res.status(500).json({ success: false, error: 'Erro ao atualizar regra de brinde' });
    }
  });

  /**
   * @route   DELETE /api/gift-rules/:id
   * @desc    Deleta uma regra de brinde
   * @access  Private
   */
  router.delete('/:id', auth, async (req, res) => {
    try {
      const { id } = req.params;
      const result = await pool.query('DELETE FROM gift_rules WHERE id = $1 RETURNING *', [id]);
      
      if (result.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Regra não encontrada' });
      }

      res.status(200).json({ success: true, message: 'Regra deletada com sucesso' });
    } catch (error) {
      console.error('Erro ao deletar regra de brinde:', error);
      res.status(500).json({ success: false, error: 'Erro ao deletar regra de brinde' });
    }
  });

  /**
   * @route   GET /api/gift-rules/guest-list/:guestListId/gifts
   * @desc    Busca brindes liberados para uma guest list
   * @access  Private
   */
  router.get('/guest-list/:guestListId/gifts', auth, async (req, res) => {
    try {
      const { guestListId } = req.params;
      const result = await pool.query(`
        SELECT 
          glg.*,
          gr.descricao,
          gr.checkins_necessarios
        FROM guest_list_gifts glg
        INNER JOIN gift_rules gr ON glg.gift_rule_id = gr.id
        WHERE glg.guest_list_id = $1
        AND glg.status != 'CANCELADO'
        ORDER BY glg.liberado_em DESC
      `, [guestListId]);

      res.status(200).json({ success: true, gifts: result.rows });
    } catch (error) {
      console.error('Erro ao buscar brindes da guest list:', error);
      res.status(500).json({ success: false, error: 'Erro ao buscar brindes da guest list' });
    }
  });

  /**
   * @route   GET /api/gift-rules/promoter/:promoterId/evento/:eventoId/gifts
   * @desc    Busca brindes liberados, regras e progresso para um promoter em um evento específico
   * @access  Private
   */
  router.get('/promoter/:promoterId/evento/:eventoId/gifts', auth, async (req, res) => {
    try {
      const { promoterId, eventoId } = req.params;
      
      // 1. Buscar brindes liberados
      const giftsResult = await pool.query(`
        SELECT 
          pg.*,
          gr.descricao,
          gr.checkins_necessarios
        FROM promoter_gifts pg
        INNER JOIN gift_rules gr ON pg.gift_rule_id = gr.id
        WHERE pg.promoter_id = $1
        AND pg.evento_id = $2
        AND pg.status != 'CANCELADO'
        ORDER BY pg.liberado_em DESC
      `, [promoterId, eventoId]);

      // 2. Buscar data do evento
      const eventoDataResult = await pool.query(
        `SELECT data_do_evento FROM eventos WHERE id = $1`,
        [eventoId]
      );
      const dataEvento = eventoDataResult.rows[0]?.data_do_evento || null;

      // 3. Contar check-ins do promoter neste evento - apenas do dia específico do evento
      const checkinsResult = await pool.query(`
        SELECT COUNT(DISTINCT lc.lista_convidado_id) as total_checkins
        FROM listas_convidados lc
        INNER JOIN listas l ON lc.lista_id = l.lista_id
        LEFT JOIN promoter_eventos pe ON pe.promoter_id = l.promoter_responsavel_id AND pe.evento_id = $2
        WHERE l.promoter_responsavel_id = $1
        AND (l.evento_id = $2 OR (l.evento_id IS NULL AND pe.evento_id = $2))
        AND lc.status_checkin = 'Check-in'
        AND lc.data_checkin IS NOT NULL
        AND (
          $3::DATE IS NULL
          OR (lc.data_checkin::timestamptz AT TIME ZONE 'America/Sao_Paulo')::DATE = $3::DATE
          OR lc.data_checkin::DATE = $3::DATE
        )
      `, [promoterId, eventoId, dataEvento]);
      
      const checkinsCount = parseInt(checkinsResult.rows[0]?.total_checkins || 0);
      
      // 3. Buscar regras ativas para mostrar progresso
      const eventoResult = await pool.query(`
        SELECT e.id_place as establishment_id
        FROM eventos e
        WHERE e.id = $1
      `, [eventoId]);
      
      let rules = [];
      if (eventoResult.rows.length > 0 && eventoResult.rows[0].establishment_id) {
        const establishmentId = eventoResult.rows[0].establishment_id;
        const rulesResult = await pool.query(`
          SELECT id, descricao, checkins_necessarios, status, promoter_id, vip_m_limit, vip_f_limit
          FROM gift_rules
          WHERE establishment_id = $1
          AND tipo_beneficiario = 'PROMOTER'
          AND status = 'ATIVA'
          AND (evento_id = $2 OR evento_id IS NULL)
          ORDER BY checkins_necessarios ASC
        `, [establishmentId, eventoId]);
        
        rules = rulesResult.rows.map(rule => ({
          ...rule,
          progresso: Math.min(100, (checkinsCount / rule.checkins_necessarios) * 100),
          faltam: Math.max(0, rule.checkins_necessarios - checkinsCount),
          liberado: giftsResult.rows.find(g => g.gift_rule_id === rule.id) !== undefined
        }));
      }

      res.status(200).json({ 
        success: true, 
        gifts: giftsResult.rows,
        checkins_count: checkinsCount,
        rules: rules
      });
    } catch (error) {
      console.error('Erro ao buscar brindes do promoter:', error);
      res.status(500).json({ success: false, error: 'Erro ao buscar brindes do promoter' });
    }
  });

  /**
   * @route   PUT /api/gift-rules/gifts/:giftId/deliver
   * @desc    Marca um brinde como entregue
   * @access  Private
   */
  router.put('/gifts/:giftId/deliver', auth, async (req, res) => {
    try {
      const { giftId } = req.params;
      const { tipo } = req.body; // 'guest_list' ou 'promoter'

      let query, params;
      if (tipo === 'promoter') {
        query = `
          UPDATE promoter_gifts 
          SET status = 'ENTREGUE', entregue_em = CURRENT_TIMESTAMP
          WHERE id = $1
          RETURNING *
        `;
        params = [giftId];
      } else {
        query = `
          UPDATE guest_list_gifts 
          SET status = 'ENTREGUE', entregue_em = CURRENT_TIMESTAMP
          WHERE id = $1
          RETURNING *
        `;
        params = [giftId];
      }

      const result = await pool.query(query, params);
      
      if (result.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Brinde não encontrado' });
      }

      res.status(200).json({ success: true, gift: result.rows[0] });
    } catch (error) {
      console.error('Erro ao marcar brinde como entregue:', error);
      res.status(500).json({ success: false, error: 'Erro ao marcar brinde como entregue' });
    }
  });

  return { router, checkAndAwardGifts, checkAndAwardPromoterGifts };
};
