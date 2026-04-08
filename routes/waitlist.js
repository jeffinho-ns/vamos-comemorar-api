// routes/waitlist.js

const express = require('express');
const router = express.Router();

const toMinutes = (timeStr) => {
  const [h, m] = String(timeStr || '').split(':').map(Number);
  if (Number.isNaN(h)) return null;
  return h * 60 + (Number.isNaN(m) ? 0 : m);
};

const isTimeWithinWindows = (timeStr, windows) => {
  const value = toMinutes(timeStr);
  if (value == null || !Array.isArray(windows) || windows.length === 0) return false;
  return windows.some((w) => {
    const startMin = toMinutes(w.start);
    const endMin = toMinutes(w.end);
    if (startMin == null || endMin == null) return false;
    if (endMin < startMin) return value >= startMin || value <= endMin;
    return value >= startMin && value <= endMin;
  });
};

const defaultRooftopWindows = (dateStr) => {
  if (dateStr === '2026-04-20') {
    return [{ start: '12:00', end: '20:00', label: 'Segunda especial (20/04): 12:00–20:00' }];
  }
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return [];
  const weekday = d.getDay();
  if (weekday >= 2 && weekday <= 4) {
    return [{ start: '18:00', end: '22:30', label: 'Terça a Quinta: 18:00–22:30' }];
  }
  if (weekday === 5 || weekday === 6) {
    return [
      { start: '12:00', end: '16:00', label: 'Almoço: 12:00–16:00' },
      { start: '17:00', end: '22:30', label: 'Jantar: 17:00–22:30' },
    ];
  }
  if (weekday === 0) {
    return [
      { start: '12:00', end: '16:00', label: 'Almoço: 12:00–16:00' },
      { start: '17:00', end: '20:30', label: 'Jantar: 17:00–20:30' },
    ];
  }
  return [];
};

module.exports = (pool) => {
  const getRooftopWindows = async (dateStr) => {
    try {
      const overrideResult = await pool.query(
        `SELECT is_open, start_time::text, end_time::text, second_start_time::text, second_end_time::text
           FROM restaurant_reservation_date_overrides
          WHERE establishment_id = 9 AND override_date = $1
          LIMIT 1`,
        [dateStr]
      );
      if (overrideResult.rows.length > 0) {
        const o = overrideResult.rows[0];
        if (!o.is_open) return [];
        const windows = [];
        if (o.start_time && o.end_time) {
          windows.push({
            start: o.start_time.slice(0, 5),
            end: o.end_time.slice(0, 5),
            label: `${o.start_time.slice(0, 5)}–${o.end_time.slice(0, 5)}`,
          });
        }
        if (o.second_start_time && o.second_end_time) {
          windows.push({
            start: o.second_start_time.slice(0, 5),
            end: o.second_end_time.slice(0, 5),
            label: `${o.second_start_time.slice(0, 5)}–${o.second_end_time.slice(0, 5)}`,
          });
        }
        return windows;
      }

      const d = new Date(`${dateStr}T00:00:00`);
      if (!Number.isNaN(d.getTime())) {
        const weekday = d.getDay();
        const weeklyResult = await pool.query(
          `SELECT is_open, start_time::text, end_time::text, second_start_time::text, second_end_time::text
             FROM restaurant_reservation_operating_hours
            WHERE establishment_id = 9 AND weekday = $1
            LIMIT 1`,
          [weekday]
        );
        if (weeklyResult.rows.length > 0) {
          const w = weeklyResult.rows[0];
          if (!w.is_open) return [];
          const windows = [];
          if (w.start_time && w.end_time) {
            windows.push({
              start: w.start_time.slice(0, 5),
              end: w.end_time.slice(0, 5),
              label: `${w.start_time.slice(0, 5)}–${w.end_time.slice(0, 5)}`,
            });
          }
          if (w.second_start_time && w.second_end_time) {
            windows.push({
              start: w.second_start_time.slice(0, 5),
              end: w.second_end_time.slice(0, 5),
              label: `${w.second_start_time.slice(0, 5)}–${w.second_end_time.slice(0, 5)}`,
            });
          }
          return windows;
        }
      }
    } catch (e) {
      // fallback para regra padrão
    }
    return defaultRooftopWindows(dateStr);
  };

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

      const establishmentIdNum = parseInt(establishment_id, 10) || 0;

      const preferredDate = preferred_date || new Date().toISOString().split('T')[0];
      const preferredTime = preferred_time && String(preferred_time).trim() !== '' ? preferred_time : null;

      // Bloquear lista de espera para Reserva Rooftop em horários fora do funcionamento
      if (establishmentIdNum === 9 && preferredTime) {
        const rooftopWindows = await getRooftopWindows(preferredDate);
        const isValid = isTimeWithinWindows(preferredTime, rooftopWindows);
        if (!isValid) {
          const windowsLabel =
            rooftopWindows.length > 0
              ? rooftopWindows.map((w) => w.label).join(' | ')
              : 'Reservas fechadas para este dia';
          return res.status(400).json({
            success: false,
            error: `Horário fora do funcionamento do Reserva Rooftop. Regras atuais: ${windowsLabel}.`
          });
        }
      }
      
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

