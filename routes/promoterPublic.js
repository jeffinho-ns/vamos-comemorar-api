// routes/promoterPublic.js

const express = require('express');
const router = express.Router();

module.exports = (pool) => {
  /**
   * @route   GET /api/promoter/:codigo
   * @desc    Retorna dados públicos do promoter por código
   * @access  Public
   */
  router.get('/:codigo', async (req, res) => {
    try {
      const { codigo } = req.params;
      console.log('🔍 Buscando promoter público com código:', codigo);

      // Buscar promoter
      const [promoters] = await pool.execute(
        `SELECT 
          p.promoter_id,
          p.nome,
          p.apelido,
          p.foto_url,
          p.instagram,
          p.observacoes,
          p.status,
          pl.name as establishment_name,
          pl.tipo as establishment_tipo
         FROM promoters p
         LEFT JOIN places pl ON p.establishment_id = pl.id
         WHERE p.codigo_identificador = ? AND p.ativo = TRUE AND p.status = 'Ativo'
         LIMIT 1`,
        [codigo]
      );

      console.log('📊 Promoters encontrados:', promoters.length);

      if (promoters.length === 0) {
        console.log('❌ Promoter não encontrado com código:', codigo);
        return res.status(404).json({ 
          success: false, 
          error: 'Promoter não encontrado' 
        });
      }

      const promoter = promoters[0];
      console.log('✅ Promoter encontrado:', { id: promoter.promoter_id, nome: promoter.nome });

      // Buscar estatísticas do promoter
      console.log('📊 Buscando estatísticas...');
      const [stats] = await pool.execute(
        `SELECT 
          COUNT(DISTINCT c.id) as total_convidados,
          COUNT(DISTINCT CASE WHEN c.status = 'confirmado' THEN c.id END) as total_confirmados
         FROM promoter_convidados c
         WHERE c.promoter_id = ?`,
        [promoter.promoter_id]
      );
      console.log('✅ Estatísticas obtidas:', stats[0]);

      res.json({
        success: true,
        promoter: {
          id: promoter.promoter_id,
          nome: promoter.nome,
          apelido: promoter.apelido,
          foto_url: promoter.foto_url,
          instagram: promoter.instagram,
          observacoes: promoter.observacoes,
          establishment_name: promoter.establishment_name,
          establishment_tipo: promoter.establishment_tipo,
          stats: stats[0] || { total_convidados: 0, total_confirmados: 0 }
        }
      });

    } catch (error) {
      console.error('❌ Erro ao buscar promoter público:', error);
      console.error('❌ Stack:', error.stack);
      console.error('❌ SQL Message:', error.sqlMessage);
      res.status(500).json({ 
        success: false, 
        error: 'Erro interno do servidor',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  });

  /**
   * @route   POST /api/promoter/:codigo/convidado
   * @desc    Adiciona um convidado à lista do promoter
   * @access  Public
   */
  router.post('/:codigo/convidado', async (req, res) => {
    try {
      const { codigo } = req.params;
      const { nome, whatsapp, evento_id } = req.body;

      if (!nome || !nome.trim()) {
        return res.status(400).json({ 
          success: false, 
          error: 'Nome é obrigatório' 
        });
      }

      if (!whatsapp || !whatsapp.trim()) {
        return res.status(400).json({ 
          success: false, 
          error: 'WhatsApp é obrigatório' 
        });
      }

      // Verificar se promoter existe e está ativo
      const [promoters] = await pool.execute(
        `SELECT promoter_id, nome 
         FROM promoters 
         WHERE codigo_identificador = ? AND ativo = TRUE AND status = 'Ativo'
         LIMIT 1`,
        [codigo]
      );

      if (promoters.length === 0) {
        return res.status(404).json({ 
          success: false, 
          error: 'Promoter não encontrado' 
        });
      }

      const promoter = promoters[0];

      // Verificar se já existe um convidado com o mesmo WhatsApp para este promoter
      const [existingGuests] = await pool.execute(
        `SELECT id FROM promoter_convidados 
         WHERE promoter_id = ? AND whatsapp = ?
         ${evento_id ? 'AND evento_id = ?' : 'AND evento_id IS NULL'}
         LIMIT 1`,
        evento_id ? [promoter.promoter_id, whatsapp.trim(), evento_id] : [promoter.promoter_id, whatsapp.trim()]
      );

      if (existingGuests.length > 0) {
        return res.status(400).json({ 
          success: false, 
          error: 'Você já está nesta lista!' 
        });
      }

      // Adicionar o convidado
      const [result] = await pool.execute(
        `INSERT INTO promoter_convidados (
          promoter_id, 
          nome, 
          whatsapp,
          evento_id,
          status
        ) VALUES (?, ?, ?, ?, 'pendente')`,
        [promoter.promoter_id, nome.trim(), whatsapp.trim(), evento_id || null]
      );

      res.status(201).json({ 
        success: true, 
        message: 'Você foi adicionado à lista com sucesso!',
        convidado: { 
          id: result.insertId, 
          nome: nome.trim(), 
          whatsapp: whatsapp.trim(),
          promoter_nome: promoter.nome
        }
      });

    } catch (error) {
      console.error('❌ Erro ao adicionar convidado à lista do promoter:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Erro interno do servidor' 
      });
    }
  });

  /**
   * @route   GET /api/promoter/:codigo/eventos
   * @desc    Retorna eventos disponíveis do promoter
   * @access  Public
   */
  router.get('/:codigo/eventos', async (req, res) => {
    try {
      const { codigo } = req.params;
      console.log('🔍 Buscando eventos para promoter:', codigo);

      // Buscar promoter
      const [promoters] = await pool.execute(
        `SELECT promoter_id FROM promoters 
         WHERE codigo_identificador = ? AND ativo = TRUE AND status = 'Ativo'
         LIMIT 1`,
        [codigo]
      );

      console.log('📊 Promoters encontrados para eventos:', promoters.length);

      if (promoters.length === 0) {
        console.log('❌ Promoter não encontrado para eventos:', codigo);
        return res.status(404).json({ 
          success: false, 
          error: 'Promoter não encontrado' 
        });
      }

      const promoter = promoters[0];
      console.log('✅ Promoter encontrado para eventos:', promoter.promoter_id);

      // Buscar eventos futuros que o promoter está associado
      console.log('📊 Buscando eventos futuros...');
      const [eventos] = await pool.execute(
        `SELECT 
          e.id,
          e.nome_do_evento as nome,
          e.data_do_evento as data,
          e.hora_do_evento as hora,
          pl.name as local_nome,
          pl.endereco as local_endereco
         FROM eventos e
         LEFT JOIN places pl ON e.id_place = pl.id
         WHERE e.data_do_evento >= CURDATE()
         AND e.status = 'ativo'
         ORDER BY e.data_do_evento ASC, e.hora_do_evento ASC
         LIMIT 10`,
        []
      );
      console.log('✅ Eventos encontrados:', eventos.length);

      res.json({
        success: true,
        eventos
      });

    } catch (error) {
      console.error('❌ Erro ao buscar eventos do promoter:', error);
      console.error('❌ Stack:', error.stack);
      console.error('❌ SQL Message:', error.sqlMessage);
      res.status(500).json({ 
        success: false, 
        error: 'Erro interno do servidor',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  });

  /**
   * @route   GET /api/promoter/:codigo/convidados
   * @desc    Retorna lista de convidados do promoter (pública)
   * @access  Public
   */
  router.get('/:codigo/convidados', async (req, res) => {
    try {
      const { codigo } = req.params;
      const { evento_id } = req.query;
      console.log('🔍 Buscando convidados para promoter:', codigo);

      // Buscar promoter
      const [promoters] = await pool.execute(
        `SELECT promoter_id FROM promoters 
         WHERE codigo_identificador = ? AND ativo = TRUE AND status = 'Ativo'
         LIMIT 1`,
        [codigo]
      );

      console.log('📊 Promoters encontrados para convidados:', promoters.length);

      if (promoters.length === 0) {
        console.log('❌ Promoter não encontrado para convidados:', codigo);
        return res.status(404).json({ 
          success: false, 
          error: 'Promoter não encontrado' 
        });
      }

      const promoter = promoters[0];
      console.log('✅ Promoter encontrado para convidados:', promoter.promoter_id);

      // Buscar convidados
      let query = `
        SELECT 
          c.id,
          c.nome,
          c.status,
          c.created_at,
          e.nome_do_evento as evento_nome,
          e.data_do_evento as evento_data
        FROM promoter_convidados c
        LEFT JOIN eventos e ON c.evento_id = e.id
        WHERE c.promoter_id = ?
      `;

      const params = [promoter.promoter_id];

      if (evento_id) {
        query += ` AND c.evento_id = ?`;
        params.push(evento_id);
      }

      query += ` ORDER BY c.created_at DESC`;

      console.log('📊 Executando query de convidados...');
      const [convidados] = await pool.execute(query, params);
      console.log('✅ Convidados encontrados:', convidados.length);

      // Ocultar informações sensíveis (WhatsApp) na listagem pública
      const convidadosPublicos = convidados.map(c => ({
        id: c.id,
        nome: c.nome,
        status: c.status,
        evento_nome: c.evento_nome,
        evento_data: c.evento_data
      }));

      res.json({
        success: true,
        convidados: convidadosPublicos
      });

    } catch (error) {
      console.error('❌ Erro ao buscar convidados do promoter:', error);
      console.error('❌ Stack:', error.stack);
      console.error('❌ SQL Message:', error.sqlMessage);
      res.status(500).json({ 
        success: false, 
        error: 'Erro interno do servidor',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  });

  return router;
};

