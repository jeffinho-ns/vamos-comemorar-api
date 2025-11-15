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
          TO_CHAR(pe.data_evento, 'YYYY-MM-DD') as data_evento,
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
        WHERE pe.evento_id = $1
      `;
      
      const params = [evento_id];
      let paramIndex = 2;
      
      if (data_evento) {
        query += ` AND pe.data_evento = $${paramIndex++}`;
        params.push(data_evento);
      }
      
      query += ` ORDER BY pe.funcao DESC, pe.data_evento ASC, p.nome ASC`;
      
      const promotersResult = await pool.query(query, params);
      const promoters = promotersResult.rows;
      
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
      const promoterCheckResult = await pool.query(
        'SELECT promoter_id, nome FROM promoters WHERE promoter_id = $1 AND ativo = TRUE',
        [promoter_id]
      );
      
      if (promoterCheckResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Promoter não encontrado ou inativo'
        });
      }
      
      // Verificar se evento existe
      const eventoCheckResult = await pool.query(
        'SELECT id, nome_do_evento, tipo_evento FROM eventos WHERE id = $1',
        [evento_id]
      );
      
      if (eventoCheckResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Evento não encontrado'
        });
      }
      
      // Verificar se já existe relacionamento
      const existingResult = await pool.query(
        'SELECT id FROM promoter_eventos WHERE promoter_id = $1 AND evento_id = $2 AND data_evento = $3',
        [promoter_id, evento_id, data_evento]
      );
      
      if (existingResult.rows.length > 0) {
        return res.status(409).json({
          success: false,
          error: 'Promoter já está vinculado a este evento nesta data'
        });
      }
      
      // Inserir relacionamento
      const result = await pool.query(
        `INSERT INTO promoter_eventos 
         (promoter_id, evento_id, data_evento, funcao, observacoes, status)
         VALUES ($1, $2, $3, $4, $5, 'ativo') RETURNING id`,
        [promoter_id, evento_id, data_evento, funcao, observacoes]
      );
      
      console.log('✅ Relacionamento criado com ID:', result.rows[0].id);
      
      // 🎯 NOVA FUNCIONALIDADE: Criar lista automaticamente para o promoter
      console.log('📋 Criando lista automaticamente para o promoter...');
      
      try {
        // Verificar se já existe uma lista para este promoter neste evento
        const listaExistenteResult = await pool.query(`
          SELECT lista_id FROM listas 
          WHERE evento_id = $1 AND promoter_responsavel_id = $2
        `, [evento_id, promoter_id]);
        
        let listaId = null;
        
        if (listaExistenteResult.rows.length === 0) {
          // Criar nova lista para o promoter
          const nomeLista = `Lista de ${promoterCheckResult.rows[0].nome}`;
          const listaResult = await pool.query(`
            INSERT INTO listas 
            (evento_id, promoter_responsavel_id, nome, tipo, observacoes)
            VALUES ($1, $2, $3, 'Promoter', $4) RETURNING lista_id
          `, [evento_id, promoter_id, nomeLista, observacoes || 'Lista criada automaticamente']);
          
          listaId = listaResult.rows[0].lista_id;
          console.log('✅ Lista criada automaticamente com ID:', listaId);
        } else {
          listaId = listaExistenteResult.rows[0].lista_id;
          console.log('ℹ️ Lista já existe com ID:', listaId);
        }
        
        // Adicionar informações da lista na resposta
        const listaInfoResult = await pool.query(`
          SELECT lista_id, nome, tipo FROM listas WHERE lista_id = $1
        `, [listaId]);
        
        console.log('📋 Informações da lista:', listaInfoResult.rows[0]);
        
      } catch (listaError) {
        console.error('⚠️ Erro ao criar lista automaticamente:', listaError);
        // Não falha a operação principal se der erro na criação da lista
      }
      
      // Buscar dados completos do relacionamento criado
      const newRelacionamentoResult = await pool.query(`
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
        WHERE pe.id = $1
      `, [result.rows[0].id]);
      
      res.json({
        success: true,
        relacionamento: newRelacionamentoResult.rows[0],
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
      const existingResult = await pool.query(
        'SELECT id FROM promoter_eventos WHERE id = $1',
        [relacionamento_id]
      );
      
      if (existingResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Relacionamento não encontrado'
        });
      }
      
      // Atualizar relacionamento
      const updateFields = [];
      const updateValues = [];
      let paramIndex = 1;
      
      if (funcao !== undefined) {
        updateFields.push(`funcao = $${paramIndex++}`);
        updateValues.push(funcao);
      }
      
      if (status !== undefined) {
        updateFields.push(`status = $${paramIndex++}`);
        updateValues.push(status);
      }
      
      if (observacoes !== undefined) {
        updateFields.push(`observacoes = $${paramIndex++}`);
        updateValues.push(observacoes);
      }
      
      if (updateFields.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Nenhum campo para atualizar'
        });
      }
      
      updateValues.push(relacionamento_id);
      
      await pool.query(
        `UPDATE promoter_eventos SET ${updateFields.join(', ')} WHERE id = $${paramIndex}`,
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
      const existingResult = await pool.query(
        'SELECT id FROM promoter_eventos WHERE id = $1',
        [relacionamento_id]
      );
      
      if (existingResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Relacionamento não encontrado'
        });
      }
      
      // Remover relacionamento
      await pool.query(
        'DELETE FROM promoter_eventos WHERE id = $1',
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
          TO_CHAR(pe.data_evento, 'YYYY-MM-DD') as data_evento,
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
        WHERE pe.promoter_id = $1
      `;
      
      const params = [promoter_id];
      let paramIndex = 2;
      
      if (status) {
        query += ` AND pe.status = $${paramIndex++}`;
        params.push(status);
      }
      
      if (data_inicio) {
        query += ` AND pe.data_evento >= $${paramIndex++}`;
        params.push(data_inicio);
      }
      
      if (data_fim) {
        query += ` AND pe.data_evento <= $${paramIndex++}`;
        params.push(data_fim);
      }
      
      query += ` ORDER BY pe.data_evento ASC, e.hora_do_evento ASC`;
      
      const eventosResult = await pool.query(query, params);
      const eventos = eventosResult.rows;
      
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
