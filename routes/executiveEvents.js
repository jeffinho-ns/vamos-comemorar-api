// routes/executiveEvents.js
// Sistema de Executive Event Menus - Cardápios temporários para eventos corporativos

const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');

// Função helper para gerar slug a partir de string
function generateSlug(text) {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')           // Substitui espaços por hífens
    .replace(/[^\w\-]+/g, '')       // Remove caracteres não alfanuméricos
    .replace(/\-\-+/g, '-')         // Substitui múltiplos hífens por um único
    .replace(/^-+/, '')              // Remove hífens do início
    .replace(/-+$/, '');             // Remove hífens do fim
}

// Schema padrão (tabelas estão em meu_backup_db)
const SCHEMA = 'meu_backup_db';

module.exports = (pool) => {
  
  // ============================================
  // POST /api/executive-events - Criar Evento
  // ============================================
  router.post('/', auth, async (req, res) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const {
        establishment_id,
        name,
        event_date,
        logo_url,
        cover_image_url,
        category_ids = [],
        subcategory_ids = [],
        custom_colors = {},
        welcome_message = null,
        wifi_info = null
      } = req.body;

      // Validações
      if (!establishment_id || !name || !event_date) {
        await client.query('ROLLBACK');
        return res.status(400).json({ 
          error: 'establishment_id, name e event_date são obrigatórios.' 
        });
      }

      // Verificar se establishment existe
      const establishmentCheck = await client.query(
        `SELECT id FROM ${SCHEMA}.bars WHERE id = $1`,
        [establishment_id]
      );
      if (establishmentCheck.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Estabelecimento não encontrado.' });
      }

      // Gerar slug único
      const baseSlug = generateSlug(name);
      let slug = baseSlug;
      let slugExists = true;
      let counter = 1;

      while (slugExists) {
        const slugCheck = await client.query(
          `SELECT id FROM ${SCHEMA}.executive_events WHERE slug = $1`,
          [slug]
        );
        if (slugCheck.rows.length === 0) {
          slugExists = false;
        } else {
          slug = `${baseSlug}-${counter}`;
          counter++;
        }
      }

      // Criar evento
      const eventResult = await client.query(
        `INSERT INTO ${SCHEMA}.executive_events 
         (establishment_id, name, event_date, logo_url, cover_image_url, slug)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id`,
        [establishment_id, name, event_date, logo_url, cover_image_url, slug]
      );

      const eventId = eventResult.rows[0].id;

      // Criar settings
      await client.query(
        `INSERT INTO ${SCHEMA}.event_settings 
         (event_id, custom_colors, welcome_message, wifi_info)
         VALUES ($1, $2, $3, $4)`,
        [
          eventId,
          Object.keys(custom_colors).length > 0 ? JSON.stringify(custom_colors) : null,
          welcome_message || null,
          wifi_info ? JSON.stringify(wifi_info) : null
        ]
      );

      // AUTOMAÇÃO: Buscar itens por categorias
      const itemsToLink = new Set();
      
      if (Array.isArray(category_ids) && category_ids.length > 0) {
        // Verificar se campos deleted_at e visible existem
        let hasDeletedAt = false;
        let hasVisible = false;
        try {
          const columnsResult = await client.query(
            `SELECT column_name 
             FROM information_schema.columns 
             WHERE table_schema = $1 
               AND table_name = 'menu_items' 
               AND column_name IN ('deleted_at', 'visible')`,
            [SCHEMA]
          );
          const columns = columnsResult.rows.map(row => row.column_name);
          hasDeletedAt = columns.includes('deleted_at');
          hasVisible = columns.includes('visible');
        } catch (e) {
          console.log('⚠️ Erro ao verificar colunas, usando versão compatível');
        }

        let query = `SELECT id FROM ${SCHEMA}.menu_items 
           WHERE "categoryId" = ANY($1::int[])
             AND "barId" = $2`;
        
        if (hasDeletedAt) {
          query += ` AND deleted_at IS NULL`;
        }
        if (hasVisible) {
          query += ` AND (visible IS NULL OR visible = true)`;
        }

        const categoryItems = await client.query(query, [category_ids, establishment_id]);
        categoryItems.rows.forEach(row => itemsToLink.add(row.id));
      }

      // AUTOMAÇÃO: Buscar itens por subcategorias
      if (Array.isArray(subcategory_ids) && subcategory_ids.length > 0) {
        // Nota: subcategory_ids são nomes (VARCHAR), não IDs
        // Verificar se campos deleted_at e visible existem
        let hasDeletedAt = false;
        let hasVisible = false;
        try {
          const columnsResult = await client.query(
            `SELECT column_name 
             FROM information_schema.columns 
             WHERE table_schema = $1 
               AND table_name = 'menu_items' 
               AND column_name IN ('deleted_at', 'visible')`,
            [SCHEMA]
          );
          const columns = columnsResult.rows.map(row => row.column_name);
          hasDeletedAt = columns.includes('deleted_at');
          hasVisible = columns.includes('visible');
        } catch (e) {
          console.log('⚠️ Erro ao verificar colunas, usando versão compatível');
        }

        let query = `SELECT id FROM ${SCHEMA}.menu_items 
           WHERE "subCategory" = ANY($1::varchar[])
             AND "barId" = $2`;
        
        if (hasDeletedAt) {
          query += ` AND deleted_at IS NULL`;
        }
        if (hasVisible) {
          query += ` AND (visible IS NULL OR visible = true)`;
        }

        const subcategoryItems = await client.query(query, [subcategory_ids, establishment_id]);
        subcategoryItems.rows.forEach(row => itemsToLink.add(row.id));
      }

      // Inserir relacionamentos event_items
      if (itemsToLink.size > 0) {
        const itemIds = Array.from(itemsToLink);
        let displayOrder = 0;
        
        for (const itemId of itemIds) {
          await client.query(
            `INSERT INTO ${SCHEMA}.event_items (event_id, item_id, display_order)
             VALUES ($1, $2, $3)
             ON CONFLICT (event_id, item_id) DO NOTHING`,
            [eventId, itemId, displayOrder]
          );
          displayOrder++;
        }
      }

      await client.query('COMMIT');

      // Buscar evento completo para retornar
      const fullEvent = await getEventById(eventId, pool);
      res.status(201).json(fullEvent);

    } catch (error) {
      await client.query('ROLLBACK');
      console.error('❌ Erro ao criar evento:', error);
      console.error('❌ Stack trace:', error.stack);
      console.error('❌ Request body:', JSON.stringify(req.body, null, 2));
      res.status(500).json({ 
        error: 'Erro ao criar evento.', 
        details: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    } finally {
      client.release();
    }
  });


  // ============================================
  // GET /api/executive-events/public/:slug - Visualização Pública (SEM AUTENTICAÇÃO)
  // IMPORTANTE: Esta rota DEVE vir ANTES de /:id para evitar conflitos de roteamento
  // ============================================
  router.get('/public/:slug', async (req, res) => {
    try {
      const { slug } = req.params;

      const eventResult = await pool.query(
        `SELECT 
          e.id,
          e.establishment_id,
          e.name,
          e.event_date,
          e.logo_url,
          e.cover_image_url,
          e.slug,
          e.is_active,
          b.name as establishment_name
        FROM ${SCHEMA}.executive_events e
        JOIN ${SCHEMA}.bars b ON e.establishment_id = b.id
        WHERE e.slug = $1 AND e.is_active = true`,
        [slug]
      );

      if (eventResult.rows.length === 0) {
        return res.status(404).json({ error: 'Evento não encontrado ou inativo.' });
      }

      const event = eventResult.rows[0];

      // Buscar settings
      const settingsResult = await pool.query(
        `SELECT custom_colors, welcome_message, wifi_info
         FROM ${SCHEMA}.event_settings
         WHERE event_id = $1`,
        [event.id]
      );

      const settings = settingsResult.rows[0] || {};
      
      // Parse JSONB fields
      if (settings.custom_colors) {
        settings.custom_colors = typeof settings.custom_colors === 'string' 
          ? JSON.parse(settings.custom_colors) 
          : settings.custom_colors;
      }
      if (settings.wifi_info) {
        settings.wifi_info = typeof settings.wifi_info === 'string'
          ? JSON.parse(settings.wifi_info)
          : settings.wifi_info;
      }

      // Buscar itens do evento (SEM PREÇOS na resposta)
      const itemsResult = await pool.query(
        `SELECT 
          mi.id,
          mi.name,
          mi.description,
          mi.imageurl as "imageUrl",
          mi."categoryId" as "categoryId",
          mc.name as category,
          mi."subCategory" as "subCategoryName",
          mi.seals,
          ei.display_order
        FROM ${SCHEMA}.event_items ei
        JOIN ${SCHEMA}.menu_items mi ON ei.item_id = mi.id
        JOIN ${SCHEMA}.menu_categories mc ON mi."categoryId" = mc.id
        WHERE ei.event_id = $1
          AND mi.deleted_at IS NULL
          AND (mi.visible IS NULL OR mi.visible = true)
        ORDER BY mc."order", ei.display_order, mi."order"`,
        [event.id]
      );

      // Verificar se campo seals existe
      let hasSealsField = false;
      try {
        const columnsResult = await pool.query(
          "SELECT column_name FROM information_schema.columns WHERE table_name = 'menu_items' AND column_name = 'seals'"
        );
        hasSealsField = columnsResult.rows.length > 0;
      } catch (e) {
        console.log('Campo seals não encontrado, ignorando selos');
      }

      // Processar itens
      const items = itemsResult.rows.map(item => {
        let seals = [];
        if (hasSealsField && item.seals) {
          try {
            seals = typeof item.seals === 'string' 
              ? JSON.parse(item.seals) 
              : item.seals;
          } catch (e) {
            seals = [];
          }
        }

        return {
          id: item.id,
          name: item.name,
          description: item.description,
          imageUrl: item.imageUrl,
          categoryId: item.categoryId,
          category: item.category,
          subCategoryName: item.subCategoryName,
          seals: seals,
          display_order: item.display_order
        };
      });

      // Agrupar por categoria
      const categoriesMap = new Map();
      items.forEach(item => {
        if (!categoriesMap.has(item.categoryId)) {
          categoriesMap.set(item.categoryId, {
            id: item.categoryId,
            name: item.category,
            items: []
          });
        }
        categoriesMap.get(item.categoryId).items.push(item);
      });

      const categories = Array.from(categoriesMap.values());

      // Buscar selos do evento
      const sealsResult = await pool.query(
        `SELECT id, name, color, type, display_order
         FROM ${SCHEMA}.event_seals
         WHERE event_id = $1
         ORDER BY display_order`,
        [event.id]
      );

      res.json({
        event: {
          ...event,
          settings
        },
        categories,
        seals: sealsResult.rows
      });

    } catch (error) {
      console.error('❌ Erro ao buscar evento:', error);
      res.status(500).json({ error: 'Erro ao buscar evento.', details: error.message });
    }
  });

  // ============================================
  // GET /api/executive-events - Listar Eventos (Admin)
  // ============================================
  router.get('/', auth, async (req, res) => {
    try {
      const { establishment_id, is_active } = req.query;
      
      let query = `
        SELECT 
          e.id,
          e.establishment_id,
          e.name,
          e.event_date,
          e.logo_url,
          e.cover_image_url,
          e.slug,
          e.is_active,
          e.created_at,
          e.updated_at,
          b.name as establishment_name
        FROM ${SCHEMA}.executive_events e
        JOIN ${SCHEMA}.bars b ON e.establishment_id = b.id
        WHERE 1=1
      `;
      
      const params = [];
      let paramCount = 1;

      if (establishment_id) {
        query += ` AND e.establishment_id = $${paramCount}`;
        params.push(establishment_id);
        paramCount++;
      }

      if (is_active !== undefined) {
        query += ` AND e.is_active = $${paramCount}`;
        params.push(is_active === 'true');
        paramCount++;
      }

      query += ` ORDER BY e.event_date DESC, e.created_at DESC`;

      const result = await pool.query(query, params);
      res.json(result.rows);
    } catch (error) {
      console.error('❌ Erro ao listar eventos:', error);
      res.status(500).json({ error: 'Erro ao listar eventos.', details: error.message });
    }
  });

  // ============================================
  // GET /api/executive-events/:id - Buscar Evento por ID (Admin)
  // IMPORTANTE: Esta rota deve vir DEPOIS de /public/:slug para evitar conflitos
  // ============================================
  router.get('/:id', auth, async (req, res) => {
    try {
      const { id } = req.params;
      
      // Se o ID for "public", não processar aqui (já foi processado pela rota /public/:slug)
      if (id === 'public') {
        return res.status(404).json({ error: 'Evento não encontrado.' });
      }
      
      const event = await getEventById(id, pool);
      
      if (!event) {
        return res.status(404).json({ error: 'Evento não encontrado.' });
      }
      
      res.json(event);
    } catch (error) {
      console.error('❌ Erro ao buscar evento:', error);
      res.status(500).json({ error: 'Erro ao buscar evento.', details: error.message });
    }
  });

  // ============================================
  // PUT /api/executive-events/:id - Atualizar Evento
  // ============================================
  router.put('/:id', auth, async (req, res) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const { id } = req.params;
      const {
        name,
        event_date,
        logo_url,
        cover_image_url,
        is_active,
        category_ids = [],
        subcategory_ids = [],
        custom_colors = {},
        welcome_message = null,
        wifi_info = null
      } = req.body;

      // Verificar se evento existe
      const eventCheck = await client.query(
        `SELECT id FROM ${SCHEMA}.executive_events WHERE id = $1`,
        [id]
      );
      if (eventCheck.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Evento não encontrado.' });
      }

      // Atualizar evento
      const updateFields = [];
      const updateValues = [];
      let paramCount = 1;

      if (name !== undefined) {
        updateFields.push(`name = $${paramCount}`);
        updateValues.push(name);
        paramCount++;
      }
      if (event_date !== undefined) {
        updateFields.push(`event_date = $${paramCount}`);
        updateValues.push(event_date);
        paramCount++;
      }
      if (logo_url !== undefined) {
        updateFields.push(`logo_url = $${paramCount}`);
        updateValues.push(logo_url);
        paramCount++;
      }
      if (cover_image_url !== undefined) {
        updateFields.push(`cover_image_url = $${paramCount}`);
        updateValues.push(cover_image_url);
        paramCount++;
      }
      if (is_active !== undefined) {
        updateFields.push(`is_active = $${paramCount}`);
        updateValues.push(is_active);
        paramCount++;
      }

      if (updateFields.length > 0) {
        updateValues.push(id);
        await client.query(
          `UPDATE ${SCHEMA}.executive_events 
           SET ${updateFields.join(', ')}
           WHERE id = $${paramCount}`,
          updateValues
        );
      }

      // Atualizar settings
      const settingsCheck = await client.query(
        `SELECT id FROM ${SCHEMA}.event_settings WHERE event_id = $1`,
        [id]
      );

      if (settingsCheck.rows.length > 0) {
        // Atualizar settings existentes
        const settingsUpdateFields = [];
        const settingsUpdateValues = [];
        let settingsParamCount = 1;

        if (custom_colors !== undefined) {
          settingsUpdateFields.push(`custom_colors = $${settingsParamCount}`);
          settingsUpdateValues.push(
            Object.keys(custom_colors).length > 0 ? JSON.stringify(custom_colors) : null
          );
          settingsParamCount++;
        }
        if (welcome_message !== undefined) {
          settingsUpdateFields.push(`welcome_message = $${settingsParamCount}`);
          settingsUpdateValues.push(welcome_message);
          settingsParamCount++;
        }
        if (wifi_info !== undefined) {
          settingsUpdateFields.push(`wifi_info = $${settingsParamCount}`);
          settingsUpdateValues.push(wifi_info ? JSON.stringify(wifi_info) : null);
          settingsParamCount++;
        }

        if (settingsUpdateFields.length > 0) {
          settingsUpdateValues.push(id);
          await client.query(
            `UPDATE ${SCHEMA}.event_settings 
             SET ${settingsUpdateFields.join(', ')}
             WHERE event_id = $${settingsParamCount}`,
            settingsUpdateValues
          );
        }
      } else {
        // Criar settings se não existir
        await client.query(
          `INSERT INTO ${SCHEMA}.event_settings 
           (event_id, custom_colors, welcome_message, wifi_info)
           VALUES ($1, $2, $3, $4)`,
          [
            id,
            Object.keys(custom_colors).length > 0 ? JSON.stringify(custom_colors) : null,
            welcome_message || null,
            wifi_info ? JSON.stringify(wifi_info) : null
          ]
        );
      }

      // Se category_ids ou subcategory_ids foram fornecidos, atualizar itens
      if ((Array.isArray(category_ids) && category_ids.length > 0) || 
          (Array.isArray(subcategory_ids) && subcategory_ids.length > 0)) {
        
        // Remover itens existentes
        await client.query(`DELETE FROM ${SCHEMA}.event_items WHERE event_id = $1`, [id]);

        // Buscar establishment_id do evento
        const eventData = await client.query(
          `SELECT establishment_id FROM ${SCHEMA}.executive_events WHERE id = $1`,
          [id]
        );
        const establishmentId = eventData.rows[0].establishment_id;

        // Buscar novos itens
        const itemsToLink = new Set();
        
        if (Array.isArray(category_ids) && category_ids.length > 0) {
          const categoryItems = await client.query(
            `SELECT id FROM ${SCHEMA}.menu_items 
             WHERE "categoryId" = ANY($1::int[])
               AND "barId" = $2
               AND deleted_at IS NULL
               AND (visible IS NULL OR visible = true)`,
            [category_ids, establishmentId]
          );
          categoryItems.rows.forEach(row => itemsToLink.add(row.id));
        }

        if (Array.isArray(subcategory_ids) && subcategory_ids.length > 0) {
          const subcategoryItems = await client.query(
            `SELECT id FROM ${SCHEMA}.menu_items 
             WHERE "subCategory" = ANY($1::varchar[])
               AND "barId" = $2
               AND deleted_at IS NULL
               AND (visible IS NULL OR visible = true)`,
            [subcategory_ids, establishmentId]
          );
          subcategoryItems.rows.forEach(row => itemsToLink.add(row.id));
        }

        // Inserir novos relacionamentos
        if (itemsToLink.size > 0) {
          const itemIds = Array.from(itemsToLink);
          let displayOrder = 0;
          
          for (const itemId of itemIds) {
            await client.query(
              `INSERT INTO ${SCHEMA}.event_items (event_id, item_id, display_order)
               VALUES ($1, $2, $3)`,
              [id, itemId, displayOrder]
            );
            displayOrder++;
          }
        }
      }

      await client.query('COMMIT');

      // Retornar evento atualizado
      const updatedEvent = await getEventById(id, pool);
      res.json(updatedEvent);

    } catch (error) {
      await client.query('ROLLBACK');
      console.error('❌ Erro ao atualizar evento:', error);
      res.status(500).json({ 
        error: 'Erro ao atualizar evento.', 
        details: error.message 
      });
    } finally {
      client.release();
    }
  });

  // ============================================
  // DELETE /api/executive-events/:id - Deletar Evento
  // ============================================
  router.delete('/:id', auth, async (req, res) => {
    try {
      const { id } = req.params;
      
      // Verificar se evento existe
      const eventCheck = await pool.query(
        `SELECT id FROM ${SCHEMA}.executive_events WHERE id = $1`,
        [id]
      );
      
      if (eventCheck.rows.length === 0) {
        return res.status(404).json({ error: 'Evento não encontrado.' });
      }

      // Deletar evento (CASCADE vai deletar event_settings, event_items, event_seals)
      await pool.query(`DELETE FROM ${SCHEMA}.executive_events WHERE id = $1`, [id]);
      
      res.json({ message: 'Evento deletado com sucesso.' });
    } catch (error) {
      console.error('❌ Erro ao deletar evento:', error);
      res.status(500).json({ error: 'Erro ao deletar evento.', details: error.message });
    }
  });

  // ============================================
  // Helper Function: Buscar Evento Completo por ID
  // ============================================
  async function getEventById(eventId, pool) {
    try {
      const eventResult = await pool.query(
        `SELECT 
          e.id,
          e.establishment_id,
          e.name,
          e.event_date,
          e.logo_url,
          e.cover_image_url,
          e.slug,
          e.is_active,
          e.created_at,
          e.updated_at,
          b.name as establishment_name
        FROM ${SCHEMA}.executive_events e
        JOIN ${SCHEMA}.bars b ON e.establishment_id = b.id
        WHERE e.id = $1`,
        [eventId]
      );

      if (eventResult.rows.length === 0) {
        return null;
      }

      const event = eventResult.rows[0];

      // Buscar settings
      const settingsResult = await pool.query(
        `SELECT custom_colors, welcome_message, wifi_info
         FROM ${SCHEMA}.event_settings
         WHERE event_id = $1`,
        [eventId]
      );

      const settings = settingsResult.rows[0] || {};
      
      if (settings.custom_colors) {
        settings.custom_colors = typeof settings.custom_colors === 'string' 
          ? JSON.parse(settings.custom_colors) 
          : settings.custom_colors;
      }
      if (settings.wifi_info) {
        settings.wifi_info = typeof settings.wifi_info === 'string'
          ? JSON.parse(settings.wifi_info)
          : settings.wifi_info;
      }

      // Buscar contagem de itens
      const itemsCountResult = await pool.query(
        `SELECT COUNT(*) as count FROM ${SCHEMA}.event_items WHERE event_id = $1`,
        [eventId]
      );

      return {
        ...event,
        settings,
        items_count: parseInt(itemsCountResult.rows[0].count || 0)
      };
    } catch (error) {
      console.error('Erro ao buscar evento:', error);
      throw error;
    }
  }

  return router;
};

