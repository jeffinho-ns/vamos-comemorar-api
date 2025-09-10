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
      // Verificar se a tabela waitlist existe, se não, criar
      try {
        const [tables] = await pool.execute("SHOW TABLES LIKE 'waitlist'");
        
        if (tables.length === 0) {
          console.log('📝 Criando tabela waitlist...');
          
          await pool.execute(`
            CREATE TABLE waitlist (
              id int(11) NOT NULL AUTO_INCREMENT,
              establishment_id int(11) DEFAULT NULL,
              client_name varchar(255) NOT NULL,
              client_phone varchar(20) DEFAULT NULL,
              client_email varchar(255) DEFAULT NULL,
              number_of_people int(11) NOT NULL,
              preferred_time varchar(50) DEFAULT NULL,
              status varchar(50) DEFAULT 'AGUARDANDO',
              position int(11) DEFAULT 1,
              estimated_wait_time int(11) DEFAULT 0,
              notes text DEFAULT NULL,
              created_at timestamp NULL DEFAULT CURRENT_TIMESTAMP,
              updated_at timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
              PRIMARY KEY (id),
              KEY idx_establishment_id (establishment_id),
              KEY idx_status (status),
              KEY idx_position (position)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
          `);
          
          console.log('✅ Tabela waitlist criada com sucesso!');
        }
      } catch (tableError) {
        console.log('⚠️ Erro ao verificar/criar tabela waitlist:', tableError.message);
      }

      const { status, limit, sort, order } = req.query;
      
      let query = `
        SELECT 
          wl.*
        FROM waitlist wl
        WHERE 1=1
      `;
      
      const params = [];
      
      if (status) {
        query += ` AND wl.status = ?`;
        params.push(status);
      }
      
      if (sort && order) {
        query += ` ORDER BY wl.${sort} ${order.toUpperCase()}`;
      } else {
        query += ` ORDER BY wl.created_at ASC`;
      }
      
      if (limit) {
        query += ` LIMIT ?`;
        params.push(parseInt(limit));
      }
      
      const [waitlist] = await pool.execute(query, params);
      
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
        WHERE wl.id = ?
      `;
      
      const [waitlist] = await pool.execute(query, [id]);
      
      if (waitlist.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Item não encontrado na lista de espera'
        });
      }
      
      res.json({
        success: true,
        waitlistEntry: waitlist[0]
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
      const [positionResult] = await pool.execute(
        'SELECT COUNT(*) as count FROM waitlist WHERE status = "AGUARDANDO"'
      );
      const position = positionResult[0].count + 1;
      
      // Estimar tempo de espera (simplificado: 15 minutos por pessoa na frente)
      const estimatedWaitTime = (position - 1) * 15;
      
      const query = `
        INSERT INTO waitlist (
          client_name, client_phone, client_email, number_of_people, 
          preferred_time, status, position, estimated_wait_time, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      
      const params = [
        client_name, client_phone, client_email, number_of_people,
        preferred_time, status, position, estimatedWaitTime, notes
      ];
      
      const [result] = await pool.execute(query, params);
      
      // Buscar o item criado
      const [newWaitlistEntry] = await pool.execute(
        'SELECT * FROM waitlist WHERE id = ?',
        [result.insertId]
      );
      
      res.status(201).json({
        success: true,
        message: 'Adicionado à lista de espera com sucesso',
        waitlistEntry: newWaitlistEntry[0]
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
      const [existingEntry] = await pool.execute(
        'SELECT id FROM waitlist WHERE id = ?',
        [id]
      );
      
      if (existingEntry.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Item não encontrado na lista de espera'
        });
      }
      
      const query = `
        UPDATE waitlist SET
          client_name = ?, client_phone = ?, client_email = ?, 
          number_of_people = ?, preferred_time = ?, status = ?, 
          notes = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `;
      
      const params = [
        client_name, client_phone, client_email, number_of_people,
        preferred_time, status, notes, id
      ];
      
      await pool.execute(query, params);
      
      // Buscar o item atualizado
      const [updatedEntry] = await pool.execute(
        'SELECT * FROM waitlist WHERE id = ?',
        [id]
      );
      
      res.json({
        success: true,
        message: 'Item da lista de espera atualizado com sucesso',
        waitlistEntry: updatedEntry[0]
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
      const [existingEntry] = await pool.execute(
        'SELECT id FROM waitlist WHERE id = ?',
        [id]
      );
      
      if (existingEntry.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Item não encontrado na lista de espera'
        });
      }
      
      await pool.execute('DELETE FROM waitlist WHERE id = ?', [id]);
      
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
      const [existingEntry] = await pool.execute(
        'SELECT id FROM waitlist WHERE id = ?',
        [id]
      );
      
      if (existingEntry.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Item não encontrado na lista de espera'
        });
      }
      
      await pool.execute(
        'UPDATE waitlist SET status = "CHAMADO", updated_at = CURRENT_TIMESTAMP WHERE id = ?',
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
      const [waitingCount] = await pool.execute(
        'SELECT COUNT(*) as count FROM waitlist WHERE status = "AGUARDANDO"'
      );
      
      res.json({
        success: true,
        stats: {
          waitlistCount: waitingCount[0].count
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
      const [waitingItems] = await pool.execute(
        'SELECT id FROM waitlist WHERE status = "AGUARDANDO" ORDER BY created_at ASC'
      );
      
      for (let i = 0; i < waitingItems.length; i++) {
        const newPosition = i + 1;
        const estimatedWaitTime = i * 15; // 15 minutos por pessoa na frente
        
        await pool.execute(
          'UPDATE waitlist SET position = ?, estimated_wait_time = ? WHERE id = ?',
          [newPosition, estimatedWaitTime, waitingItems[i].id]
        );
      }
    } catch (error) {
      console.error('❌ Erro ao recalcular posições:', error);
    }
  }

  return router;
};

