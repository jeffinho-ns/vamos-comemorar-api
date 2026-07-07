// routes/promoterPublic.js

const express = require('express');
const router = express.Router();

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
      console.log('🔍 [PROMOTER] Buscando promoter público com código:', codigo);

      // Buscar promoter - tentar com status::TEXT primeiro (PostgreSQL)
      let promotersResult;
      try {
        promotersResult = await pool.query(
          `SELECT 
            p.promoter_id,
            p.nome,
            p.apelido,
            p.email,
            p.foto_url,
            p.instagram,
            p.observacoes,
            p.status,
            pl.name as establishment_name
           FROM meu_backup_db.promoters p
           LEFT JOIN meu_backup_db.places pl ON p.establishment_id = pl.id
           WHERE p.codigo_identificador = $1 AND p.ativo = TRUE AND p.status::TEXT = 'Ativo'
           LIMIT 1`,
          [codigo]
        );
        console.log('📊 [PROMOTER] Query executada com sucesso (status::TEXT)');
      } catch (queryError) {
        console.log('⚠️ [PROMOTER] Erro na primeira tentativa, tentando sem cast:', queryError.message);
        // Tentar sem cast se falhar
        promotersResult = await pool.query(
          `SELECT 
            p.promoter_id,
            p.nome,
            p.apelido,
            p.email,
            p.foto_url,
            p.instagram,
            p.observacoes,
            p.status,
            pl.name as establishment_name
           FROM meu_backup_db.promoters p
           LEFT JOIN meu_backup_db.places pl ON p.establishment_id = pl.id
           WHERE p.codigo_identificador = $1 AND p.ativo = TRUE
           LIMIT 1`,
          [codigo]
        );
        // Filtrar por status em JavaScript se necessário
        if (promotersResult.rows.length > 0 && promotersResult.rows[0].status !== 'Ativo') {
          promotersResult.rows = [];
        }
      }

      console.log('📊 [PROMOTER] Promoters encontrados:', promotersResult.rows.length);

      if (promotersResult.rows.length === 0) {
        console.log('❌ [PROMOTER] Promoter não encontrado com código:', codigo);
        return res.status(404).json({ 
          success: false, 
          error: 'Promoter não encontrado' 
        });
      }

      const promoter = promotersResult.rows[0];
      console.log('✅ [PROMOTER] Promoter encontrado:', { id: promoter.promoter_id, nome: promoter.nome });

      // Buscar estatísticas do promoter
      console.log('📊 [PROMOTER] Buscando estatísticas...');
      let statsResult;
      try {
        statsResult = await pool.query(
          `SELECT 
            COUNT(DISTINCT c.id) as total_convidados,
            COUNT(DISTINCT CASE WHEN c.status = 'confirmado' THEN c.id END) as total_confirmados
           FROM meu_backup_db.promoter_convidados c
           WHERE c.promoter_id = $1`,
          [promoter.promoter_id]
        );
        console.log('✅ [PROMOTER] Estatísticas obtidas:', statsResult.rows[0]);
      } catch (statsError) {
        console.error('⚠️ [PROMOTER] Erro ao buscar estatísticas:', statsError.message);
        statsResult = { rows: [{ total_convidados: 0, total_confirmados: 0 }] };
      }

      // Buscar user_id se existir (pode não existir na tabela)
      let userId = null;
      try {
        const userResult = await pool.query(
          'SELECT id FROM meu_backup_db.users WHERE email = $1 LIMIT 1',
          [promoter.email]
        );
        if (userResult.rows.length > 0) {
          userId = userResult.rows[0].id;
        }
      } catch (userError) {
        console.log('⚠️ [PROMOTER] Não foi possível buscar user_id:', userError.message);
      }

      res.json({
        success: true,
        promoter: {
          id: promoter.promoter_id,
          nome: promoter.nome,
          apelido: promoter.apelido,
          email: promoter.email,
          foto_url: promoter.foto_url,
          instagram: promoter.instagram,
          observacoes: promoter.observacoes,
          establishment_name: promoter.establishment_name,
          user_id: userId,
          stats: statsResult.rows[0] || { total_convidados: 0, total_confirmados: 0 }
        }
      });

    } catch (error) {
      console.error('❌ [PROMOTER] Erro ao buscar promoter público:', error);
      console.error('❌ [PROMOTER] Stack:', error.stack);
      if (error.code) {
        console.error('❌ [PROMOTER] Error Code:', error.code);
      }
      if (error.detail) {
        console.error('❌ [PROMOTER] Error Detail:', error.detail);
      }
      if (error.hint) {
        console.error('❌ [PROMOTER] Error Hint:', error.hint);
      }
      res.status(500).json({ 
        success: false, 
        error: 'Erro interno do servidor',
        message: error.message,
        details: process.env.NODE_ENV === 'development' ? {
          message: error.message,
          code: error.code,
          detail: error.detail,
          hint: error.hint
        } : undefined
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
      const { nome, whatsapp, evento_id, vip_tipo } = req.body;

      const vipTipoValue = (vip_tipo === 'M' || vip_tipo === 'F') ? vip_tipo : null;

      console.log('🔍 [CONVIDADO] Adicionando convidado:', { codigo, nome, whatsapp: whatsapp ? 'fornecido' : 'não fornecido', evento_id, vip_tipo: vipTipoValue });

      if (!nome || !nome.trim()) {
        return res.status(400).json({ 
          success: false, 
          error: 'Nome é obrigatório' 
        });
      }

      // WhatsApp é opcional - normalizar para NULL se vazio
      const whatsappValue = whatsapp && whatsapp.trim() ? whatsapp.trim() : null;

      // Verificar se promoter existe e está ativo
      let promotersResult;
      try {
        promotersResult = await pool.query(
          `SELECT promoter_id, nome, establishment_id, organization_id 
           FROM meu_backup_db.promoters 
           WHERE codigo_identificador = $1 AND ativo = TRUE AND status::TEXT = 'Ativo'
           LIMIT 1`,
          [codigo]
        );
        console.log('📊 [CONVIDADO] Query de promoter executada com sucesso (status::TEXT)');
      } catch (queryError) {
        console.log('⚠️ [CONVIDADO] Erro na primeira tentativa, tentando sem cast:', queryError.message);
        promotersResult = await pool.query(
          `SELECT promoter_id, nome, establishment_id, organization_id 
           FROM meu_backup_db.promoters 
           WHERE codigo_identificador = $1 AND ativo = TRUE
           LIMIT 1`,
          [codigo]
        );
        // Filtrar por status em JavaScript se necessário
        if (promotersResult.rows.length > 0 && promotersResult.rows[0].status !== 'Ativo') {
          promotersResult.rows = [];
        }
      }

      if (promotersResult.rows.length === 0) {
        console.log('❌ [CONVIDADO] Promoter não encontrado:', codigo);
        return res.status(404).json({ 
          success: false, 
          error: 'Promoter não encontrado' 
        });
      }

      const promoter = promotersResult.rows[0];
      // organization_id do promoter (obrigatório após migração multi-tenant 019: coluna NOT NULL)
      const orgId = promoter.organization_id != null ? promoter.organization_id : null;
      console.log('✅ [CONVIDADO] Promoter encontrado:', promoter.promoter_id, 'org:', orgId);

      // Validar limite VIP Noite Tuda (vip_tipo M/F)
      if (vipTipoValue) {
        try {
          const establishmentId = promoter.establishment_id || null;
          let vipMLimit = 0;
          let vipFLimit = 0;
          if (establishmentId) {
            const ruleResult = await pool.query(`
              SELECT vip_m_limit, vip_f_limit FROM gift_rules
              WHERE establishment_id = $1 AND tipo_beneficiario = 'PROMOTER' AND status = 'ATIVA'
              AND (promoter_id = $2 OR promoter_id IS NULL)
              ORDER BY CASE WHEN promoter_id = $2 THEN 0 ELSE 1 END
              LIMIT 1
            `, [establishmentId, promoter.promoter_id]);
            if (ruleResult.rows.length > 0) {
              const r = ruleResult.rows[0];
              vipMLimit = parseInt(r.vip_m_limit, 10) || 0;
              vipFLimit = parseInt(r.vip_f_limit, 10) || 0;
            }
          }
          const countResult = await pool.query(`
            SELECT 
              COUNT(*) FILTER (WHERE vip_tipo = 'M') as count_m,
              COUNT(*) FILTER (WHERE vip_tipo = 'F') as count_f
            FROM meu_backup_db.promoter_convidados
            WHERE promoter_id = $1
          `, [promoter.promoter_id]);
          const countM = parseInt(countResult.rows[0]?.count_m || 0, 10);
          const countF = parseInt(countResult.rows[0]?.count_f || 0, 10);
          if (vipTipoValue === 'M' && vipMLimit > 0 && countM >= vipMLimit) {
            return res.status(400).json({ success: false, error: 'Limite atingido. Entre em contato com o administrador para aumentar sua cota.' });
          }
          if (vipTipoValue === 'F' && vipFLimit > 0 && countF >= vipFLimit) {
            return res.status(400).json({ success: false, error: 'Limite atingido. Entre em contato com o administrador para aumentar sua cota.' });
          }
        } catch (limitErr) {
          if (limitErr.code === '42703') {
            // coluna vip_tipo ou vip_m_limit não existe - ignorar validação
          } else {
            throw limitErr;
          }
        }
      }

      // Verificar se já existe um convidado com o mesmo nome e WhatsApp (se fornecido) para este promoter
      // Se WhatsApp não foi fornecido, verificar apenas por nome e evento
      let existingGuestsResult;
      try {
        if (whatsappValue) {
          // Se WhatsApp foi fornecido, verificar duplicata por WhatsApp
          if (evento_id) {
            existingGuestsResult = await pool.query(
              `SELECT id FROM meu_backup_db.promoter_convidados 
               WHERE promoter_id = $1 AND whatsapp = $2 AND evento_id = $3
               LIMIT 1`,
              [promoter.promoter_id, whatsappValue, evento_id]
            );
          } else {
            existingGuestsResult = await pool.query(
              `SELECT id FROM meu_backup_db.promoter_convidados 
               WHERE promoter_id = $1 AND whatsapp = $2 AND evento_id IS NULL
               LIMIT 1`,
              [promoter.promoter_id, whatsappValue]
            );
          }
        } else {
          // Se WhatsApp não foi fornecido, verificar duplicata apenas por nome e evento
          if (evento_id) {
            existingGuestsResult = await pool.query(
              `SELECT id FROM meu_backup_db.promoter_convidados 
               WHERE promoter_id = $1 AND nome = $2 AND evento_id = $3 AND (whatsapp IS NULL OR whatsapp = '')
               LIMIT 1`,
              [promoter.promoter_id, nome.trim(), evento_id]
            );
          } else {
            existingGuestsResult = await pool.query(
              `SELECT id FROM meu_backup_db.promoter_convidados 
               WHERE promoter_id = $1 AND nome = $2 AND evento_id IS NULL AND (whatsapp IS NULL OR whatsapp = '')
               LIMIT 1`,
              [promoter.promoter_id, nome.trim()]
            );
          }
        }
        console.log('📊 [CONVIDADO] Verificação de duplicatas concluída');
      } catch (duplicateCheckError) {
        console.error('⚠️ [CONVIDADO] Erro ao verificar duplicatas (continuando):', duplicateCheckError.message);
        // Continuar mesmo se a verificação de duplicatas falhar
        existingGuestsResult = { rows: [] };
      }

      if (existingGuestsResult.rows.length > 0) {
        console.log('⚠️ [CONVIDADO] Convidado já existe na lista');
        return res.status(400).json({ 
          success: false, 
          error: 'Você já está nesta lista!' 
        });
      }

      // Adicionar o convidado na tabela promoter_convidados
      // Se whatsapp está vazio, verificar ANTES se já existe outro registro com whatsapp vazio para o mesmo evento
      // Isso evita violação do índice único idx_promoter_whatsapp_evento
      let whatsappForInsert = whatsappValue || '';
      let result;
      
      if (!whatsappValue) {
        // Verificar se já existe um registro com whatsapp vazio para o mesmo evento
        const checkEmptyWhatsapp = await pool.query(
          `SELECT id, nome FROM meu_backup_db.promoter_convidados 
           WHERE promoter_id = $1 AND evento_id = $2 AND (whatsapp IS NULL OR whatsapp = '')
           LIMIT 1`,
          [promoter.promoter_id, evento_id || null]
        );
        
        if (checkEmptyWhatsapp.rows.length > 0) {
          // Já existe um registro com whatsapp vazio
          // Verificar se é o mesmo nome
          const existingNome = checkEmptyWhatsapp.rows[0].nome;
          if (existingNome.toLowerCase().trim() === nome.toLowerCase().trim()) {
            // É realmente um duplicado por nome
            console.log('⚠️ [CONVIDADO] Convidado já existe na lista (mesmo nome)');
            return res.status(400).json({ 
              success: false, 
              error: 'Você já está nesta lista!' 
            });
          }
          
          // Nome diferente, mas índice único bloqueia string vazia
          // Tentar usar NULL primeiro
          try {
            result = await pool.query(
              `INSERT INTO meu_backup_db.promoter_convidados (
                promoter_id, nome, whatsapp, evento_id, status, vip_tipo, organization_id
              ) VALUES ($1, $2, NULL, $3, 'pendente', $4, $5) RETURNING id`,
              [promoter.promoter_id, nome.trim(), evento_id || null, vipTipoValue, orgId]
            );
            console.log('✅ [CONVIDADO] Convidado adicionado com sucesso (usando NULL para WhatsApp):', result.rows[0].id);
          } catch (nullError) {
            if (nullError.code === '42703') {
              result = await pool.query(
                `INSERT INTO meu_backup_db.promoter_convidados (promoter_id, nome, whatsapp, evento_id, status, organization_id)
                 VALUES ($1, $2, NULL, $3, 'pendente', $4) RETURNING id`,
                [promoter.promoter_id, nome.trim(), evento_id || null, orgId]
              );
              console.log('✅ [CONVIDADO] Convidado adicionado (NULL WhatsApp, tabela sem vip_tipo):', result.rows[0].id);
            } else {
              // Se NULL não funcionar, usar um valor único curto
              const timestamp = Date.now().toString(36).substr(-6);
              const random = Math.random().toString(36).substr(2, 6);
              whatsappForInsert = `nw_${timestamp}_${random}`;
              console.log('📊 [CONVIDADO] Usando valor único temporário para WhatsApp:', whatsappForInsert);
            }
          }
        }
      }
      
      // Se ainda não foi inserido (não entrou no bloco acima com NULL), inserir normalmente
      if (!result) {
        try {
          result = await pool.query(
            `INSERT INTO meu_backup_db.promoter_convidados (
              promoter_id, 
              nome, 
              whatsapp,
              evento_id,
              status,
              vip_tipo,
              organization_id
            ) VALUES ($1, $2, $3, $4, 'pendente', $5, $6) RETURNING id`,
            [promoter.promoter_id, nome.trim(), whatsappForInsert, evento_id || null, vipTipoValue, orgId]
          );
          console.log('✅ [CONVIDADO] Convidado adicionado com sucesso:', result.rows[0].id);
        } catch (insertError) {
          if (insertError.code === '42703') {
            result = await pool.query(
              `INSERT INTO meu_backup_db.promoter_convidados (promoter_id, nome, whatsapp, evento_id, status, organization_id)
               VALUES ($1, $2, $3, $4, 'pendente', $5) RETURNING id`,
              [promoter.promoter_id, nome.trim(), whatsappForInsert, evento_id || null, orgId]
            );
            console.log('✅ [CONVIDADO] Convidado adicionado (tabela sem vip_tipo):', result.rows[0].id);
          } else if (insertError.code === '23505') {
            // Ainda assim deu erro de constraint única
            console.log('⚠️ [CONVIDADO] Erro de constraint única após verificação');
            return res.status(400).json({ 
              success: false, 
              error: 'Convidado já existe nesta lista!' 
            });
          } else if (insertError.code === '23502' || insertError.message.includes('NOT NULL')) {
            // Se falhar por causa de NOT NULL, tentar com string vazia
            result = await pool.query(
              `INSERT INTO meu_backup_db.promoter_convidados (
                promoter_id, 
                nome, 
                whatsapp,
                evento_id,
                status,
                vip_tipo,
                organization_id
              ) VALUES ($1, $2, '', $3, 'pendente', $4, $5) RETURNING id`,
              [promoter.promoter_id, nome.trim(), evento_id || null, vipTipoValue, orgId]
            );
            console.log('✅ [CONVIDADO] Convidado adicionado com sucesso (sem WhatsApp):', result.rows[0].id);
          } else {
            throw insertError;
          }
        }
      }

      // NOVO: Também adicionar na tabela listas_convidados se houver uma lista para este promoter/evento
      try {
        if (evento_id) {
          // Buscar lista do promoter para este evento
          const listasResult = await pool.query(
            `SELECT lista_id, organization_id FROM meu_backup_db.listas 
             WHERE promoter_responsavel_id = $1 AND evento_id = $2
             LIMIT 1`,
            [promoter.promoter_id, evento_id]
          );

          if (listasResult.rows.length > 0) {
            const lista_id = listasResult.rows[0].lista_id;
            // organization_id é obrigatório para o convidado ficar visível na leitura
            // com contexto de tenant (página de check-ins). Usa o da lista; senão, o do promoter.
            const listaOrgId = listasResult.rows[0].organization_id != null
              ? listasResult.rows[0].organization_id
              : orgId;

            // Verificar se já existe na lista (evitar duplicatas)
            // Se WhatsApp foi fornecido, verificar por nome e telefone, senão apenas por nome
            let existeNaListaResult;
            if (whatsappValue) {
              existeNaListaResult = await pool.query(
                `SELECT lista_convidado_id FROM meu_backup_db.listas_convidados 
                 WHERE lista_id = $1 AND nome_convidado = $2 AND telefone_convidado = $3`,
                [lista_id, nome.trim(), whatsappValue]
              );
            } else {
              existeNaListaResult = await pool.query(
                `SELECT lista_convidado_id FROM meu_backup_db.listas_convidados 
                 WHERE lista_id = $1 AND nome_convidado = $2 AND (telefone_convidado IS NULL OR telefone_convidado = '')`,
                [lista_id, nome.trim()]
              );
            }

            if (existeNaListaResult.rows.length === 0) {
              try {
                await pool.query(
                  `INSERT INTO meu_backup_db.listas_convidados (
                    lista_id, nome_convidado, telefone_convidado, status_checkin, is_vip, vip_tipo, organization_id
                  ) VALUES ($1, $2, $3, 'Pendente', $4, $5, $6)`,
                  [lista_id, nome.trim(), whatsappValue || null, !!vipTipoValue, vipTipoValue, listaOrgId]
                );
              } catch (listaInsertErr) {
                if (listaInsertErr.code === '42703') {
                  // Fallback: coluna vip_tipo (ou outra) ausente — mantém organization_id
                  try {
                    await pool.query(
                      `INSERT INTO meu_backup_db.listas_convidados (
                        lista_id, nome_convidado, telefone_convidado, status_checkin, is_vip, organization_id
                      ) VALUES ($1, $2, $3, 'Pendente', $4, $5)`,
                      [lista_id, nome.trim(), whatsappValue || null, !!vipTipoValue, listaOrgId]
                    );
                  } catch (listaInsertErr2) {
                    if (listaInsertErr2.code === '42703') {
                      // Banco legado sem organization_id
                      await pool.query(
                        `INSERT INTO meu_backup_db.listas_convidados (
                          lista_id, nome_convidado, telefone_convidado, status_checkin, is_vip
                        ) VALUES ($1, $2, $3, 'Pendente', $4)`,
                        [lista_id, nome.trim(), whatsappValue || null, !!vipTipoValue]
                      );
                    } else {
                      throw listaInsertErr2;
                    }
                  }
                } else {
                  throw listaInsertErr;
                }
              }
              console.log(`✅ [CONVIDADO] Convidado também adicionado à lista ${lista_id}`);
            }
          }
        }
      } catch (listaError) {
        console.error('⚠️ [CONVIDADO] Erro ao adicionar convidado à lista:', listaError);
      }

      res.status(201).json({ 
        success: true, 
        message: 'Você foi adicionado à lista com sucesso!',
        convidado: { 
          id: result.rows[0].id, 
          nome: nome.trim(), 
          whatsapp: whatsappValue || null,
          promoter_nome: promoter.nome
        }
      });

    } catch (error) {
      console.error('❌ [CONVIDADO] Erro ao adicionar convidado à lista do promoter:', error);
      console.error('❌ [CONVIDADO] Stack:', error.stack);
      if (error.code) {
        console.error('❌ [CONVIDADO] Error Code:', error.code);
      }
      if (error.detail) {
        console.error('❌ [CONVIDADO] Error Detail:', error.detail);
      }
      if (error.hint) {
        console.error('❌ [CONVIDADO] Error Hint:', error.hint);
      }
      if (error.message) {
        console.error('❌ [CONVIDADO] Error Message:', error.message);
      }
      res.status(500).json({ 
        success: false, 
        error: 'Erro interno do servidor',
        message: error.message,
        details: process.env.NODE_ENV === 'development' ? {
          message: error.message,
          code: error.code,
          detail: error.detail,
          hint: error.hint,
          stack: error.stack
        } : undefined
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
      console.log('🔍 [EVENTOS] Buscando eventos para promoter:', codigo);

      // Buscar promoter com establishment_id - usar schema explícito
      let promotersResult;
      try {
        promotersResult = await pool.query(
          `SELECT promoter_id, establishment_id 
           FROM meu_backup_db.promoters 
           WHERE codigo_identificador = $1 AND ativo = TRUE
           LIMIT 1`,
          [codigo]
        );
        console.log('📊 [EVENTOS] Query de promoter executada com sucesso');
      } catch (promoterQueryError) {
        console.error('❌ [EVENTOS] Erro na query de promoter:', promoterQueryError);
        throw promoterQueryError;
      }

      console.log('📊 [EVENTOS] Promoters encontrados:', promotersResult.rows.length);

      if (promotersResult.rows.length === 0) {
        console.log('❌ [EVENTOS] Promoter não encontrado:', codigo);
        return res.status(404).json({ 
          success: false, 
          error: 'Promoter não encontrado' 
        });
      }

      const promoter = promotersResult.rows[0];
      console.log('✅ [EVENTOS] Promoter encontrado:', {
        promoter_id: promoter.promoter_id,
        establishment_id: promoter.establishment_id,
        establishment_id_type: typeof promoter.establishment_id
      });

      // Buscar eventos diretamente do banco de dados
      console.log('📊 [EVENTOS] Buscando eventos do banco de dados...');
      const BASE_IMAGE_URL = 'https://grupoideiaum.com.br/cardapio-agilizaiapp/';
      
      // Função auxiliar para construir URL completa de imagem
      const buildImageUrl = (imageValue) => {
        if (!imageValue) return null;
        const trimmed = String(imageValue).trim();
        if (!trimmed || trimmed === 'null' || trimmed === 'undefined') return null;
        // Se já é uma URL completa (Cloudinary, FTP ou outro serviço), usar diretamente
        if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
          return trimmed;
        }
        // Se ainda é apenas um filename (legado do FTP), construir URL do FTP
        return `${BASE_IMAGE_URL}${trimmed}`;
      };

      // Função assíncrona para buscar URL do Cloudinary na tabela cardapio_images
      const getCloudinaryUrl = async (filename) => {
        if (!filename || filename.startsWith('http://') || filename.startsWith('https://')) {
          return null; // Já é uma URL completa ou não tem filename
        }
        
        try {
          const result = await pool.query(
            'SELECT url FROM cardapio_images WHERE filename = $1 LIMIT 1',
            [filename]
          );
          
          if (result.rows.length > 0 && result.rows[0].url) {
            return result.rows[0].url; // Retorna URL completa do Cloudinary
          }
        } catch (error) {
          console.error('Erro ao buscar URL do Cloudinary:', error);
        }
        
        return null;
      };
      
      // Buscar eventos únicos diretamente do banco
      let eventsResult;
      try {
        eventsResult = await pool.query(
          `SELECT
            id, casa_do_evento, nome_do_evento, 
            TO_CHAR(data_do_evento, 'YYYY-MM-DD') as data_do_evento, 
            hora_do_evento,
            local_do_evento, tipo_evento, id_place,
            imagem_do_evento
          FROM meu_backup_db.eventos
          WHERE tipo_evento = 'unico'
          ORDER BY 
            CASE WHEN data_do_evento IS NULL THEN 1 ELSE 0 END,
            data_do_evento ASC NULLS LAST,
            hora_do_evento ASC NULLS LAST`,
          []
        );
        console.log('📊 [EVENTOS] Query de eventos executada com sucesso');
      } catch (eventsQueryError) {
        console.error('❌ [EVENTOS] Erro na query de eventos:', eventsQueryError);
        throw eventsQueryError;
      }
      
      // Adicionar URLs completas das imagens (buscando do Cloudinary quando necessário)
      const allEvents = await Promise.all(eventsResult.rows.map(async (event) => {
        let imagemEventoUrl = buildImageUrl(event.imagem_do_evento);
        
        // Se a URL foi construída do FTP, tentar buscar no Cloudinary
        if (imagemEventoUrl && imagemEventoUrl.startsWith(BASE_IMAGE_URL)) {
          const cloudinaryUrl = await getCloudinaryUrl(event.imagem_do_evento);
          if (cloudinaryUrl) {
            imagemEventoUrl = cloudinaryUrl;
          }
        }
        
        return {
          ...event,
          tipoEvento: event.tipo_evento,
          nome_do_evento: event.nome_do_evento,
          imagem_do_evento_url: imagemEventoUrl
        };
      }));
      
      console.log('📊 [EVENTOS] Total de eventos obtidos do banco:', allEvents.length);

      // Buscar eventos associados ao promoter via promoter_eventos
      let promoterEventsResult;
      try {
        // No PostgreSQL, ENUMs podem precisar de cast explícito
        promoterEventsResult = await pool.query(
          `SELECT DISTINCT evento_id 
           FROM meu_backup_db.promoter_eventos 
           WHERE promoter_id = $1 AND status::TEXT = 'ativo'`,
          [promoter.promoter_id]
        );
        console.log('📊 [EVENTOS] Query de promoter_eventos executada com sucesso');
      } catch (promoterEventsQueryError) {
        console.error('❌ [EVENTOS] Erro na query de promoter_eventos:', promoterEventsQueryError.message);
        // Tentar sem o cast se falhar
        try {
          promoterEventsResult = await pool.query(
            `SELECT DISTINCT evento_id 
             FROM meu_backup_db.promoter_eventos 
             WHERE promoter_id = $1 AND status = 'ativo'`,
            [promoter.promoter_id]
          );
          console.log('📊 [EVENTOS] Query de promoter_eventos executada com sucesso (sem cast)');
        } catch (secondError) {
          console.error('❌ [EVENTOS] Erro na segunda tentativa:', secondError.message);
          // Não falhar se a tabela não existir ou houver erro, apenas logar
          promoterEventsResult = { rows: [] };
        }
      }
      
      const promoterEventIds = new Set(promoterEventsResult.rows.map(row => row.evento_id));
      console.log('📊 [EVENTOS] Eventos associados ao promoter:', promoterEventIds.size);

      // Filtrar eventos
      const now = new Date();
      const today = new Date(now);
      today.setHours(0, 0, 0, 0);
      // Madrugada: 00:00 até 05:59 do dia seguinte — evento do "dia anterior" ainda pode aceitar entradas
      const hour = now.getHours();
      const isMadrugada = hour >= 0 && hour < 6;
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);

      // Converter establishment_id para número se necessário
      const establishmentId = promoter.establishment_id ? 
        (typeof promoter.establishment_id === 'string' ? parseInt(promoter.establishment_id, 10) : promoter.establishment_id) 
        : null;
      
      console.log('📊 [EVENTOS] Filtrando eventos com establishment_id:', establishmentId);

      const filteredEvents = allEvents
        .filter(event => {
          // Eventos associados ao promoter — sempre incluir (permite adicionar nomes mesmo após meia-noite)
          if (promoterEventIds.has(event.id)) {
            console.log('✅ [EVENTOS] Evento', event.id, 'associado ao promoter');
            return true;
          }
          
          // OU eventos únicos do estabelecimento do promoter que não têm data ou têm data futura/hoje/ontem na madrugada
          if (establishmentId) {
            // Converter id_place para número se necessário
            const eventPlaceId = event.id_place ? 
              (typeof event.id_place === 'string' ? parseInt(event.id_place, 10) : event.id_place) 
              : null;
            
            const matchesEstablishment = eventPlaceId === establishmentId || 
                                        (event.casa_do_evento && 
                                         event.casa_do_evento.toLowerCase().includes('high'));
            
            if (matchesEstablishment && event.tipoEvento === 'unico') {
              if (!event.data_do_evento) {
                console.log('✅ [EVENTOS] Evento', event.id, 'sem data, incluindo');
                return true;
              }
              const eventDate = new Date(event.data_do_evento);
              eventDate.setHours(0, 0, 0, 0);
              const isFutureOrToday = eventDate >= today;
              // Evento do dia anterior ainda válido durante a madrugada (ex.: 27/02 ativo até 05:59 do dia 28)
              const isYesterdayDuringMadrugada = isMadrugada && eventDate.getTime() === yesterday.getTime();
              const isActive = isFutureOrToday || isYesterdayDuringMadrugada;
              if (isActive) {
                console.log('✅ [EVENTOS] Evento', event.id, isYesterdayDuringMadrugada ? 'dia anterior na madrugada, incluindo' : 'data futura/hoje, incluindo');
              }
              return isActive;
            }
          }
          
          return false;
        })
        .map(event => ({
          id: event.id,
          nome: event.nome_do_evento,
          data: event.data_do_evento || null,
          hora: event.hora_do_evento || null,
          local_nome: event.local_do_evento || null,
          local_endereco: null,
          imagem_url: event.imagem_do_evento_url || (event.imagem_do_evento ? `${BASE_IMAGE_URL}${event.imagem_do_evento}` : null)
        }))
        .sort((a, b) => {
          // Ordenar: eventos sem data primeiro, depois por data
          if (!a.data && !b.data) return 0;
          if (!a.data) return 1;
          if (!b.data) return -1;
          return new Date(a.data) - new Date(b.data);
        })
        .slice(0, 20);

      console.log('✅ [EVENTOS] Eventos filtrados:', filteredEvents.length);
      console.log('📊 [EVENTOS] Detalhes dos eventos filtrados:', filteredEvents.map(e => ({ id: e.id, nome: e.nome, data: e.data })));

      res.json({
        success: true,
        eventos: filteredEvents
      });

    } catch (error) {
      console.error('❌ [EVENTOS] Erro ao buscar eventos do promoter:', error);
      console.error('❌ [EVENTOS] Stack:', error.stack);
      if (error.code) {
        console.error('❌ [EVENTOS] Error Code:', error.code);
      }
      if (error.detail) {
        console.error('❌ [EVENTOS] Error Detail:', error.detail);
      }
      if (error.hint) {
        console.error('❌ [EVENTOS] Error Hint:', error.hint);
      }
      if (error.message) {
        console.error('❌ [EVENTOS] Error Message:', error.message);
      }
      res.status(500).json({ 
        success: false, 
        error: 'Erro interno do servidor',
        message: error.message,
        details: process.env.NODE_ENV === 'development' ? {
          message: error.message,
          code: error.code,
          detail: error.detail,
          hint: error.hint,
          stack: error.stack
        } : undefined
      });
    }
  });

  /**
   * @route   GET /api/promoter/:codigo/checkins
   * @desc    Retorna contagem de check-ins reais do promoter por evento (apenas convidados da lista do promoter)
   * @access  Public
   */
  router.get('/:codigo/checkins', async (req, res) => {
    try {
      const { codigo } = req.params;
      let promotersResult;
      try {
        promotersResult = await pool.query(
          `SELECT promoter_id FROM meu_backup_db.promoters 
           WHERE codigo_identificador = $1 AND ativo = TRUE AND status::TEXT = 'Ativo'
           LIMIT 1`,
          [codigo]
        );
      } catch (queryError) {
        promotersResult = await pool.query(
          `SELECT promoter_id FROM meu_backup_db.promoters 
           WHERE codigo_identificador = $1 AND ativo = TRUE
           LIMIT 1`,
          [codigo]
        );
        if (promotersResult.rows.length > 0 && promotersResult.rows[0].status !== 'Ativo') {
          promotersResult.rows = [];
        }
      }
      if (promotersResult.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Promoter não encontrado' });
      }
      const promoterId = promotersResult.rows[0].promoter_id;

      // Buscar eventos reais do promoter (promoter_eventos) - apenas eventos atrelados
      const eventosResult = await pool.query(`
        SELECT pe.evento_id, TO_CHAR(pe.data_evento, 'YYYY-MM-DD') as data_evento, e.nome_do_evento, e.tipo_evento
        FROM meu_backup_db.promoter_eventos pe
        INNER JOIN meu_backup_db.eventos e ON e.id = pe.evento_id
        WHERE pe.promoter_id = $1 AND (pe.status IS NULL OR pe.status::TEXT ILIKE '%ativo%')
        ORDER BY pe.data_evento ASC NULLS LAST
      `, [promoterId]);

      const checkinsPorEvento = {};
      const eventosComCheckins = [];
      for (const ev of eventosResult.rows || []) {
        const eventoId = ev.evento_id;
        const dataEvento = ev.data_evento;
        const dataEventoStr = dataEvento ? (typeof dataEvento === 'string' ? dataEvento : new Date(dataEvento).toISOString().split('T')[0]) : null;
        // Usar pe.data_evento para filtrar check-ins do dia específico
        const checkinsRes = await pool.query(`
          SELECT COUNT(DISTINCT lc.lista_convidado_id) as total_checkins
          FROM meu_backup_db.listas_convidados lc
          INNER JOIN meu_backup_db.listas l ON lc.lista_id = l.lista_id
          LEFT JOIN meu_backup_db.promoter_eventos pe ON pe.promoter_id = l.promoter_responsavel_id AND pe.evento_id = $2
          WHERE l.promoter_responsavel_id = $1
          AND (l.evento_id = $2 OR (l.evento_id IS NULL AND pe.evento_id = $2))
          AND lc.status_checkin = 'Check-in'
          AND lc.data_checkin IS NOT NULL
          AND (
            $3::DATE IS NULL
            OR (
              (lc.data_checkin::timestamptz AT TIME ZONE 'America/Sao_Paulo')::DATE = $3::DATE
              OR lc.data_checkin::DATE = $3::DATE
            )
          )
        `, [promoterId, eventoId, dataEventoStr]);
        const totalCheckins = parseInt(checkinsRes.rows[0]?.total_checkins || 0);
        const chave = `${eventoId}|${dataEventoStr || ''}`;
        checkinsPorEvento[chave] = totalCheckins;
        eventosComCheckins.push({
          evento_id: eventoId,
          data_evento: dataEventoStr,
          nome_do_evento: ev.nome_do_evento,
          checkins: totalCheckins
        });
      }
      res.json({ success: true, checkins_por_evento: checkinsPorEvento, eventos: eventosComCheckins });
    } catch (error) {
      console.error('Erro ao buscar check-ins do promoter:', error);
      res.status(500).json({ success: false, error: 'Erro ao buscar check-ins' });
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
      console.log('🔍 [CONVIDADOS] Buscando convidados para promoter:', codigo);

      // Buscar promoter - tentar com status::TEXT primeiro (PostgreSQL)
      let promotersResult;
      try {
        promotersResult = await pool.query(
          `SELECT promoter_id FROM meu_backup_db.promoters 
           WHERE codigo_identificador = $1 AND ativo = TRUE AND status::TEXT = 'Ativo'
           LIMIT 1`,
          [codigo]
        );
        console.log('📊 [CONVIDADOS] Query de promoter executada com sucesso (status::TEXT)');
      } catch (queryError) {
        console.log('⚠️ [CONVIDADOS] Erro na primeira tentativa, tentando sem cast:', queryError.message);
        // Tentar sem cast se falhar
        promotersResult = await pool.query(
          `SELECT promoter_id FROM meu_backup_db.promoters 
           WHERE codigo_identificador = $1 AND ativo = TRUE
           LIMIT 1`,
          [codigo]
        );
        // Filtrar por status em JavaScript se necessário
        if (promotersResult.rows.length > 0 && promotersResult.rows[0].status !== 'Ativo') {
          promotersResult.rows = [];
        }
      }

      console.log('📊 [CONVIDADOS] Promoters encontrados:', promotersResult.rows.length);

      if (promotersResult.rows.length === 0) {
        console.log('❌ [CONVIDADOS] Promoter não encontrado:', codigo);
        return res.status(404).json({ 
          success: false, 
          error: 'Promoter não encontrado' 
        });
      }

      const promoter = promotersResult.rows[0];
      console.log('✅ [CONVIDADOS] Promoter encontrado:', promoter.promoter_id);

      let query = `
        SELECT 
          c.id,
          c.nome,
          c.status,
          c.created_at,
          c.whatsapp,
          e.nome_do_evento as evento_nome,
          e.data_do_evento as evento_data
        FROM meu_backup_db.promoter_convidados c
        LEFT JOIN meu_backup_db.eventos e ON c.evento_id = e.id
        WHERE c.promoter_id = $1
      `;
      const params = [promoter.promoter_id];
      if (evento_id) {
        query += ` AND c.evento_id = $2`;
        params.push(evento_id);
      }
      query += ` ORDER BY c.created_at DESC`;

      let convidadosResult;
      try {
        convidadosResult = await pool.query(
          query.replace('c.whatsapp,', 'c.whatsapp, c.vip_tipo,'),
          params
        );
      } catch (colErr) {
        if (colErr.code === '42703') {
          convidadosResult = await pool.query(query, params);
        } else {
          throw colErr;
        }
      }

      console.log('✅ [CONVIDADOS] Convidados encontrados:', convidadosResult.rows.length);

      const convidadosPublicos = convidadosResult.rows.map(c => ({
        id: c.id,
        nome: c.nome,
        status: c.status,
        evento_nome: c.evento_nome,
        evento_data: c.evento_data,
        whatsapp: c.whatsapp || null,
        vip_tipo: (c.vip_tipo === 'M' || c.vip_tipo === 'F') ? c.vip_tipo : null
      }));

      res.json({
        success: true,
        convidados: convidadosPublicos
      });

    } catch (error) {
      console.error('❌ [CONVIDADOS] Erro ao buscar convidados do promoter:', error);
      console.error('❌ [CONVIDADOS] Stack:', error.stack);
      if (error.code) {
        console.error('❌ [CONVIDADOS] Error Code:', error.code);
      }
      if (error.detail) {
        console.error('❌ [CONVIDADOS] Error Detail:', error.detail);
      }
      if (error.hint) {
        console.error('❌ [CONVIDADOS] Error Hint:', error.hint);
      }
      res.status(500).json({ 
        success: false, 
        error: 'Erro interno do servidor',
        message: error.message,
        details: process.env.NODE_ENV === 'development' ? {
          message: error.message,
          code: error.code,
          detail: error.detail,
          hint: error.hint
        } : undefined
      });
    }
  });

  return router;
};

