const express = require('express');
const router = express.Router();

module.exports = (pool) => {
  
  // ========================================
  // GET /api/promoter-eventos/:evento_id
  // Lista todos os promoters de um evento
  // ========================================
  router.get('/:evento_id', async (req, res) => {
    try {
      const { evento_id } = req.params;
      const { data_evento } = req.query;
      
      console.log('🔍 Buscando promoters do evento:', evento_id);
      console.log('📅 Data específica:', data_evento || 'Todas');
      
      let query = `
        SELECT 
          pe.id as relacionamento_id,
          pe.promoter_id,
          pe.evento_id,
          DATE_FORMAT(pe.data_evento, '%Y-%m-%d') as data_evento,
          pe.status,
          pe.funcao,
          pe.observacoes,
          pe.created_at,
          p.nome as promoter_nome,
          p.apelido as promoter_apelido,
          p.email as promoter_email,
          p.telefone as promoter_telefone,
          p.whatsapp as promoter_whatsapp,
          p.foto_url as promoter_foto,
          p.instagram as promoter_instagram,
          p.codigo_identificador,
          p.link_convite,
          e.nome_do_evento,
          e.tipo_evento,
          e.dia_da_semana,
          pl.name as establishment_name
        FROM promoter_eventos pe
        JOIN promoters p ON pe.promoter_id = p.promoter_id
        JOIN eventos e ON pe.evento_id = e.id
        LEFT JOIN places pl ON e.id_place = pl.id
        WHERE pe.evento_id = ?
      `;
      
      const params = [evento_id];
      
      if (data_evento) {
        query += ` AND pe.data_evento = ?`;
        params.push(data_evento);
      }
      
      query += ` ORDER BY pe.funcao DESC, pe.data_evento ASC, p.nome ASC`;
      
      const [promoters] = await pool.execute(query, params);
      
      console.log('✅ Promoters encontrados:', promoters.length);
      
      res.json({
        success: true,
        promoters: promoters,
        total: promoters.length
      });
      
    } catch (error) {
      console.error('❌ Erro ao buscar promoters do evento:', error);
      res.status(500).json({
        success: false,
        error: 'Erro ao buscar promoters do evento'
      });
    }
  });
  
  // ========================================
  // POST /api/promoter-eventos
  // Adiciona um promoter a um evento
  // ========================================
  router.post('/', async (req, res) => {
    try {
      const {
        promoter_id,
        evento_id,
        data_evento,
        funcao = 'responsavel',
        observacoes
      } = req.body;
      
      console.log('➕ Adicionando promoter ao evento - Dados recebidos:', {
        promoter_id,
        evento_id,
        data_evento,
        funcao,
        observacoes,
        body_completo: req.body
      });
      
      // Validar dados obrigatórios
      const missingFields = [];
      if (!promoter_id) missingFields.push('promoter_id');
      if (!evento_id) missingFields.push('evento_id');
      if (!data_evento) missingFields.push('data_evento');
      
      if (missingFields.length > 0) {
        console.log('❌ Dados obrigatórios faltando:', {
          missingFields,
          promoter_id: promoter_id,
          evento_id: evento_id,
          data_evento: data_evento,
          promoter_id_type: typeof promoter_id,
          evento_id_type: typeof evento_id,
          data_evento_type: typeof data_evento
        });
        return res.status(400).json({
          success: false,
          error: `Campos obrigatórios faltando: ${missingFields.join(', ')}`,
          missingFields,
          received: { promoter_id, evento_id, data_evento }
        });
      }
      
      // Verificar se promoter existe
      const [promoterCheck] = await pool.execute(
        'SELECT promoter_id, nome FROM promoters WHERE promoter_id = ? AND ativo = TRUE',
        [promoter_id]
      );
      
      if (promoterCheck.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Promoter não encontrado ou inativo'
        });
      }
      
      // Verificar se evento existe
      const [eventoCheck] = await pool.execute(
        'SELECT id, nome_do_evento, tipo_evento FROM eventos WHERE id = ?',
        [evento_id]
      );
      
      if (eventoCheck.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Evento não encontrado'
        });
      }
      
      // Verificar se já existe relacionamento
      const [existing] = await pool.execute(
        'SELECT id FROM promoter_eventos WHERE promoter_id = ? AND evento_id = ? AND data_evento = ?',
        [promoter_id, evento_id, data_evento]
      );
      
      if (existing.length > 0) {
        return res.status(409).json({
          success: false,
          error: 'Promoter já está vinculado a este evento nesta data'
        });
      }
      
      // Inserir relacionamento
      const [result] = await pool.execute(
        `INSERT INTO promoter_eventos 
         (promoter_id, evento_id, data_evento, funcao, observacoes, status)
         VALUES (?, ?, ?, ?, ?, 'ativo')`,
        [promoter_id, evento_id, data_evento, funcao, observacoes]
      );
      
      console.log('✅ Relacionamento criado com ID:', result.insertId);
      
      // Buscar dados completos do relacionamento criado
      const [newRelacionamento] = await pool.execute(`
        SELECT 
          pe.id as relacionamento_id,
          pe.promoter_id,
          pe.evento_id,
          pe.data_evento,
          pe.status,
          pe.funcao,
          pe.observacoes,
          pe.created_at,
          p.nome as promoter_nome,
          p.apelido as promoter_apelido,
          p.codigo_identificador,
          e.nome_do_evento
        FROM promoter_eventos pe
        JOIN promoters p ON pe.promoter_id = p.promoter_id
        JOIN eventos e ON pe.evento_id = e.id
        WHERE pe.id = ?
      `, [result.insertId]);
      
      res.json({
        success: true,
        relacionamento: newRelacionamento[0],
        message: 'Promoter adicionado ao evento com sucesso'
      });
      
    } catch (error) {
      console.error('❌ Erro ao adicionar promoter ao evento:', error);
      res.status(500).json({
        success: false,
        error: 'Erro ao adicionar promoter ao evento'
      });
    }
  });
  
  // ========================================
  // PUT /api/promoter-eventos/:relacionamento_id
  // Atualiza um relacionamento promoter-evento
  // ========================================
  router.put('/:relacionamento_id', async (req, res) => {
    try {
      const { relacionamento_id } = req.params;
      const { funcao, status, observacoes } = req.body;
      
      console.log('✏️ Atualizando relacionamento:', relacionamento_id);
      
      // Verificar se relacionamento existe
      const [existing] = await pool.execute(
        'SELECT id FROM promoter_eventos WHERE id = ?',
        [relacionamento_id]
      );
      
      if (existing.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Relacionamento não encontrado'
        });
      }
      
      // Atualizar relacionamento
      const updateFields = [];
      const updateValues = [];
      
      if (funcao !== undefined) {
        updateFields.push('funcao = ?');
        updateValues.push(funcao);
      }
      
      if (status !== undefined) {
        updateFields.push('status = ?');
        updateValues.push(status);
      }
      
      if (observacoes !== undefined) {
        updateFields.push('observacoes = ?');
        updateValues.push(observacoes);
      }
      
      if (updateFields.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Nenhum campo para atualizar'
        });
      }
      
      updateValues.push(relacionamento_id);
      
      await pool.execute(
        `UPDATE promoter_eventos SET ${updateFields.join(', ')} WHERE id = ?`,
        updateValues
      );
      
      console.log('✅ Relacionamento atualizado');
      
      res.json({
        success: true,
        message: 'Relacionamento atualizado com sucesso'
      });
      
    } catch (error) {
      console.error('❌ Erro ao atualizar relacionamento:', error);
      res.status(500).json({
        success: false,
        error: 'Erro ao atualizar relacionamento'
      });
    }
  });
  
  // ========================================
  // DELETE /api/promoter-eventos/:relacionamento_id
  // Remove um relacionamento promoter-evento
  // ========================================
  router.delete('/:relacionamento_id', async (req, res) => {
    try {
      const { relacionamento_id } = req.params;
      
      console.log('🗑️ Removendo relacionamento:', relacionamento_id);
      
      // Verificar se relacionamento existe
      const [existing] = await pool.execute(
        'SELECT id FROM promoter_eventos WHERE id = ?',
        [relacionamento_id]
      );
      
      if (existing.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Relacionamento não encontrado'
        });
      }
      
      // Remover relacionamento
      await pool.execute(
        'DELETE FROM promoter_eventos WHERE id = ?',
        [relacionamento_id]
      );
      
      console.log('✅ Relacionamento removido');
      
      res.json({
        success: true,
        message: 'Relacionamento removido com sucesso'
      });
      
    } catch (error) {
      console.error('❌ Erro ao remover relacionamento:', error);
      res.status(500).json({
        success: false,
        error: 'Erro ao remover relacionamento'
      });
    }
  });
  
  // ========================================
  // GET /api/promoter-eventos/promoter/:promoter_id
  // Lista todos os eventos de um promoter
  // ========================================
  router.get('/promoter/:promoter_id', async (req, res) => {
    try {
      const { promoter_id } = req.params;
      const { data_inicio, data_fim, status = 'ativo' } = req.query;
      
      console.log('🔍 Buscando eventos do promoter:', promoter_id);
      
      let query = `
        SELECT 
          pe.id as relacionamento_id,
          pe.promoter_id,
          pe.evento_id,
          DATE_FORMAT(pe.data_evento, '%Y-%m-%d') as data_evento,
          pe.status,
          pe.funcao,
          pe.observacoes,
          pe.created_at,
          e.nome_do_evento,
          e.tipo_evento,
          e.dia_da_semana,
          e.hora_do_evento,
          e.local_do_evento,
          e.categoria,
          e.descricao,
          pl.name as establishment_name,
          pl.id as establishment_id
        FROM promoter_eventos pe
        JOIN eventos e ON pe.evento_id = e.id
        LEFT JOIN places pl ON e.id_place = pl.id
        WHERE pe.promoter_id = ?
      `;
      
      const params = [promoter_id];
      
      if (status) {
        query += ` AND pe.status = ?`;
        params.push(status);
      }
      
      if (data_inicio) {
        query += ` AND pe.data_evento >= ?`;
        params.push(data_inicio);
      }
      
      if (data_fim) {
        query += ` AND pe.data_evento <= ?`;
        params.push(data_fim);
      }
      
      query += ` ORDER BY pe.data_evento ASC, e.hora_do_evento ASC`;
      
      const [eventos] = await pool.execute(query, params);
      
      console.log('✅ Eventos encontrados:', eventos.length);
      
      res.json({
        success: true,
        eventos: eventos,
        total: eventos.length
      });
      
    } catch (error) {
      console.error('❌ Erro ao buscar eventos do promoter:', error);
      res.status(500).json({
        success: false,
        error: 'Erro ao buscar eventos do promoter'
      });
    }
  });
  
  return router;
};
