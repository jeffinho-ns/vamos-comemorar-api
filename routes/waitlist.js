// routes/waitlist.js

const express = require('express');
const router = express.Router();

module.exports = (pool) => {
  /**
   * @route   GET /api/waitlist
   * @desc    Lista todos os itens da lista de espera com filtros opcionais
   * @access  Private
   */
  router.get('/', async (req, res) => {
    try {
      // Tabela waitlist já deve existir no PostgreSQL

      const { status, limit, sort, order } = req.query;
      
      let query = `
        SELECT 
          wl.*
        FROM waitlist wl
        WHERE 1=1
      `;
      
      const params = [];
      let paramIndex = 1;
      
      if (status) {
        query += ` AND wl.status = $${paramIndex++}`;
        params.push(status);
      }
      
      if (sort && order) {
        query += ` ORDER BY wl."${sort}" ${order.toUpperCase()}`;
      } else {
        query += ` ORDER BY wl.created_at ASC`;
      }
      
      if (limit) {
        query += ` LIMIT $${paramIndex++}`;
        params.push(parseInt(limit));
      }
      
      const waitlistResult = await pool.query(query, params);
      const waitlist = waitlistResult.rows;
      
      res.json({
        success: true,
        waitlist: waitlist
      });
      
    } catch (error) {
      console.error('❌ Erro ao buscar lista de espera:', error);
      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor'
      });
    }
  });

  /**
   * @route   GET /api/waitlist/:id
   * @desc    Busca um item específico da lista de espera
   * @access  Private
   */
  router.get('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      
      const query = `
        SELECT 
          wl.*
        FROM waitlist wl
        WHERE wl.id = $1
      `;
      
      const waitlistResult = await pool.query(query, [id]);
      
      if (waitlistResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Item não encontrado na lista de espera'
        });
      }
      
      res.json({
        success: true,
        waitlistEntry: waitlistResult.rows[0]
      });
      
    } catch (error) {
      console.error('❌ Erro ao buscar item da lista de espera:', error);
      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor'
      });
    }
  });

  /**
   * @route   POST /api/waitlist
   * @desc    Adiciona um novo item à lista de espera
   * @access  Private
   */
  router.post('/', async (req, res) => {
    try {
      const {
        client_name,
        client_phone,
        client_email,
        number_of_people,
        preferred_time,
        status = 'AGUARDANDO',
        notes
      } = req.body;
      
      // Validações básicas
      if (!client_name) {
        return res.status(400).json({
          success: false,
          error: 'Campo obrigatório: client_name'
        });
      }
      
      // Calcular posição na fila
      const positionResult = await pool.query(
        "SELECT COUNT(*) as count FROM waitlist WHERE status = 'AGUARDANDO'"
      );
      const position = parseInt(positionResult.rows[0].count) + 1;
      
      // Estimar tempo de espera (simplificado: 15 minutos por pessoa na frente)
      const estimatedWaitTime = (position - 1) * 15;
      
      const query = `
        INSERT INTO waitlist (
          client_name, client_phone, client_email, number_of_people, 
          preferred_time, status, position, estimated_wait_time, notes
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id
      `;
      
      const params = [
        client_name, client_phone, client_email, number_of_people,
        preferred_time, status, position, estimatedWaitTime, notes
      ];
      
      const result = await pool.query(query, params);
      
      // Buscar o item criado
      const newWaitlistEntryResult = await pool.query(
        'SELECT * FROM waitlist WHERE id = $1',
        [result.rows[0].id]
      );
      
      res.status(201).json({
        success: true,
        message: 'Adicionado à lista de espera com sucesso',
        waitlistEntry: newWaitlistEntryResult.rows[0]
      });
      
    } catch (error) {
      console.error('❌ Erro ao adicionar à lista de espera:', error);
      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor'
      });
    }
  });

  /**
   * @route   PUT /api/waitlist/:id
   * @desc    Atualiza um item da lista de espera
   * @access  Private
   */
  router.put('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const {
        client_name,
        client_phone,
        client_email,
        number_of_people,
        preferred_time,
        status,
        notes
      } = req.body;
      
      // Verificar se o item existe
      const existingEntryResult = await pool.query(
        'SELECT id FROM waitlist WHERE id = $1',
        [id]
      );
      
      if (existingEntryResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Item não encontrado na lista de espera'
        });
      }
      
      const query = `
        UPDATE waitlist SET
          client_name = $1, client_phone = $2, client_email = $3, 
          number_of_people = $4, preferred_time = $5, status = $6, 
          notes = $7, updated_at = CURRENT_TIMESTAMP
        WHERE id = $8
      `;
      
      const params = [
        client_name, client_phone, client_email, number_of_people,
        preferred_time, status, notes, id
      ];
      
      await pool.query(query, params);
      
      // Buscar o item atualizado
      const updatedEntryResult = await pool.query(
        'SELECT * FROM waitlist WHERE id = $1',
        [id]
      );
      
      res.json({
        success: true,
        message: 'Item da lista de espera atualizado com sucesso',
        waitlistEntry: updatedEntryResult.rows[0]
      });
      
    } catch (error) {
      console.error('❌ Erro ao atualizar lista de espera:', error);
      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor'
      });
    }
  });

  /**
   * @route   DELETE /api/waitlist/:id
   * @desc    Remove um item da lista de espera
   * @access  Private
   */
  router.delete('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      
      // Verificar se o item existe
      const existingEntryResult = await pool.query(
        'SELECT id FROM waitlist WHERE id = $1',
        [id]
      );
      
      if (existingEntryResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Item não encontrado na lista de espera'
        });
      }
      
      await pool.query('DELETE FROM waitlist WHERE id = $1', [id]);
      
      // Recalcular posições dos itens restantes
      await recalculatePositions(pool);
      
      res.json({
        success: true,
        message: 'Removido da lista de espera com sucesso'
      });
      
    } catch (error) {
      console.error('❌ Erro ao remover da lista de espera:', error);
      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor'
      });
    }
  });

  /**
   * @route   PUT /api/waitlist/:id/call
   * @desc    Marca um item como chamado
   * @access  Private
   */
  router.put('/:id/call', async (req, res) => {
    try {
      const { id } = req.params;
      
      // Verificar se o item existe
      const existingEntryResult = await pool.query(
        'SELECT id FROM waitlist WHERE id = $1',
        [id]
      );
      
      if (existingEntryResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Item não encontrado na lista de espera'
        });
      }
      
      await pool.query(
        "UPDATE waitlist SET status = 'CHAMADO', updated_at = CURRENT_TIMESTAMP WHERE id = $1",
        [id]
      );
      
      res.json({
        success: true,
        message: 'Cliente chamado com sucesso'
      });
      
    } catch (error) {
      console.error('❌ Erro ao chamar cliente:', error);
      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor'
      });
    }
  });

  /**
   * @route   GET /api/waitlist/stats/count
   * @desc    Busca contagem de itens na lista de espera
   * @access  Private
   */
  router.get('/stats/count', async (req, res) => {
    try {
      const waitingCountResult = await pool.query(
        "SELECT COUNT(*) as count FROM waitlist WHERE status = 'AGUARDANDO'"
      );
      
      res.json({
        success: true,
        stats: {
          waitlistCount: parseInt(waitingCountResult.rows[0].count)
        }
      });
      
    } catch (error) {
      console.error('❌ Erro ao buscar contagem da lista de espera:', error);
      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor'
      });
    }
  });

  // Função auxiliar para recalcular posições
  async function recalculatePositions(pool) {
    try {
      const waitingItemsResult = await pool.query(
        "SELECT id FROM waitlist WHERE status = 'AGUARDANDO' ORDER BY created_at ASC"
      );
      
      for (let i = 0; i < waitingItemsResult.rows.length; i++) {
        const newPosition = i + 1;
        const estimatedWaitTime = i * 15; // 15 minutos por pessoa na frente
        
        await pool.query(
          'UPDATE waitlist SET position = $1, estimated_wait_time = $2 WHERE id = $3',
          [newPosition, estimatedWaitTime, waitingItemsResult.rows[i].id]
        );
      }
    } catch (error) {
      console.error('❌ Erro ao recalcular posições:', error);
    }
  }

  return router;
};

