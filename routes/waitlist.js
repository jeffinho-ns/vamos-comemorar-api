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

      const { status, limit, sort, order, establishment_id, date, preferred_time } = req.query;
      
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

      if (establishment_id) {
        const isSeuJustino = String(establishment_id) === '1';
        if (isSeuJustino) {
          query += ` AND (wl.establishment_id = $${paramIndex++} OR wl.establishment_id IS NULL)`;
        } else {
          query += ` AND wl.establishment_id = $${paramIndex++}`;
        }
        params.push(establishment_id);
      }

      if (date) {
        query += ` AND (wl.preferred_date = $${paramIndex++} OR wl.preferred_date IS NULL)`;
        params.push(date);
      }

      if (preferred_time) {
        query += ` AND wl.preferred_time = $${paramIndex++}`;
        params.push(preferred_time);
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
        establishment_id,
        preferred_date,
        preferred_area_id,
        preferred_table_number,
        client_name,
        client_phone,
        client_email,
        number_of_people,
        preferred_time,
        status = 'AGUARDANDO',
        notes,
        has_bistro_table = false
      } = req.body;
      
      // Validações básicas
      if (!client_name) {
        return res.status(400).json({
          success: false,
          error: 'Campo obrigatório: client_name'
        });
      }
      if (!establishment_id) {
        return res.status(400).json({
          success: false,
          error: 'Campo obrigatório: establishment_id'
        });
      }

      const preferredDate = preferred_date || new Date().toISOString().split('T')[0];
      const preferredTime = preferred_time && String(preferred_time).trim() !== '' ? preferred_time : null;
      
      // Calcular posição na fila
      let positionQuery = "SELECT COUNT(*) as count FROM waitlist WHERE status = 'AGUARDANDO' AND establishment_id = $1 AND preferred_date = $2";
      const positionParams = [establishment_id, preferredDate];
      if (preferredTime) {
        positionQuery += " AND preferred_time = $3";
        positionParams.push(preferredTime);
      } else {
        positionQuery += " AND preferred_time IS NULL";
      }
      const positionResult = await pool.query(positionQuery, positionParams);
      const position = parseInt(positionResult.rows[0].count) + 1;
      
      // Estimar tempo de espera (simplificado: 15 minutos por pessoa na frente)
      const estimatedWaitTime = (position - 1) * 15;
      
      const query = `
        INSERT INTO waitlist (
          establishment_id, preferred_date, preferred_area_id, preferred_table_number,
          client_name, client_phone, client_email, number_of_people, 
          preferred_time, status, position, estimated_wait_time, notes, has_bistro_table
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING id
      `;
      
      const params = [
        establishment_id, preferredDate, preferred_area_id || null, preferred_table_number || null,
        client_name, client_phone, client_email, number_of_people,
        preferredTime, status, position, estimatedWaitTime, notes, has_bistro_table || false
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
        establishment_id,
        preferred_date,
        preferred_area_id,
        preferred_table_number,
        client_name,
        client_phone,
        client_email,
        number_of_people,
        preferred_time,
        status,
        notes,
        has_bistro_table
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
      
      const updateFields = [];
      const params = [];
      let paramIndex = 1;

      if (client_name !== undefined) {
        updateFields.push(`client_name = $${paramIndex++}`);
        params.push(client_name);
      }
      if (client_phone !== undefined) {
        updateFields.push(`client_phone = $${paramIndex++}`);
        params.push(client_phone);
      }
      if (client_email !== undefined) {
        updateFields.push(`client_email = $${paramIndex++}`);
        params.push(client_email);
      }
      if (number_of_people !== undefined) {
        updateFields.push(`number_of_people = $${paramIndex++}`);
        params.push(number_of_people);
      }
      if (preferred_time !== undefined) {
        const preferredTime = preferred_time && String(preferred_time).trim() !== '' ? preferred_time : null;
        updateFields.push(`preferred_time = $${paramIndex++}`);
        params.push(preferredTime);
      }
      if (preferred_date !== undefined) {
        updateFields.push(`preferred_date = $${paramIndex++}`);
        params.push(preferred_date);
      }
      if (preferred_area_id !== undefined) {
        updateFields.push(`preferred_area_id = $${paramIndex++}`);
        params.push(preferred_area_id || null);
      }
      if (preferred_table_number !== undefined) {
        updateFields.push(`preferred_table_number = $${paramIndex++}`);
        params.push(preferred_table_number || null);
      }
      if (establishment_id !== undefined) {
        updateFields.push(`establishment_id = $${paramIndex++}`);
        params.push(establishment_id);
      }
      if (status !== undefined) {
        updateFields.push(`status = $${paramIndex++}`);
        params.push(status);
      }
      if (notes !== undefined) {
        updateFields.push(`notes = $${paramIndex++}`);
        params.push(notes);
      }
      if (has_bistro_table !== undefined) {
        updateFields.push(`has_bistro_table = $${paramIndex++}`);
        params.push(has_bistro_table || false);
      }

      updateFields.push('updated_at = CURRENT_TIMESTAMP');
      params.push(id);

      const query = `
        UPDATE waitlist SET
          ${updateFields.join(', ')}
        WHERE id = $${paramIndex}
      `;
      
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
      const { establishment_id, date, preferred_time } = req.query;
      let countQuery = "SELECT COUNT(*) as count FROM waitlist WHERE status = 'AGUARDANDO'";
      const countParams = [];
      let countIndex = 1;
      if (establishment_id) {
        countQuery += ` AND establishment_id = $${countIndex++}`;
        countParams.push(establishment_id);
      }
      if (date) {
        countQuery += ` AND preferred_date = $${countIndex++}`;
        countParams.push(date);
      }
      if (preferred_time) {
        countQuery += ` AND preferred_time = $${countIndex++}`;
        countParams.push(preferred_time);
      }
      const waitingCountResult = await pool.query(countQuery, countParams);
      
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
      const groupResult = await pool.query(`
        SELECT establishment_id, preferred_date, preferred_time
        FROM waitlist
        WHERE status = 'AGUARDANDO'
        GROUP BY establishment_id, preferred_date, preferred_time
      `);

      for (const group of groupResult.rows) {
        const params = [group.establishment_id, group.preferred_date];
        let query = `
          SELECT id FROM waitlist
          WHERE status = 'AGUARDANDO'
            AND establishment_id = $1
            AND preferred_date = $2
        `;
        if (group.preferred_time) {
          query += ' AND preferred_time = $3';
          params.push(group.preferred_time);
        } else {
          query += ' AND preferred_time IS NULL';
        }
        query += ' ORDER BY created_at ASC';

        const waitingItemsResult = await pool.query(query, params);
        for (let i = 0; i < waitingItemsResult.rows.length; i++) {
          const newPosition = i + 1;
          const estimatedWaitTime = i * 15; // 15 minutos por pessoa na frente
          await pool.query(
            'UPDATE waitlist SET position = $1, estimated_wait_time = $2 WHERE id = $3',
            [newPosition, estimatedWaitTime, waitingItemsResult.rows[i].id]
          );
        }
      }
    } catch (error) {
      console.error('❌ Erro ao recalcular posições:', error);
    }
  }

  return router;
};

