// routes/operationalDetails.js

const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');

module.exports = (pool) => {
  /**
   * @route   POST /api/v1/operational-details
   * @desc    Cria um novo detalhe operacional
   * @access  Private (Admin/Marketing)
   */
  router.post('/', auth, async (req, res) => {
    try {
      // Verificar se a tabela existe, se não, criar
      try {
        const [tables] = await pool.execute("SHOW TABLES LIKE 'operational_details'");
        
        if (tables.length === 0) {
          console.log('📝 Criando tabela operational_details...');
          
          await pool.execute(`
            CREATE TABLE operational_details (
              id INT(11) NOT NULL AUTO_INCREMENT,
              event_id INT(11) DEFAULT NULL,
              establishment_id INT(11) DEFAULT NULL,
              event_date DATE NOT NULL,
              artistic_attraction VARCHAR(255) NOT NULL,
              show_schedule TEXT DEFAULT NULL,
              ticket_prices TEXT NOT NULL,
              promotions TEXT DEFAULT NULL,
              visual_reference_url VARCHAR(255) DEFAULT NULL,
              admin_notes TEXT DEFAULT NULL,
              operational_instructions TEXT DEFAULT NULL,
              is_active BOOLEAN DEFAULT 1,
              created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
              updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
              PRIMARY KEY (id),
              UNIQUE KEY unique_event_date (event_date),
              KEY idx_establishment_id (establishment_id),
              KEY idx_event_id (event_id),
              KEY idx_event_date (event_date),
              KEY idx_is_active (is_active)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
          `);
          
          console.log('✅ Tabela operational_details criada com sucesso!');
        }
      } catch (tableError) {
        console.log('⚠️ Erro ao verificar/criar tabela operational_details:', tableError.message);
      }

      const {
        event_id,
        establishment_id,
        event_date,
        artistic_attraction,
        show_schedule,
        ticket_prices,
        promotions,
        visual_reference_url,
        admin_notes,
        operational_instructions,
        is_active = true
      } = req.body;

      // Validações
      if (!event_date) {
        return res.status(400).json({
          success: false,
          error: 'Data do evento é obrigatória'
        });
      }

      if (!artistic_attraction) {
        return res.status(400).json({
          success: false,
          error: 'Atrativo artístico é obrigatório'
        });
      }

      if (!ticket_prices) {
        return res.status(400).json({
          success: false,
          error: 'Informações de preços são obrigatórias'
        });
      }

      // Verificar se já existe um detalhe para esta data
      const [existing] = await pool.execute(
        'SELECT id FROM operational_details WHERE event_date = ?',
        [event_date]
      );

      if (existing.length > 0) {
        return res.status(400).json({
          success: false,
          error: 'Já existe um detalhe operacional para esta data. Use PUT para atualizar.'
        });
      }

      const query = `
        INSERT INTO operational_details (
          event_id, establishment_id, event_date, artistic_attraction,
          show_schedule, ticket_prices, promotions, visual_reference_url,
          admin_notes, operational_instructions, is_active
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      const [result] = await pool.execute(query, [
        event_id || null,
        establishment_id || null,
        event_date,
        artistic_attraction,
        show_schedule || null,
        ticket_prices,
        promotions || null,
        visual_reference_url || null,
        admin_notes || null,
        operational_instructions || null,
        is_active ? 1 : 0
      ]);

      res.status(201).json({
        success: true,
        message: 'Detalhe operacional criado com sucesso',
        id: result.insertId
      });

    } catch (error) {
      console.error('❌ Erro ao criar detalhe operacional:', error);
      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor'
      });
    }
  });

  /**
   * @route   GET /api/v1/operational-details
   * @desc    Lista todos os detalhes operacionais com filtros opcionais
   * @access  Private (Admin/Marketing)
   */
  router.get('/', auth, async (req, res) => {
    try {
      const { establishment_id, event_date, is_active, limit, offset } = req.query;
      
      let query = `
        SELECT 
          od.*,
          p.name as establishment_name,
          e.nome_do_evento as event_name
        FROM operational_details od
        LEFT JOIN places p ON od.establishment_id = p.id
        LEFT JOIN eventos e ON od.event_id = e.id
        WHERE 1=1
      `;
      
      const params = [];
      
      if (establishment_id) {
        query += ` AND od.establishment_id = ?`;
        params.push(establishment_id);
      }
      
      if (event_date) {
        query += ` AND od.event_date = ?`;
        params.push(event_date);
      }
      
      if (is_active !== undefined) {
        query += ` AND od.is_active = ?`;
        params.push(is_active === 'true' || is_active === '1' ? 1 : 0);
      }
      
      query += ` ORDER BY od.event_date DESC`;
      
      if (limit) {
        query += ` LIMIT ?`;
        params.push(parseInt(limit));
        
        if (offset) {
          query += ` OFFSET ?`;
          params.push(parseInt(offset));
        }
      }
      
      const [details] = await pool.execute(query, params);
      
      res.json({
        success: true,
        data: details
      });
      
    } catch (error) {
      console.error('❌ Erro ao buscar detalhes operacionais:', error);
      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor'
      });
    }
  });

  /**
   * @route   GET /api/v1/operational-details/date/:date
   * @desc    Busca o detalhe operacional mais recente para uma data específica
   * @access  Public (para uso no front-end de reservas)
   */
  router.get('/date/:date', async (req, res) => {
    try {
      const { date } = req.params;
      
      // Validar formato da data (YYYY-MM-DD)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return res.status(400).json({
          success: false,
          error: 'Formato de data inválido. Use YYYY-MM-DD'
        });
      }

      const query = `
        SELECT 
          od.*,
          p.name as establishment_name
        FROM operational_details od
        LEFT JOIN places p ON od.establishment_id = p.id
        WHERE od.event_date = ? AND od.is_active = 1
        ORDER BY od.updated_at DESC
        LIMIT 1
      `;
      
      const [details] = await pool.execute(query, [date]);
      
      if (details.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Nenhum detalhe operacional encontrado para esta data'
        });
      }
      
      res.json({
        success: true,
        data: details[0]
      });
      
    } catch (error) {
      console.error('❌ Erro ao buscar detalhe operacional por data:', error);
      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor'
      });
    }
  });

  /**
   * @route   GET /api/v1/operational-details/:id
   * @desc    Busca um detalhe operacional específico
   * @access  Private (Admin/Marketing)
   */
  router.get('/:id', auth, async (req, res) => {
    try {
      const { id } = req.params;
      
      const query = `
        SELECT 
          od.*,
          p.name as establishment_name,
          e.nome_do_evento as event_name
        FROM operational_details od
        LEFT JOIN places p ON od.establishment_id = p.id
        LEFT JOIN eventos e ON od.event_id = e.id
        WHERE od.id = ?
      `;
      
      const [details] = await pool.execute(query, [id]);
      
      if (details.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Detalhe operacional não encontrado'
        });
      }
      
      res.json({
        success: true,
        data: details[0]
      });
      
    } catch (error) {
      console.error('❌ Erro ao buscar detalhe operacional:', error);
      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor'
      });
    }
  });

  /**
   * @route   PUT /api/v1/operational-details/:id
   * @desc    Atualiza um detalhe operacional existente
   * @access  Private (Admin/Marketing)
   */
  router.put('/:id', auth, async (req, res) => {
    try {
      const { id } = req.params;
      const {
        event_id,
        establishment_id,
        event_date,
        artistic_attraction,
        show_schedule,
        ticket_prices,
        promotions,
        visual_reference_url,
        admin_notes,
        operational_instructions,
        is_active
      } = req.body;

      // Verificar se o registro existe
      const [existing] = await pool.execute(
        'SELECT id FROM operational_details WHERE id = ?',
        [id]
      );

      if (existing.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Detalhe operacional não encontrado'
        });
      }

      // Se a data está sendo alterada, verificar se já existe outro registro com essa data
      if (event_date) {
        const [dateConflict] = await pool.execute(
          'SELECT id FROM operational_details WHERE event_date = ? AND id != ?',
          [event_date, id]
        );

        if (dateConflict.length > 0) {
          return res.status(400).json({
            success: false,
            error: 'Já existe outro detalhe operacional para esta data'
          });
        }
      }

      const updateFields = [];
      const updateValues = [];

      if (event_id !== undefined) {
        updateFields.push('event_id = ?');
        updateValues.push(event_id || null);
      }
      if (establishment_id !== undefined) {
        updateFields.push('establishment_id = ?');
        updateValues.push(establishment_id || null);
      }
      if (event_date !== undefined) {
        updateFields.push('event_date = ?');
        updateValues.push(event_date);
      }
      if (artistic_attraction !== undefined) {
        updateFields.push('artistic_attraction = ?');
        updateValues.push(artistic_attraction);
      }
      if (show_schedule !== undefined) {
        updateFields.push('show_schedule = ?');
        updateValues.push(show_schedule || null);
      }
      if (ticket_prices !== undefined) {
        updateFields.push('ticket_prices = ?');
        updateValues.push(ticket_prices);
      }
      if (promotions !== undefined) {
        updateFields.push('promotions = ?');
        updateValues.push(promotions || null);
      }
      if (visual_reference_url !== undefined) {
        updateFields.push('visual_reference_url = ?');
        updateValues.push(visual_reference_url || null);
      }
      if (admin_notes !== undefined) {
        updateFields.push('admin_notes = ?');
        updateValues.push(admin_notes || null);
      }
      if (operational_instructions !== undefined) {
        updateFields.push('operational_instructions = ?');
        updateValues.push(operational_instructions || null);
      }
      if (is_active !== undefined) {
        updateFields.push('is_active = ?');
        updateValues.push(is_active ? 1 : 0);
      }

      if (updateFields.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Nenhum campo para atualizar'
        });
      }

      updateValues.push(id);

      const query = `
        UPDATE operational_details 
        SET ${updateFields.join(', ')}
        WHERE id = ?
      `;

      await pool.execute(query, updateValues);

      res.json({
        success: true,
        message: 'Detalhe operacional atualizado com sucesso'
      });

    } catch (error) {
      console.error('❌ Erro ao atualizar detalhe operacional:', error);
      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor'
      });
    }
  });

  /**
   * @route   DELETE /api/v1/operational-details/:id
   * @desc    Exclui um detalhe operacional
   * @access  Private (Admin/Marketing)
   */
  router.delete('/:id', auth, async (req, res) => {
    try {
      const { id } = req.params;

      // Verificar se o registro existe
      const [existing] = await pool.execute(
        'SELECT id FROM operational_details WHERE id = ?',
        [id]
      );

      if (existing.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Detalhe operacional não encontrado'
        });
      }

      await pool.execute('DELETE FROM operational_details WHERE id = ?', [id]);

      res.json({
        success: true,
        message: 'Detalhe operacional excluído com sucesso'
      });

    } catch (error) {
      console.error('❌ Erro ao excluir detalhe operacional:', error);
      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor'
      });
    }
  });

  return router;
};

