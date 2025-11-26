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

      // 2. Buscar regras ativas para este estabelecimento/evento
      let rulesQuery = `
        SELECT id, descricao, checkins_necessarios, status
        FROM gift_rules
        WHERE establishment_id = $1
        AND status = 'ATIVA'
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

module.exports = (pool) => {
  const router = express.Router();
  const checkAndAwardGifts = createCheckAndAwardGifts(pool);

  /**
   * @route   GET /api/gift-rules
   * @desc    Lista regras de brindes
   * @access  Private
   */
  router.get('/', auth, async (req, res) => {
    try {
      const { establishment_id, evento_id } = req.query;
      
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

      query += ' ORDER BY checkins_necessarios ASC';

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
      const { establishment_id, evento_id, descricao, checkins_necessarios, status } = req.body;

      if (!establishment_id || !descricao || !checkins_necessarios) {
        return res.status(400).json({ 
          success: false, 
          error: 'establishment_id, descricao e checkins_necessarios são obrigatórios' 
        });
      }

      const result = await pool.query(`
        INSERT INTO gift_rules (establishment_id, evento_id, descricao, checkins_necessarios, status)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
      `, [
        establishment_id, 
        evento_id || null, 
        descricao, 
        parseInt(checkins_necessarios), 
        status || 'ATIVA'
      ]);

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
      const { descricao, checkins_necessarios, status, evento_id } = req.body;

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

      if (status !== undefined) {
        updates.push(`status = $${paramIndex++}`);
        params.push(status);
      }

      if (evento_id !== undefined) {
        updates.push(`evento_id = $${paramIndex++}`);
        params.push(evento_id || null);
      }

      if (updates.length === 0) {
        return res.status(400).json({ success: false, error: 'Nenhum campo para atualizar' });
      }

      params.push(id);
      const result = await pool.query(`
        UPDATE gift_rules 
        SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP
        WHERE id = $${paramIndex}
        RETURNING *
      `, params);

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
      const result = await pool.query('DELETE FROM gift_rules WHERE id = $1 RETURNING id', [id]);

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
          glg.id,
          glg.status,
          glg.checkins_count,
          glg.liberado_em,
          glg.entregue_em,
          gr.descricao,
          gr.checkins_necessarios
        FROM guest_list_gifts glg
        JOIN gift_rules gr ON glg.gift_rule_id = gr.id
        WHERE glg.guest_list_id = $1
        AND glg.status != 'CANCELADO'
        ORDER BY glg.liberado_em DESC
      `, [guestListId]);

      res.status(200).json({ success: true, gifts: result.rows });
    } catch (error) {
      console.error('Erro ao buscar brindes da guest list:', error);
      res.status(500).json({ success: false, error: 'Erro ao buscar brindes' });
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
      const result = await pool.query(`
        UPDATE guest_list_gifts 
        SET status = 'ENTREGUE', entregue_em = CURRENT_TIMESTAMP
        WHERE id = $1 AND status = 'LIBERADO'
        RETURNING *
      `, [giftId]);

      if (result.rows.length === 0) {
        return res.status(404).json({ 
          success: false, 
          error: 'Brinde não encontrado ou não está no status LIBERADO' 
        });
      }

      res.status(200).json({ success: true, gift: result.rows[0] });
    } catch (error) {
      console.error('Erro ao marcar brinde como entregue:', error);
      res.status(500).json({ success: false, error: 'Erro ao marcar brinde como entregue' });
    }
  });

  // Retorna tanto o router quanto a função
  return {
    router,
    checkAndAwardGifts
  };
};
