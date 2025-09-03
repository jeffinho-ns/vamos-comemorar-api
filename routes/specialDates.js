// routes/specialDates.js

const express = require('express');
const router = express.Router();

module.exports = (pool) => {
  /**
   * @route   GET /api/special-dates
   * @desc    Lista todas as datas especiais com filtros opcionais
   * @access  Private
   */
  router.get('/', async (req, res) => {
    try {
      const { year, month, is_blocked } = req.query;
      
      let query = `
        SELECT 
          sd.*
        FROM special_dates sd
        WHERE 1=1
      `;
      
      const params = [];
      
      if (year) {
        query += ` AND YEAR(sd.date) = ?`;
        params.push(year);
      }
      
      if (month) {
        query += ` AND MONTH(sd.date) = ?`;
        params.push(month);
      }
      
      if (is_blocked !== undefined) {
        query += ` AND sd.is_blocked = ?`;
        params.push(is_blocked === 'true' ? 1 : 0);
      }
      
      query += ` ORDER BY sd.date ASC`;
      
      const [specialDates] = await pool.execute(query, params);
      
      res.json({
        success: true,
        specialDates: specialDates
      });
      
    } catch (error) {
      console.error('❌ Erro ao buscar datas especiais:', error);
      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor'
      });
    }
  });

  /**
   * @route   GET /api/special-dates/:id
   * @desc    Busca uma data especial específica
   * @access  Private
   */
  router.get('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      
      const query = `
        SELECT 
          sd.*
        FROM special_dates sd
        WHERE sd.id = ?
      `;
      
      const [specialDates] = await pool.execute(query, [id]);
      
      if (specialDates.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Data especial não encontrada'
        });
      }
      
      res.json({
        success: true,
        specialDate: specialDates[0]
      });
      
    } catch (error) {
      console.error('❌ Erro ao buscar data especial:', error);
      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor'
      });
    }
  });

  /**
   * @route   POST /api/special-dates
   * @desc    Cria uma nova data especial
   * @access  Private
   */
  router.post('/', async (req, res) => {
    try {
      const {
        name,
        date,
        capacity_lunch = 0,
        capacity_dinner = 0,
        is_blocked = 0,
        description
      } = req.body;
      
      // Validações básicas
      if (!name || !date) {
        return res.status(400).json({
          success: false,
          error: 'Campos obrigatórios: name, date'
        });
      }
      
      // Verificar se já existe uma data especial para esta data
      const [existingDate] = await pool.execute(
        'SELECT id FROM special_dates WHERE date = ?',
        [date]
      );
      
      if (existingDate.length > 0) {
        return res.status(400).json({
          success: false,
          error: 'Já existe uma data especial para esta data'
        });
      }
      
      const query = `
        INSERT INTO special_dates (
          name, date, capacity_lunch, capacity_dinner, is_blocked, description
        ) VALUES (?, ?, ?, ?, ?, ?)
      `;
      
      const params = [name, date, capacity_lunch, capacity_dinner, is_blocked, description];
      
      const [result] = await pool.execute(query, params);
      
      // Buscar a data especial criada
      const [newSpecialDate] = await pool.execute(
        'SELECT * FROM special_dates WHERE id = ?',
        [result.insertId]
      );
      
      res.status(201).json({
        success: true,
        message: 'Data especial criada com sucesso',
        specialDate: newSpecialDate[0]
      });
      
    } catch (error) {
      console.error('❌ Erro ao criar data especial:', error);
      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor'
      });
    }
  });

  /**
   * @route   PUT /api/special-dates/:id
   * @desc    Atualiza uma data especial existente
   * @access  Private
   */
  router.put('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const {
        name,
        date,
        capacity_lunch,
        capacity_dinner,
        is_blocked,
        description
      } = req.body;
      
      // Verificar se a data especial existe
      const [existingDate] = await pool.execute(
        'SELECT id FROM special_dates WHERE id = ?',
        [id]
      );
      
      if (existingDate.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Data especial não encontrada'
        });
      }
      
      // Verificar se já existe outra data especial para esta data
      if (date) {
        const [duplicateDate] = await pool.execute(
          'SELECT id FROM special_dates WHERE date = ? AND id != ?',
          [date, id]
        );
        
        if (duplicateDate.length > 0) {
          return res.status(400).json({
            success: false,
            error: 'Já existe uma data especial para esta data'
          });
        }
      }
      
      const query = `
        UPDATE special_dates SET
          name = COALESCE(?, name),
          date = COALESCE(?, date),
          capacity_lunch = COALESCE(?, capacity_lunch),
          capacity_dinner = COALESCE(?, capacity_dinner),
          is_blocked = COALESCE(?, is_blocked),
          description = COALESCE(?, description),
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `;
      
      const params = [name, date, capacity_lunch, capacity_dinner, is_blocked, description, id];
      
      await pool.execute(query, params);
      
      // Buscar a data especial atualizada
      const [updatedSpecialDate] = await pool.execute(
        'SELECT * FROM special_dates WHERE id = ?',
        [id]
      );
      
      res.json({
        success: true,
        message: 'Data especial atualizada com sucesso',
        specialDate: updatedSpecialDate[0]
      });
      
    } catch (error) {
      console.error('❌ Erro ao atualizar data especial:', error);
      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor'
      });
    }
  });

  /**
   * @route   DELETE /api/special-dates/:id
   * @desc    Deleta uma data especial
   * @access  Private
   */
  router.delete('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      
      // Verificar se a data especial existe
      const [existingDate] = await pool.execute(
        'SELECT id FROM special_dates WHERE id = ?',
        [id]
      );
      
      if (existingDate.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Data especial não encontrada'
        });
      }
      
      await pool.execute('DELETE FROM special_dates WHERE id = ?', [id]);
      
      res.json({
        success: true,
        message: 'Data especial deletada com sucesso'
      });
      
    } catch (error) {
      console.error('❌ Erro ao deletar data especial:', error);
      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor'
      });
    }
  });

  /**
   * @route   GET /api/special-dates/check/:date
   * @desc    Verifica se uma data é especial
   * @access  Private
   */
  router.get('/check/:date', async (req, res) => {
    try {
      const { date } = req.params;
      
      const query = `
        SELECT 
          sd.*
        FROM special_dates sd
        WHERE sd.date = ?
      `;
      
      const [specialDates] = await pool.execute(query, [date]);
      
      if (specialDates.length === 0) {
        return res.json({
          success: true,
          isSpecialDate: false,
          specialDate: null
        });
      }
      
      res.json({
        success: true,
        isSpecialDate: true,
        specialDate: specialDates[0]
      });
      
    } catch (error) {
      console.error('❌ Erro ao verificar data especial:', error);
      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor'
      });
    }
  });

  /**
   * @route   GET /api/special-dates/calendar/:year/:month
   * @desc    Busca datas especiais de um mês específico para calendário
   * @access  Private
   */
  router.get('/calendar/:year/:month', async (req, res) => {
    try {
      const { year, month } = req.params;
      
      const query = `
        SELECT 
          sd.*,
          DAY(sd.date) as day
        FROM special_dates sd
        WHERE YEAR(sd.date) = ? AND MONTH(sd.date) = ?
        ORDER BY sd.date ASC
      `;
      
      const [specialDates] = await pool.execute(query, [year, month]);
      
      res.json({
        success: true,
        specialDates: specialDates
      });
      
    } catch (error) {
      console.error('❌ Erro ao buscar datas especiais do calendário:', error);
      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor'
      });
    }
  });

  return router;
};
