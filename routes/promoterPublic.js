// routes/promoterPublic.js

const express = require('express');
const router = express.Router();

const BASE_EVENT_IMAGE_URL = 'https://grupoideiaum.com.br/cardapio-agilizaiapp/';

module.exports = (pool) => {
  /**
   * @route   GET /api/promoter/test
   * @desc    Endpoint de teste
   * @access  Public
   */
  router.get('/test', (req, res) => {
    res.json({ 
      success: true, 
      message: 'Rota de promoter pública funcionando!',
      timestamp: new Date().toISOString()
    });
  });

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
          p.email,
          p.user_id,
          p.foto_url,
          p.instagram,
          p.observacoes,
          p.status,
          pl.name as establishment_name
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
          email: promoter.email,
          user_id: promoter.user_id,
          foto_url: promoter.foto_url,
          instagram: promoter.instagram,
          observacoes: promoter.observacoes,
          establishment_name: promoter.establishment_name,
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

      const whatsappInput = whatsapp && whatsapp.trim() ? whatsapp.trim() : null;
      let whatsappNormalized = null;

      let whatsappProvided = false;

      if (whatsappInput) {
        const digitsOnly = whatsappInput.replace(/\D/g, '');
        if (digitsOnly.length < 8) {
          return res.status(400).json({
            success: false,
            error: 'Informe um WhatsApp válido (mínimo 8 dígitos).'
          });
        }
        whatsappNormalized = digitsOnly;
        whatsappProvided = true;
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
      const eventoIdParsed =
        typeof evento_id !== 'undefined' && evento_id !== null && `${evento_id}`.trim() !== ''
          ? Number(evento_id)
          : null;

      if (eventoIdParsed !== null && Number.isNaN(eventoIdParsed)) {
        return res.status(400).json({
          success: false,
          error: 'Evento informado é inválido.',
        });
      }

      if (!whatsappNormalized) {
        const uniqueSuffix = `${Date.now()}${Math.floor(Math.random() * 100000)}`.slice(0, 12);
        whatsappNormalized = `${promoter.promoter_id}-${uniqueSuffix}`.slice(0, 20);
      }

      // Verificar se já existe um convidado com o mesmo WhatsApp para este promoter
      // Adicionar o convidado na tabela promoter_convidados
      const [result] = await pool.execute(
        `INSERT INTO promoter_convidados (
          promoter_id, 
          nome, 
          whatsapp,
          evento_id,
          status
        ) VALUES (?, ?, ?, ?, 'pendente')`,
        [
          promoter.promoter_id,
          nome.trim(),
          whatsappNormalized,
          eventoIdParsed
        ]
      );

      // NOVO: Também adicionar na tabela listas_convidados se houver uma lista para este promoter/evento
      try {
        if (eventoIdParsed !== null) {
          // Buscar lista do promoter para este evento
          const [listas] = await pool.execute(
            `SELECT lista_id FROM listas 
             WHERE promoter_responsavel_id = ? AND evento_id = ?
             LIMIT 1`,
            [promoter.promoter_id, eventoIdParsed]
          );

          if (listas.length > 0) {
            const lista_id = listas[0].lista_id;

            // Verificar se já existe na lista (evitar duplicatas)
            if (whatsappNormalized) {
              const [existeNaLista] = await pool.execute(
              `SELECT lista_convidado_id FROM listas_convidados 
               WHERE lista_id = ? AND nome_convidado = ? AND telefone_convidado = ?`,
                [lista_id, nome.trim(), whatsappNormalized]
              );

              if (existeNaLista.length === 0) {
                // Inserir na tabela listas_convidados
                await pool.execute(
                  `INSERT INTO listas_convidados (
                    lista_id,
                    nome_convidado,
                    telefone_convidado,
                    status_checkin,
                    is_vip
                  ) VALUES (?, ?, ?, 'Pendente', FALSE)`,
                  [lista_id, nome.trim(), whatsappNormalized]
                );

                console.log(`✅ Convidado também adicionado à lista ${lista_id}`);
              }
            }
          }
        }
      } catch (listaError) {
        // Log do erro mas não falha a operação principal
        console.error('⚠️ Erro ao adicionar convidado à lista:', listaError);
      }

      res.status(201).json({ 
        success: true, 
        message: 'Você foi adicionado à lista com sucesso!',
        convidado: { 
          id: result.insertId, 
          nome: nome.trim(), 
          whatsapp: whatsappProvided ? whatsappNormalized : null,
          promoter_nome: promoter.nome
        }
      });

    } catch (error) {
      console.error('❌ Erro ao adicionar convidado à lista do promoter:', error);
      const message =
        (error && typeof error === 'object' && 'sqlMessage' in error && error.sqlMessage) ||
        (error instanceof Error ? error.message : null) ||
        'Erro interno do servidor';

      res.status(500).json({
        success: false,
        error: message,
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
          DATE_FORMAT(e.data_do_evento, '%Y-%m-%d') as data,
          e.hora_do_evento as hora,
          e.imagem_do_evento,
          pl.name as local_nome,
          pl.street as local_endereco
         FROM eventos e
         LEFT JOIN places pl ON e.id_place = pl.id
         WHERE (e.data_do_evento IS NULL OR e.data_do_evento >= CURDATE())
         ORDER BY e.data_do_evento ASC, e.hora_do_evento ASC
         LIMIT 10`,
        []
      );
      console.log('✅ Eventos encontrados:', eventos.length);

      const eventosComImagem = eventos.map((evento) => ({
        ...evento,
        imagem_url: evento.imagem_do_evento
          ? `${BASE_EVENT_IMAGE_URL}${evento.imagem_do_evento}`
          : null,
      }));

      res.json({
        success: true,
        eventos: eventosComImagem
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

