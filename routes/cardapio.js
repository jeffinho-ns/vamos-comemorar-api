const express = require('express');
const router = express.Router();

module.exports = (pool) => {
    // Função helper para extrair apenas o nome do arquivo da URL
    const extractFilename = (url) => {
        if (!url) return null;
        const urlStr = String(url);
        // Se já é só o nome do arquivo (sem http/https ou /)
        if (!urlStr.includes('http') && !urlStr.includes('/')) {
            return urlStr.trim();
        }
        // Extrair nome do arquivo de URL completa
        const parts = urlStr.split('/');
        const filename = parts[parts.length - 1];
        // Remover query strings se houver
        return filename.split('?')[0].trim();
    };

    // ============================================
    // ROTA DE GALERIA - DEVE VIR ANTES DE TODAS AS OUTRAS
    // ============================================
    
    // Rota para deletar imagem da galeria (verifica uso antes de deletar)
    // NOTA: Esta rota está obsoleta. Use /api/images/:imageId (DELETE) em routes/images.js
    // Mantida apenas para compatibilidade com código legado
    router.delete('/gallery/images/:filename', async (req, res) => {
        try {
            const { filename } = req.params;
            
            console.log(`🗑️ [GALLERY] Tentando deletar imagem: ${filename}`);
            console.log(`⚠️ [GALLERY] Esta rota está obsoleta. Use /api/images/:imageId (DELETE) em vez disso.`);
            
            // Verificar se a imagem está sendo usada em menu_items
            const itemsUsingImage = await pool.query(`
                SELECT COUNT(*) as count
                FROM menu_items
                WHERE (imageurl = $1 OR imageurl LIKE $2)
                  AND deleted_at IS NULL
            `, [filename, `%${filename}`]);
            
            const itemsCount = parseInt(itemsUsingImage.rows[0].count || 0);
            
            // Verificar se está sendo usada em bars
            const barsUsingImage = await pool.query(`
                SELECT COUNT(*) as count
                FROM bars
                WHERE logourl = $1 OR logourl LIKE $2
                   OR coverimageurl = $1 OR coverimageurl LIKE $2
                   OR popupimageurl = $1 OR popupimageurl LIKE $2
            `, [filename, `%${filename}`]);
            
            const barsCount = parseInt(barsUsingImage.rows[0].count || 0);
            
            const totalUsage = itemsCount + barsCount;
            
            if (totalUsage > 0) {
                return res.status(400).json({
                    error: 'Não é possível deletar esta imagem.',
                    message: `Esta imagem está sendo usada em ${totalUsage} lugar(es). Remova a imagem dos itens/bares antes de deletá-la.`,
                    usage: {
                        items: itemsCount,
                        bars: barsCount,
                        total: totalUsage
                    }
                });
            }
            
            // Imagens agora são gerenciadas via Cloudinary através de /api/images/:imageId
            // Esta rota apenas retorna sucesso para compatibilidade
            res.json({
                success: true,
                message: 'Imagem removida (use /api/images/:imageId para deletar do Cloudinary).',
                filename: filename,
                warning: 'Esta rota está obsoleta. Use /api/images/:imageId (DELETE) em vez disso.'
            });
            
        } catch (error) {
            console.error('❌ [GALLERY] Erro ao deletar imagem da galeria:', error);
            res.status(500).json({ 
                error: 'Erro ao deletar imagem da galeria.', 
                details: error.message 
            });
        }
    });
    
    router.get('/gallery/images', async (req, res) => {
        try {
            console.log('🖼️ [GALLERY] Endpoint chamado - Buscando imagens da galeria...');
            const images = [];
            const imageMap = new Map(); // Para evitar duplicatas e rastrear data mais recente

            // Buscar imagens da tabela cardapio_images (mais recentes primeiro)
            // Usar try-catch para caso a tabela não exista ou tenha problemas
            let cardapioImagesResult = { rows: [] };
            try {
                cardapioImagesResult = await pool.query(`
                    SELECT 
                        filename,
                        url,
                        uploaded_at as created_at,
                        'cardapio_image' as source_type,
                        'general' as image_type
                    FROM cardapio_images
                    WHERE filename IS NOT NULL 
                      AND filename != ''
                      AND filename != ' '
                      AND filename != 'null'
                    ORDER BY uploaded_at DESC
                `);
            } catch (cardapioError) {
                console.warn('⚠️ [GALLERY] Erro ao buscar de cardapio_images (tabela pode não existir):', cardapioError.message);
                // Continuar sem as imagens de cardapio_images
            }

            console.log(`📊 [GALLERY] Encontradas ${cardapioImagesResult.rows.length} imagens na tabela cardapio_images`);

            cardapioImagesResult.rows.forEach(row => {
                const filename = row.filename;
                if (filename && filename !== 'null' && filename.trim() !== '') {
                    imageMap.set(filename, {
                        filename: filename,
                        url: row.url || null, // URL completa do Cloudinary se disponível
                        sourceType: row.source_type,
                        imageType: row.image_type,
                        usageCount: 0,
                        createdAt: row.created_at,
                        isFromCardapioImages: true
                    });
                }
            });

            // Buscar imagens de menu_items
            const itemsResult = await pool.query(`
                SELECT DISTINCT 
                    imageurl,
                    'menu_item' as source_type,
                    'item' as image_type,
                    COUNT(*) as usage_count,
                    MIN(id) as first_item_id
                FROM menu_items
                WHERE imageurl IS NOT NULL 
                  AND imageurl != ''
                  AND imageurl != ' '
                  AND imageurl != 'null'
                  AND (deleted_at IS NULL)
                GROUP BY imageurl
                ORDER BY imageurl
            `);

            console.log(`📊 [GALLERY] Encontrados ${itemsResult.rows.length} itens com imagens`);

            itemsResult.rows.forEach(row => {
                const filename = extractFilename(row.imageurl);
                if (filename && filename !== 'null' && filename.trim() !== '') {
                    if (imageMap.has(filename)) {
                        // Atualizar contagem de uso
                        const existing = imageMap.get(filename);
                        existing.usageCount = (existing.usageCount || 0) + parseInt(row.usage_count);
                        existing.firstItemId = row.first_item_id;
                    } else {
                        // Buscar URL completa na tabela cardapio_images se existir
                        let cloudinaryUrl = null;
                        const cardapioImage = cardapioImagesResult.rows.find(img => img.filename === filename);
                        if (cardapioImage && cardapioImage.url && cardapioImage.url.startsWith('https://res.cloudinary.com')) {
                            cloudinaryUrl = cardapioImage.url;
                        }
                        
                        // Adicionar nova imagem
                        imageMap.set(filename, {
                            filename: filename,
                            url: cloudinaryUrl, // URL completa do Cloudinary se encontrada
                            sourceType: row.source_type,
                            imageType: row.image_type,
                            usageCount: parseInt(row.usage_count),
                            firstItemId: row.first_item_id,
                            isFromCardapioImages: false
                        });
                    }
                }
            });

            // Buscar imagens de bars
            const barsResult = await pool.query(`
                SELECT 
                    logourl,
                    coverimageurl,
                    popupimageurl,
                    id as bar_id,
                    name as bar_name
                FROM bars
                WHERE (logourl IS NOT NULL AND logourl != '' AND logourl != ' ' AND logourl != 'null')
                   OR (coverimageurl IS NOT NULL AND coverimageurl != '' AND coverimageurl != ' ' AND coverimageurl != 'null')
                   OR (popupimageurl IS NOT NULL AND popupimageurl != '' AND popupimageurl != ' ' AND popupimageurl != 'null')
            `);

            console.log(`📊 [GALLERY] Encontrados ${barsResult.rows.length} bares com imagens`);

            barsResult.rows.forEach(row => {
                // Função helper para buscar URL do Cloudinary
                const getCloudinaryUrl = (filename) => {
                    if (!filename) return null;
                    const cardapioImage = cardapioImagesResult.rows.find(img => img.filename === filename);
                    return (cardapioImage && cardapioImage.url && cardapioImage.url.startsWith('https://res.cloudinary.com')) 
                        ? cardapioImage.url 
                        : null;
                };
                
                // Processar logoUrl
                if (row.logourl && row.logourl !== 'null' && row.logourl.trim() !== '') {
                    const filename = extractFilename(row.logourl);
                    if (filename) {
                        if (imageMap.has(filename)) {
                            const existing = imageMap.get(filename);
                            existing.usageCount = (existing.usageCount || 0) + 1;
                            if (!existing.barIds) existing.barIds = [];
                            existing.barIds.push({
                                id: row.bar_id,
                                name: row.bar_name,
                                type: 'bar_logo'
                            });
                            // Atualizar URL se não tiver e encontrar na tabela
                            if (!existing.url) {
                                existing.url = getCloudinaryUrl(filename);
                            }
                        } else {
                            imageMap.set(filename, {
                                filename: filename,
                                url: getCloudinaryUrl(filename), // URL completa do Cloudinary se encontrada
                                sourceType: 'bar',
                                imageType: 'bar_logo',
                                usageCount: 1,
                                barIds: [{ id: row.bar_id, name: row.bar_name, type: 'bar_logo' }],
                                isFromCardapioImages: false
                            });
                        }
                    }
                }
                // Processar coverImageUrl
                if (row.coverimageurl && row.coverimageurl !== 'null' && row.coverimageurl.trim() !== '') {
                    const filename = extractFilename(row.coverimageurl);
                    if (filename) {
                        if (imageMap.has(filename)) {
                            const existing = imageMap.get(filename);
                            existing.usageCount = (existing.usageCount || 0) + 1;
                            if (!existing.barIds) existing.barIds = [];
                            existing.barIds.push({
                                id: row.bar_id,
                                name: row.bar_name,
                                type: 'bar_cover'
                            });
                            // Atualizar URL se não tiver e encontrar na tabela
                            if (!existing.url) {
                                existing.url = getCloudinaryUrl(filename);
                            }
                        } else {
                            imageMap.set(filename, {
                                filename: filename,
                                url: getCloudinaryUrl(filename), // URL completa do Cloudinary se encontrada
                                sourceType: 'bar',
                                imageType: 'bar_cover',
                                usageCount: 1,
                                barIds: [{ id: row.bar_id, name: row.bar_name, type: 'bar_cover' }],
                                isFromCardapioImages: false
                            });
                        }
                    }
                }
                // Processar popupImageUrl
                if (row.popupimageurl && row.popupimageurl !== 'null' && row.popupimageurl.trim() !== '') {
                    const filename = extractFilename(row.popupimageurl);
                    if (filename) {
                        if (imageMap.has(filename)) {
                            const existing = imageMap.get(filename);
                            existing.usageCount = (existing.usageCount || 0) + 1;
                            if (!existing.barIds) existing.barIds = [];
                            existing.barIds.push({
                                id: row.bar_id,
                                name: row.bar_name,
                                type: 'bar_popup'
                            });
                            // Atualizar URL se não tiver e encontrar na tabela
                            if (!existing.url) {
                                existing.url = getCloudinaryUrl(filename);
                            }
                        } else {
                            imageMap.set(filename, {
                                filename: filename,
                                url: getCloudinaryUrl(filename), // URL completa do Cloudinary se encontrada
                                sourceType: 'bar',
                                imageType: 'bar_popup',
                                usageCount: 1,
                                barIds: [{ id: row.bar_id, name: row.bar_name, type: 'bar_popup' }],
                                isFromCardapioImages: false
                            });
                        }
                    }
                }
            });

            // Converter Map para array
            const imageArray = Array.from(imageMap.values());
            images.push(...imageArray);

            // Ordenar por data de criação (mais recente primeiro), depois por nome
            images.sort((a, b) => {
                // Se ambas têm createdAt, ordenar por data (mais recente primeiro)
                if (a.createdAt && b.createdAt) {
                    return new Date(b.createdAt) - new Date(a.createdAt);
                }
                // Se apenas uma tem createdAt, ela vem primeiro
                if (a.createdAt && !b.createdAt) return -1;
                if (!a.createdAt && b.createdAt) return 1;
                // Se nenhuma tem createdAt, ordenar por nome
                const nameA = (a.filename || '').toLowerCase();
                const nameB = (b.filename || '').toLowerCase();
                return nameA.localeCompare(nameB);
            });

            console.log(`✅ [GALLERY] Total de ${images.length} imagens únicas encontradas`);

            res.json({
                success: true,
                images: images,
                total: images.length
            });
        } catch (error) {
            console.error('❌ [GALLERY] Erro ao listar imagens da galeria:', error);
            console.error('❌ [GALLERY] Stack trace:', error.stack);
            res.status(500).json({ error: 'Erro ao listar imagens da galeria.', details: error.message });
        }
    });

    // Rota para criar um novo estabelecimento
    router.post('/bars', async (req, res) => {
        const { 
            name, slug, description, logoUrl, coverImageUrl, coverImages, address, rating, 
            reviewsCount, latitude, longitude, amenities, popupImageUrl,
            // ✨ Adicionados os novos campos
            facebook, instagram, whatsapp,
            // 🎨 Campos de personalização de cores
            menu_category_bg_color, menu_category_text_color,
            menu_subcategory_bg_color, menu_subcategory_text_color,
            mobile_sidebar_bg_color, mobile_sidebar_text_color,
            custom_seals
        } = req.body;
        
        try {
            const ratingValue = rating ? parseFloat(rating) : null;
            const reviewsCountValue = reviewsCount ? parseInt(reviewsCount) : null;
            const latitudeValue = latitude ? parseFloat(latitude) : null;
            const longitudeValue = longitude ? parseFloat(longitude) : null;
            
            let coverImagesValue = '[]';
            if (coverImages) {
                if (Array.isArray(coverImages)) {
                    coverImagesValue = JSON.stringify(coverImages);
                } else if (typeof coverImages === 'string') {
                    coverImagesValue = coverImages;
                }
            }
            
            let customSealsValue = null;
            if (custom_seals) {
                if (Array.isArray(custom_seals)) {
                    customSealsValue = JSON.stringify(custom_seals);
                } else if (typeof custom_seals === 'string') {
                    customSealsValue = custom_seals;
                }
            }
            
            // ✨ Query de INSERT atualizada para incluir as novas colunas
            const result = await pool.query(
                'INSERT INTO bars (name, slug, description, logoUrl, coverImageUrl, coverImages, address, rating, reviewsCount, latitude, longitude, amenities, popupImageUrl, facebook, instagram, whatsapp, menu_category_bg_color, menu_category_text_color, menu_subcategory_bg_color, menu_subcategory_text_color, mobile_sidebar_bg_color, mobile_sidebar_text_color, custom_seals) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23) RETURNING id',
                [
                    name, slug, description, logoUrl, coverImageUrl, coverImagesValue, 
                    address, ratingValue, reviewsCountValue, latitudeValue, longitudeValue, 
                    JSON.stringify(amenities), popupImageUrl, 
                    // ✨ Adicionados os valores dos novos campos
                    facebook || null, instagram || null, whatsapp || null,
                    // 🎨 Valores dos campos de cores
                    menu_category_bg_color || null, menu_category_text_color || null,
                    menu_subcategory_bg_color || null, menu_subcategory_text_color || null,
                    mobile_sidebar_bg_color || null, mobile_sidebar_text_color || null,
                    customSealsValue
                ]
            );
            
            const newBar = { id: result.rows[0].id, ...req.body };
            res.status(201).json(newBar);
        } catch (error) {
            console.error('Erro ao criar estabelecimento:', error);
            res.status(500).json({ error: 'Erro ao criar estabelecimento.' });
        }
    });

    // Função helper para normalizar campos do bar para camelCase
    const normalizeBarFields = (bar) => {
        const normalized = { ...bar };
        
        // Normalizar campos de imagem (PostgreSQL retorna em minúsculas)
        normalized.logoUrl = bar.logoUrl || bar.logourl || null;
        normalized.coverImageUrl = bar.coverImageUrl || bar.coverimageurl || null;
        normalized.popupImageUrl = bar.popupImageUrl || bar.popupimageurl || null;
        normalized.reviewsCount = bar.reviewsCount !== undefined ? bar.reviewsCount : (bar.reviewscount !== undefined ? bar.reviewscount : null);
        
        // Parse amenities se existir
        const amenitiesValue = bar.amenities || bar.Amenities;
        if (amenitiesValue) {
            try {
                normalized.amenities = typeof amenitiesValue === 'string' ? JSON.parse(amenitiesValue) : amenitiesValue;
            } catch (e) {
                normalized.amenities = [];
            }
        } else {
            normalized.amenities = [];
        }
        
        // Parse coverImages se existir
        const coverImagesValue = bar.coverImages || bar.coverimages;
        if (coverImagesValue) {
            try {
                normalized.coverImages = typeof coverImagesValue === 'string' ? JSON.parse(coverImagesValue) : coverImagesValue;
            } catch (e) {
                normalized.coverImages = [];
            }
        } else {
            normalized.coverImages = [];
        }
        
        // Parse custom_seals se existir
        const customSealsValue = bar.custom_seals || bar.customSeals;
        if (customSealsValue) {
            try {
                normalized.custom_seals = typeof customSealsValue === 'string' ? JSON.parse(customSealsValue) : customSealsValue;
            } catch (e) {
                normalized.custom_seals = [];
            }
        } else {
            normalized.custom_seals = [];
        }
        
        // Remover campos duplicados em minúsculas
        delete normalized.logourl;
        delete normalized.coverimageurl;
        delete normalized.popupimageurl;
        delete normalized.reviewscount;
        delete normalized.coverimages;
        
        return normalized;
    };

    // Rota para listar todos os estabelecimentos
    router.get('/bars', async (req, res) => {
        try {
            // ✨ Query de SELECT atualizada para buscar as novas colunas
            const result = await pool.query('SELECT * FROM bars');
            const barsFormatted = result.rows.map(bar => normalizeBarFields(bar));
            res.json(barsFormatted);
        } catch (error) {
            console.error('Erro ao listar estabelecimentos:', error);
            res.status(500).json({ error: 'Erro ao listar estabelecimentos.' });
        }
    });

    // Rota para buscar um estabelecimento específico
    router.get('/bars/:id', async (req, res) => {
        const { id } = req.params;
        try {
            // ✨ Query de SELECT atualizada para buscar as novas colunas
            const result = await pool.query('SELECT * FROM bars WHERE id = $1', [id]);
            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Estabelecimento não encontrado.' });
            }
            const bar = normalizeBarFields(result.rows[0]);
            res.json(bar);
        } catch (error) {
            console.error('Erro ao buscar estabelecimento:', error);
            res.status(500).json({ error: 'Erro ao buscar estabelecimento.' });
        }
    });

    // Rota para atualizar um estabelecimento
    router.put('/bars/:id', async (req, res) => {
        const { id } = req.params;
        const { 
            name, slug, description, logoUrl, coverImageUrl, coverImages, address, rating, 
            reviewsCount, latitude, longitude, amenities, popupImageUrl,
            // ✨ Adicionados os novos campos
            facebook, instagram, whatsapp,
            // 🎨 Campos de personalização de cores
            menu_category_bg_color, menu_category_text_color,
            menu_subcategory_bg_color, menu_subcategory_text_color,
            mobile_sidebar_bg_color, mobile_sidebar_text_color,
            custom_seals
        } = req.body;
        
        try {
            const ratingValue = rating ? parseFloat(rating) : null;
            const reviewsCountValue = reviewsCount ? parseInt(reviewsCount) : null;
            const latitudeValue = latitude ? parseFloat(latitude) : null;
            const longitudeValue = longitude ? parseFloat(longitude) : null;

            let coverImagesValue = '[]';
            if (coverImages) {
                if (Array.isArray(coverImages)) {
                    coverImagesValue = JSON.stringify(coverImages);
                } else if (typeof coverImages === 'string') {
                    coverImagesValue = coverImages;
                }
            }
            
            let customSealsValue = null;
            if (custom_seals) {
                if (Array.isArray(custom_seals)) {
                    customSealsValue = JSON.stringify(custom_seals);
                } else if (typeof custom_seals === 'string') {
                    customSealsValue = custom_seals;
                }
            }
            
            // ✨ Query de UPDATE atualizada para incluir as novas colunas
            await pool.query(
                'UPDATE bars SET name = $1, slug = $2, description = $3, logoUrl = $4, coverImageUrl = $5, coverImages = $6, address = $7, rating = $8, reviewsCount = $9, latitude = $10, longitude = $11, amenities = $12, popupImageUrl = $13, facebook = $14, instagram = $15, whatsapp = $16, menu_category_bg_color = $17, menu_category_text_color = $18, menu_subcategory_bg_color = $19, menu_subcategory_text_color = $20, mobile_sidebar_bg_color = $21, mobile_sidebar_text_color = $22, custom_seals = $23 WHERE id = $24',
                [
                    name, slug, description, logoUrl, coverImageUrl, coverImagesValue, 
                    address, ratingValue, reviewsCountValue, latitudeValue, longitudeValue, 
                    JSON.stringify(amenities), popupImageUrl, 
                    // ✨ Adicionados os valores dos novos campos
                    facebook || null, instagram || null, whatsapp || null,
                    // 🎨 Valores dos campos de cores
                    menu_category_bg_color || null, menu_category_text_color || null,
                    menu_subcategory_bg_color || null, menu_subcategory_text_color || null,
                    mobile_sidebar_bg_color || null, mobile_sidebar_text_color || null,
                    customSealsValue,
                    id
                ]
            );
            
            res.json({ message: 'Estabelecimento atualizado com sucesso.' });
        } catch (error) {
            console.error('Erro ao atualizar estabelecimento:', error);
            res.status(500).json({ error: 'Erro ao atualizar estabelecimento.' });
        }
    });

    // Rota para deletar um estabelecimento
    router.delete('/bars/:id', async (req, res) => {
        const { id } = req.params;
        try {
            await pool.query('DELETE FROM bars WHERE id = $1', [id]);
            res.json({ message: 'Estabelecimento deletado com sucesso.' });
        } catch (error) {
            console.error('Erro ao deletar estabelecimento:', error);
            res.status(500).json({ error: 'Erro ao deletar estabelecimento.' });
        }
    });

    // Rotas para Categorias
    router.post('/categories', async (req, res) => {
        const { barId, name, order } = req.body;
        try {
            const result = await pool.query(
                'INSERT INTO menu_categories (barId, name, "order") VALUES ($1, $2, $3) RETURNING id',
                [barId, name, order]
            );
            res.status(201).json({ id: result.rows[0].id, ...req.body });
        } catch (error) {
            res.status(500).json({ error: 'Erro ao criar categoria.' });
        }
    });

    router.get('/categories', async (req, res) => {
        try {
            const { barId } = req.query;
            // Colunas estão em minúsculas no PostgreSQL, usar aliases para camelCase
            let query = 'SELECT id, name, barid as "barId", "order" FROM menu_categories';
            let params = [];
            
            if (barId) {
                query += ' WHERE barid = $1';
                params.push(barId);
            }
            
            query += ' ORDER BY barid, "order"';
            
            const result = await pool.query(query, params);
            
            // Normalizar campos para garantir camelCase (PostgreSQL pode não retornar alias corretamente)
            const categories = result.rows.map(cat => ({
                id: cat.id,
                name: cat.name,
                barId: cat.barId !== undefined ? cat.barId : (cat.barid !== undefined ? cat.barid : null),
                order: cat.order
            }));
            
            res.json(categories);
        } catch (error) {
            console.error('Erro ao listar categorias:', error);
            res.status(500).json({ error: 'Erro ao listar categorias.' });
        }
    });

    // Rota para buscar uma categoria específica
    router.get('/categories/:id', async (req, res) => {
        const { id } = req.params;
        try {
            const result = await pool.query('SELECT * FROM menu_categories WHERE id = $1', [id]);
            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Categoria não encontrada.' });
            }
            res.json(result.rows[0]);
        } catch (error) {
            console.error('Erro ao buscar categoria:', error);
            res.status(500).json({ error: 'Erro ao buscar categoria.' });
        }
    });

    // Rota para atualizar uma categoria
    router.put('/categories/:id', async (req, res) => {
        const { id } = req.params;
        const { barId, name, order } = req.body;
        try {
            await pool.query(
                'UPDATE menu_categories SET barId = $1, name = $2, "order" = $3 WHERE id = $4',
                [barId, name, order, id]
            );
            res.json({ message: 'Categoria atualizada com sucesso.' });
        } catch (error) {
            console.error('Erro ao atualizar categoria:', error);
            res.status(500).json({ error: 'Erro ao atualizar categoria.' });
        }
    });

    // Rota para deletar uma categoria
    router.delete('/categories/:id', async (req, res) => {
        const { id } = req.params;
        try {
            await pool.query('DELETE FROM menu_categories WHERE id = $1', [id]);
            res.json({ message: 'Categoria deletada com sucesso.' });
        } catch (error) {
            console.error('Erro ao deletar categoria:', error);
            res.status(500).json({ error: 'Erro ao deletar categoria.' });
        }
    });

    // ============================================
    // ROTAS PARA SUB-CATEGORIAS (Sistema simples com varchar)
    // ============================================

    // Listar todas as sub-categorias únicas
    router.get('/subcategories', async (req, res) => {
        try {
            const result = await pool.query(`
                SELECT DISTINCT 
                    mi.subCategory as name,
                    mi.categoryId,
                    mi.barId,
                    mc.name as categoryName,
                    b.name as barName,
                    COUNT(mi.id) as itemsCount,
                    MIN(mi.id) as id
                FROM menu_items mi
                LEFT JOIN menu_categories mc ON mi.categoryId = mc.id
                LEFT JOIN bars b ON mi.barId = b.id
                WHERE mi.subCategory IS NOT NULL 
                  AND mi.subCategory != ''
                  AND mi.subCategory != ' '
                GROUP BY mi.subCategory, mi.categoryId, mi.barId, mc.name, b.name, mc."order"
                ORDER BY b.name, mc."order", mi.subCategory
            `);
            res.json(result.rows);
        } catch (error) {
            console.error('Erro ao listar sub-categorias:', error);
            res.status(500).json({ error: 'Erro ao listar sub-categorias.', details: error.message });
        }
    });

    // Listar subcategorias de uma categoria específica
    router.get('/subcategories/category/:categoryId', async (req, res) => {
        const { categoryId } = req.params;
        try {
            const result = await pool.query(`
                SELECT DISTINCT 
                    mi.subCategory as name,
                    mi.categoryId,
                    mi.barId,
                    COUNT(mi.id) as itemsCount,
                    MIN(mi.id) as id
                FROM menu_items mi
                WHERE mi.categoryId = $1 
                  AND mi.subCategory IS NOT NULL 
                  AND mi.subCategory != ''
                  AND mi.subCategory != ' '
                GROUP BY mi.subCategory, mi.categoryId, mi.barId
                ORDER BY mi.subCategory
            `, [categoryId]);
            res.json(result.rows);
        } catch (error) {
            console.error('Erro ao listar sub-categorias da categoria:', error);
            res.status(500).json({ error: 'Erro ao listar sub-categorias da categoria.' });
        }
    });

    // Listar subcategorias de um bar específico
    router.get('/subcategories/bar/:barId', async (req, res) => {
        const { barId } = req.params;
        try {
            const result = await pool.query(`
                SELECT 
                    mi.subcategory as name,
                    mi.categoryid as "categoryId",
                    mi.barid as "barId",
                    mc.name as categoryName,
                    COUNT(mi.id) as itemsCount,
                    MIN(mi.id) as id,
                    mc."order" as categoryOrder
                FROM meu_backup_db.menu_items mi
                JOIN meu_backup_db.menu_categories mc ON mi.categoryid = mc.id
                WHERE mi.barid = $1 
                  AND mi.subcategory IS NOT NULL 
                  AND mi.subcategory != ''
                  AND mi.subcategory != ' '
                GROUP BY mi.subcategory, mi.categoryid, mi.barid, mc.name, mc."order"
                ORDER BY mc."order", mi.subcategory
            `, [barId]);
            res.json(result.rows);
        } catch (error) {
            console.error('❌ Erro ao listar sub-categorias do bar:', error);
            console.error('❌ Stack trace:', error.stack);
            res.status(500).json({ 
                error: 'Erro ao listar sub-categorias do bar.',
                details: error.message 
            });
        }
    });

    // Criar nova subcategoria (atualizando itens existentes ou criando novos)
    router.post('/subcategories', async (req, res) => {
        const { name, categoryId, barId, order } = req.body;
        
        if (!name || !categoryId || !barId) {
            return res.status(400).json({ error: 'Nome, categoryId e barId são obrigatórios.' });
        }

        try {
            // Verificar se a categoria existe
            const categoriesResult = await pool.query('SELECT id FROM menu_categories WHERE id = $1 AND barId = $2', [categoryId, barId]);
            if (categoriesResult.rows.length === 0) {
                return res.status(404).json({ error: 'Categoria não encontrada.' });
            }

            // Verificar se o bar existe
            const barsResult = await pool.query('SELECT id FROM bars WHERE id = $1', [barId]);
            if (barsResult.rows.length === 0) {
                return res.status(404).json({ error: 'Bar não encontrado.' });
            }

            // Verificar se já existe uma subcategoria com o mesmo nome na mesma categoria
            const existingResult = await pool.query(
                'SELECT COUNT(*) as count FROM menu_items WHERE subCategory = $1 AND categoryId = $2 AND barId = $3',
                [name, categoryId, barId]
            );
            
            if (parseInt(existingResult.rows[0].count) > 0) {
                return res.status(409).json({ error: 'Já existe uma subcategoria com este nome nesta categoria.' });
            }

            // Verificar se o campo seals existe
            let hasSealsField = false;
            try {
                const columnsResult = await pool.query(
                    "SELECT column_name FROM information_schema.columns WHERE table_name = 'menu_items' AND column_name = 'seals'"
                );
                hasSealsField = columnsResult.rows.length > 0;
            } catch (e) {
                console.log('Campo seals não encontrado, ignorando selos');
            }

            // Criar um item vazio com a nova subcategoria para "reservar" o nome
            const query = hasSealsField ? 
                'INSERT INTO menu_items (name, description, price, imageUrl, categoryId, barId, subCategory, "order", seals) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id' :
                'INSERT INTO menu_items (name, description, price, imageUrl, categoryId, barId, subCategory, "order") VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id';
            
            const values = hasSealsField ? 
                [`[Nova Subcategoria] ${name}`, 'Item temporário para reservar subcategoria', 0.00, null, categoryId, barId, name, order || 0, null] :
                [`[Nova Subcategoria] ${name}`, 'Item temporário para reservar subcategoria', 0.00, null, categoryId, barId, name, order || 0];

            const result = await pool.query(query, values);

            const newSubCategory = {
                id: result.rows[0].id,
                name,
                categoryId,
                barId,
                order: order || 0,
                itemsCount: 1
            };

            res.status(201).json(newSubCategory);
        } catch (error) {
            console.error('Erro ao criar subcategoria:', error);
            res.status(500).json({ error: 'Erro ao criar subcategoria.' });
        }
    });

    // Atualizar subcategoria (renomear)
    router.put('/subcategories/:id', async (req, res) => {
        const { id } = req.params;
        const { name, order } = req.body;
        
        if (!name) {
            return res.status(400).json({ error: 'Nome é obrigatório.' });
        }

        try {
            // Buscar o item que representa a subcategoria
            const itemsResult = await pool.query('SELECT * FROM menu_items WHERE id = $1', [id]);
            if (itemsResult.rows.length === 0) {
                return res.status(404).json({ error: 'Subcategoria não encontrada.' });
            }

            const item = itemsResult.rows[0];
            const oldSubCategoryName = item.subCategory;

            // Verificar se o novo nome já existe na mesma categoria
            if (name !== oldSubCategoryName) {
                const duplicateResult = await pool.query(
                    'SELECT COUNT(*) as count FROM menu_items WHERE subCategory = $1 AND categoryId = $2 AND barId = $3',
                    [name, item.categoryId, item.barId]
                );
                
                if (parseInt(duplicateResult.rows[0].count) > 0) {
                    return res.status(409).json({ error: 'Já existe uma subcategoria com este nome nesta categoria.' });
                }

                // Atualizar todos os itens que usam esta subcategoria
                await pool.query(
                    'UPDATE menu_items SET subCategory = $1 WHERE subCategory = $2 AND categoryId = $3 AND barId = $4',
                    [name, oldSubCategoryName, item.categoryId, item.barId]
                );
            }

            // Atualizar ordem se fornecida
            if (order !== undefined && order !== item.order) {
                await pool.query(
                    'UPDATE menu_items SET "order" = $1 WHERE id = $2',
                    [order, id]
                );
            }

            // Buscar item atualizado
            const updatedResult = await pool.query('SELECT * FROM menu_items WHERE id = $1', [id]);
            
            res.json({
                id: updatedResult.rows[0].id,
                name: updatedResult.rows[0].subCategory,
                categoryId: updatedResult.rows[0].categoryId,
                barId: updatedResult.rows[0].barId,
                order: updatedResult.rows[0].order,
                message: 'Subcategoria atualizada com sucesso'
            });
        } catch (error) {
            console.error('Erro ao atualizar subcategoria:', error);
            res.status(500).json({ error: 'Erro ao atualizar subcategoria.' });
        }
    });

    // Excluir subcategoria
    router.delete('/subcategories/:id', async (req, res) => {
        const { id } = req.params;

        try {
            // Buscar o item que representa a subcategoria
            const itemsResult = await pool.query('SELECT * FROM menu_items WHERE id = $1', [id]);
            if (itemsResult.rows.length === 0) {
                return res.status(404).json({ error: 'Subcategoria não encontrada.' });
            }

            const item = itemsResult.rows[0];
            const subCategoryName = item.subCategory;

            // Verificar se há outros itens usando esta subcategoria
            const otherItemsResult = await pool.query(
                'SELECT COUNT(*) as count FROM menu_items WHERE subCategory = $1 AND categoryId = $2 AND barId = $3 AND id != $4',
                [subCategoryName, item.categoryId, item.barId, id]
            );

            if (parseInt(otherItemsResult.rows[0].count) > 0) {
                return res.status(400).json({ 
                    error: `Não é possível excluir esta subcategoria. Ela está sendo usada por ${otherItemsResult.rows[0].count} outro(s) item(s).`,
                    itemsCount: parseInt(otherItemsResult.rows[0].count)
                });
            }

            // Excluir o item que representa a subcategoria
            await pool.query('DELETE FROM menu_items WHERE id = $1', [id]);

            res.json({ 
                message: 'Subcategoria excluída com sucesso.',
                deletedSubCategory: {
                    name: subCategoryName,
                    categoryId: item.categoryId,
                    barId: item.barId
                }
            });
        } catch (error) {
            console.error('Erro ao excluir subcategoria:', error);
            res.status(500).json({ error: 'Erro ao excluir subcategoria.' });
        }
    });

    // Reordenar subcategorias de uma categoria
    router.put('/subcategories/reorder/:categoryId', async (req, res) => {
        const { categoryId } = req.params;
        const { subcategoryNames } = req.body; // Array de nomes na nova ordem

        if (!Array.isArray(subcategoryNames) || subcategoryNames.length === 0) {
            return res.status(400).json({ error: 'Array de nomes de subcategorias é obrigatório.' });
        }

        try {
            // Verificar se a categoria existe
            const categoriesResult = await pool.query('SELECT id FROM menu_categories WHERE id = $1', [categoryId]);
            if (categoriesResult.rows.length === 0) {
                return res.status(404).json({ error: 'Categoria não encontrada.' });
            }

            // Atualizar ordem das subcategorias
            for (let i = 0; i < subcategoryNames.length; i++) {
                await pool.query(
                    'UPDATE menu_items SET "order" = $1 WHERE subCategory = $2 AND categoryId = $3',
                    [i, subcategoryNames[i], categoryId]
                );
            }

            // Buscar subcategorias atualizadas
            const updatedResult = await pool.query(`
                SELECT DISTINCT 
                    subCategory as name,
                    categoryId,
                    barId,
                    COUNT(*) as itemsCount
                FROM menu_items 
                WHERE categoryId = $1 AND subCategory IS NOT NULL AND subCategory != ''
                GROUP BY subCategory, categoryId, barId, "order"
                ORDER BY "order", name
            `, [categoryId]);

            res.json({
                message: 'Ordem das subcategorias atualizada com sucesso.',
                subcategories: updatedResult.rows
            });
        } catch (error) {
            console.error('Erro ao reordenar subcategorias:', error);
            res.status(500).json({ error: 'Erro ao reordenar subcategorias.' });
        }
    });

    // ============================================
    // ROTAS PARA ITENS (ATUALIZADAS)
    // ============================================

    // Rotas para Itens
    router.post('/items', async (req, res) => {
        const { name, description, price, imageUrl, categoryId, barId, subCategory, order, toppings, seals } = req.body;
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // Tentar sempre usar o campo seals, se falhar, usar versão sem seals
            let hasSealsField = false;
            let itemId;

            try {
                // Tentar com seals primeiro
                const sealsJson = seals && Array.isArray(seals) ? JSON.stringify(seals) : null;
                const query = 'INSERT INTO menu_items (name, description, price, imageUrl, categoryId, barId, subCategory, "order", seals) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id';
                const values = [name, description, price, imageUrl, categoryId, barId, subCategory || null, order, sealsJson];
                
                const result = await client.query(query, values);
                hasSealsField = true;
                itemId = result.rows[0].id;
                console.log('✅ Item criado com selos');
            } catch (e) {
                // Se falhar, usar versão sem seals
                console.log('⚠️ Campo seals não disponível, criando item sem selos');
                const query = 'INSERT INTO menu_items (name, description, price, imageUrl, categoryId, barId, subCategory, "order") VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id';
                const values = [name, description, price, imageUrl, categoryId, barId, subCategory || null, order];
                
                const result = await client.query(query, values);
                itemId = result.rows[0].id;
            }

            if (toppings && toppings.length > 0) {
                const toppingIds = [];
                for (const topping of toppings) {
                    const toppingResult = await client.query('INSERT INTO toppings (name, price) VALUES ($1, $2) RETURNING id', [topping.name, topping.price]);
                    toppingIds.push(toppingResult.rows[0].id);
                }

                for (const toppingId of toppingIds) {
                    await client.query('INSERT INTO item_toppings (item_id, topping_id) VALUES ($1, $2)', [itemId, toppingId]);
                }
            }

            await client.query('COMMIT');
            res.status(201).json({ id: itemId, ...req.body });
        } catch (error) {
            await client.query('ROLLBACK');
            console.error('Erro ao criar item:', error);
            res.status(500).json({ error: 'Erro ao criar item.' });
        } finally {
            if (client) client.release();
        }
    });

    router.get('/items', async (req, res) => {
        try {
            const { barId } = req.query;
            
            // Verificar quais campos existem na tabela
            let hasSealsField = false;
            let hasVisibleField = false;
            
            try {
                const columnsResult = await pool.query(
                    "SELECT column_name FROM information_schema.columns WHERE table_name = 'menu_items' AND column_name IN ('seals', 'visible')"
                );
                const columns = columnsResult.rows.map(row => row.column_name);
                hasSealsField = columns.includes('seals');
                hasVisibleField = columns.includes('visible');
            } catch (e) {
                console.log('⚠️ Erro ao verificar colunas, usando versão compatível');
            }
            
            // Construir query baseada nos campos disponíveis (colunas estão em minúsculas no PostgreSQL)
            // IMPORTANTE: Todos os campos no SELECT devem estar no GROUP BY
            const groupByFields = [
                'mi.id', 'mi.name', 'mi.description', 'mi.price', 'mi.imageurl',
                'mi.categoryid', 'mi.barid', 'mi."order"', 'mc.name', 'mc.id', 'mi.subcategory',
                'category_ref_id'
            ];
            
            if (hasSealsField) {
                groupByFields.push('mi.seals');
            }
            if (hasVisibleField) {
                groupByFields.push('mi.visible');
            }
            
            const sealsSelect = hasSealsField ? 'mi.seals,' : '';
            const visibleSelect = hasVisibleField 
                ? `CASE 
                    WHEN mi.visible IS NULL THEN 1
                    ELSE (mi.visible::int)
                   END AS visible,`
                : '1 AS visible,';
            
            const query = `
                SELECT 
                    mi.id, 
                    mi.name, 
                    mi.description, 
                    mi.price, 
                    mi.imageurl as "imageUrl",
                    mi.categoryid as "categoryId", 
                    mi.barid as "barId", 
                    mi."order", 
                    mc.name as category,
                    mc.id as category_ref_id,
                    mi.subcategory as "subCategoryName",
                    ${sealsSelect}
                    ${visibleSelect}
                    string_agg(
                        t.id::text || ':' || t.name || ':' || t.price::text, 
                        '|'
                    ) as toppings
                FROM menu_items mi 
                JOIN menu_categories mc ON mi.categoryid = mc.id
                LEFT JOIN item_toppings it ON mi.id = it.item_id
                LEFT JOIN toppings t ON it.topping_id = t.id
                WHERE mi.deleted_at IS NULL
                ${barId ? 'AND mi.barid = $1' : ''}
                GROUP BY ${groupByFields.join(', ')}
                ORDER BY mi.barid, mi.categoryid, mi."order"
            `;
            
            const result = await pool.query(query, barId ? [barId] : []);
            
            const itemsWithToppings = result.rows.map((item) => {
                // Processar toppings do GROUP_CONCAT
                let toppings = [];
                if (item.toppings) {
                    toppings = item.toppings.split('|')
                        .filter(t => t.trim() !== '')
                        .map(t => {
                            const [id, name, price] = t.split(':');
                            return { id: parseInt(id), name, price: parseFloat(price) };
                        });
                }
                
                // Converter seals de JSON para array (apenas se o campo existir)
                let seals = [];
                if (hasSealsField && item.seals) {
                    try {
                        seals = JSON.parse(item.seals);
                    } catch (e) {
                        console.error('Erro ao parsear seals:', e);
                        seals = [];
                    }
                }
                
                // Garantir que imageUrl seja uma string válida (query já retorna como "imageUrl" via alias)
                let imageUrl = item.imageUrl || null;
                if (imageUrl && typeof imageUrl === 'string') {
                    // Se não começa com http, assumir que é apenas o filename
                    if (!imageUrl.startsWith('http://') && !imageUrl.startsWith('https://')) {
                        // Remover barras iniciais se houver
                        const cleanFilename = imageUrl.startsWith('/') ? imageUrl.substring(1) : imageUrl;
                        imageUrl = cleanFilename; // Manter apenas o filename para o frontend construir a URL
                    }
                } else {
                    imageUrl = null;
                }
                
                return { 
                    ...item,
                    imageUrl, 
                    toppings, 
                    seals
                };
            });
            
            res.json(itemsWithToppings);
        } catch (error) {
            console.error('Erro ao listar itens:', error);
            res.status(500).json({ error: 'Erro ao listar itens.' });
        }
    });

    // Rota para buscar um item específico
    router.get('/items/:id', async (req, res) => {
        const { id } = req.params;
        try {
            // Verificar se o campo seals existe
            let hasSealsField = false;
            try {
                const columnsResult = await pool.query(
                    "SELECT column_name FROM information_schema.columns WHERE table_name = 'menu_items' AND column_name = 'seals'"
                );
                hasSealsField = columnsResult.rows.length > 0;
            } catch (e) {
                console.log('Campo seals não encontrado, usando versão compatível');
            }

            const query = hasSealsField ? `
                SELECT 
                    mi.id, 
                    mi.name, 
                    mi.description, 
                    mi.price, 
                    mi.imageurl as "imageUrl", 
                    mi.categoryid as "categoryId", 
                    mi.barid as "barId", 
                    mi."order", 
                    mc.name as category,
                    mi.subcategory as "subCategoryName",
                    mi.seals
                FROM menu_items mi 
                JOIN menu_categories mc ON mi.categoryid = mc.id
                WHERE mi.id = $1
            ` : `
                SELECT 
                    mi.id, 
                    mi.name, 
                    mi.description, 
                    mi.price, 
                    mi.imageurl as "imageUrl", 
                    mi.categoryid as "categoryId", 
                    mi.barid as "barId", 
                    mi."order", 
                    mc.name as category,
                    mi.subcategory as "subCategoryName"
                FROM menu_items mi 
                JOIN menu_categories mc ON mi.categoryid = mc.id
                WHERE mi.id = $1
            `;

            const itemsResult = await pool.query(query, [id]);
            if (itemsResult.rows.length === 0) {
                return res.status(404).json({ error: 'Item não encontrado.' });
            }
            const item = itemsResult.rows[0];
            const toppingsResult = await pool.query('SELECT t.id, t.name, t.price FROM toppings t JOIN item_toppings it ON t.id = it.topping_id WHERE it.item_id = $1', [id]);
            
            // Converter seals de JSON para array (apenas se o campo existir)
            let seals = [];
            if (hasSealsField && item.seals) {
                try {
                    seals = JSON.parse(item.seals);
                } catch (e) {
                    console.error('Erro ao parsear seals:', e);
                    seals = [];
                }
            }
            
            // Garantir que imageUrl seja uma string válida (query já retorna como "imageUrl" via alias)
            let imageUrl = item.imageUrl || null;
            if (imageUrl && typeof imageUrl === 'string') {
                // Se não começa com http, assumir que é apenas o filename
                if (!imageUrl.startsWith('http://') && !imageUrl.startsWith('https://')) {
                    // Remover barras iniciais se houver
                    const cleanFilename = imageUrl.startsWith('/') ? imageUrl.substring(1) : imageUrl;
                    imageUrl = cleanFilename; // Manter apenas o filename para o frontend construir a URL
                }
            } else {
                imageUrl = null;
            }
            
            const normalizedItem = {
                ...item,
                imageUrl,
                toppings: toppingsResult.rows,
                seals
            };
            
            res.json(normalizedItem);
        } catch (error) {
            console.error('Erro ao buscar item:', error);
            res.status(500).json({ error: 'Erro ao buscar item.' });
        }
    });

    // Rota para atualizar um item
    router.put('/items/:id', async (req, res) => {
        const { id } = req.params;
        const { name, description, price, imageUrl, categoryId, barId, subCategory, order, toppings, seals } = req.body;
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // Tentar sempre usar o campo seals, se falhar, usar versão sem seals
            let hasSealsField = false;

            try {
                // Tentar com seals primeiro
                const sealsJson = seals && Array.isArray(seals) ? JSON.stringify(seals) : null;
                const query = 'UPDATE menu_items SET name = $1, description = $2, price = $3, imageUrl = $4, categoryId = $5, barId = $6, subCategory = $7, "order" = $8, seals = $9 WHERE id = $10';
                const values = [name, description, price, imageUrl, categoryId, barId, subCategory || null, order, sealsJson, id];
                
                await client.query(query, values);
                hasSealsField = true;
                console.log('✅ Item atualizado com selos');
            } catch (e) {
                // Se falhar, usar versão sem seals
                console.log('⚠️ Campo seals não disponível, atualizando item sem selos');
                const query = 'UPDATE menu_items SET name = $1, description = $2, price = $3, imageUrl = $4, categoryId = $5, barId = $6, subCategory = $7, "order" = $8 WHERE id = $9';
                const values = [name, description, price, imageUrl, categoryId, barId, subCategory || null, order, id];
                
                await client.query(query, values);
            }
            
            await client.query('DELETE FROM item_toppings WHERE item_id = $1', [id]);
            
            if (toppings && toppings.length > 0) {
                const toppingIds = [];
                for (const topping of toppings) {
                    let toppingId;
                    // Tenta encontrar o topping existente pelo nome e preço
                    const existingToppingsResult = await client.query('SELECT id FROM toppings WHERE name = $1 AND price = $2', [topping.name, topping.price]);
                    if (existingToppingsResult.rows.length > 0) {
                        toppingId = existingToppingsResult.rows[0].id;
                    } else {
                        // Se não encontrar, insere um novo
                        const toppingResult = await client.query('INSERT INTO toppings (name, price) VALUES ($1, $2) RETURNING id', [topping.name, topping.price]);
                        toppingId = toppingResult.rows[0].id;
                    }
                    toppingIds.push(toppingId);
                }

                for (const toppingId of toppingIds) {
                    await client.query('INSERT INTO item_toppings (item_id, topping_id) VALUES ($1, $2)', [id, toppingId]);
                }
            }
            
            await client.query('COMMIT');
            res.json({ message: 'Item atualizado com sucesso.' });
        } catch (error) {
            await client.query('ROLLBACK');
            console.error('Erro ao atualizar item:', error);
            res.status(500).json({ error: 'Erro ao atualizar item.' });
        } finally {
            if (client) client.release();
        }
    });

    // ============================================
    // NOVO: Rota para alternar visibilidade de um item (ocultar/mostrar)
    // ============================================
    router.patch('/items/:id/visibility', async (req, res) => {
        const { id } = req.params;
        const { visible } = req.body; // true (1) ou false (0)
        
        try {
            // Verificar se o item existe
            const itemsResult = await pool.query('SELECT id, name, visible FROM menu_items WHERE id = $1', [id]);
            
            if (itemsResult.rows.length === 0) {
                return res.status(404).json({ error: 'Item não encontrado.' });
            }
            
            const currentItem = itemsResult.rows[0];
            const newVisibility = visible !== undefined ? (visible ? 1 : 0) : (currentItem.visible === 1 ? 0 : 1);
            
            // Atualizar visibilidade
            await pool.query('UPDATE menu_items SET visible = $1 WHERE id = $2', [newVisibility, id]);
            
            res.json({ 
                message: newVisibility === 1 ? 'Item tornado visível com sucesso.' : 'Item ocultado com sucesso.',
                item: {
                    id,
                    name: currentItem.name,
                    visible: newVisibility === 1,
                    status: newVisibility === 1 ? 'visível' : 'oculto'
                }
            });
        } catch (error) {
            console.error('Erro ao alternar visibilidade do item:', error);
            res.status(500).json({ error: 'Erro ao alternar visibilidade do item.' });
        }
    });
    
    // Rota para deletar um item (soft delete - vai para lixeira)
    router.delete('/items/:id', async (req, res) => {
        const { id } = req.params;
        const { permanent } = req.query; // Se permanent=true, exclui permanentemente
        
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            
            if (permanent === 'true') {
                // Exclusão permanente (para limpeza após 30 dias ou admin)
                await client.query('DELETE FROM item_toppings WHERE item_id = $1', [id]);
                await client.query('DELETE FROM menu_items WHERE id = $1', [id]);
                await client.query('COMMIT');
                res.json({ message: 'Item deletado permanentemente com sucesso.' });
            } else {
                // Soft delete (marca como deletado)
                await client.query(
                    'UPDATE menu_items SET deleted_at = NOW() WHERE id = $1',
                    [id]
                );
                await client.query('COMMIT');
                res.json({ 
                    message: 'Item movido para a lixeira. Você pode restaurá-lo dentro de 30 dias.',
                    deletedAt: new Date().toISOString()
                });
            }
        } catch (error) {
            await client.query('ROLLBACK');
            console.error('Erro ao deletar item:', error);
            res.status(500).json({ error: 'Erro ao deletar item.', details: error.message });
        } finally {
            if (client) client.release();
        }
    });

    // Rota para listar itens deletados (lixeira)
    router.get('/items/trash', async (req, res) => {
        try {
            const query = `
                SELECT 
                    mi.id, 
                    mi.name, 
                    mi.description, 
                    mi.price, 
                    mi.imageurl as "imageUrl",
                    mi.categoryid as "categoryId", 
                    mi.barid as "barId", 
                    mi."order", 
                    mc.name as category,
                    mi.subcategory as "subCategoryName",
                    mi.deleted_at,
                    CASE 
                        WHEN mi.deleted_at IS NULL THEN NULL
                        ELSE EXTRACT(EPOCH FROM (NOW() - mi.deleted_at)) / 86400
                    END as days_deleted,
                    CASE 
                        WHEN mi.visible IS NULL THEN 1
                        ELSE (mi.visible::int)
                    END AS visible
                FROM menu_items mi 
                LEFT JOIN menu_categories mc ON mi.categoryid = mc.id
                WHERE mi.deleted_at IS NOT NULL
                ORDER BY mi.deleted_at DESC
            `;
            
            const result = await pool.query(query);
            
            const items = result.rows.map((item) => ({
                ...item,
                daysDeleted: item.days_deleted ? Math.floor(item.days_deleted) : 0,
                canRestore: item.days_deleted ? item.days_deleted < 30 : true
            }));
            
            res.json({
                success: true,
                items: items,
                total: items.length,
                itemsExpiringSoon: items.filter(item => item.daysDeleted >= 25 && item.daysDeleted < 30).length
            });
        } catch (error) {
            console.error('Erro ao listar itens da lixeira:', error);
            res.status(500).json({ error: 'Erro ao listar itens da lixeira.', details: error.message });
        }
    });

    // Rota para restaurar item da lixeira
    router.patch('/items/:id/restore', async (req, res) => {
        const { id } = req.params;
        
        try {
            // Verificar se o item existe e está deletado
            const checkResult = await pool.query(
                'SELECT id, name, deleted_at FROM menu_items WHERE id = $1',
                [id]
            );
            
            if (checkResult.rows.length === 0) {
                return res.status(404).json({ error: 'Item não encontrado.' });
            }
            
            const item = checkResult.rows[0];
            
            if (item.deleted_at === null) {
                return res.status(400).json({ error: 'Item não está na lixeira. Ele já está ativo.' });
            }
            
            // Verificar se já passou de 30 dias
            const daysDeleted = (new Date().getTime() - new Date(item.deleted_at).getTime()) / (1000 * 60 * 60 * 24);
            
            if (daysDeleted >= 30) {
                return res.status(400).json({ 
                    error: 'Item não pode ser restaurado. Passou mais de 30 dias desde a exclusão.',
                    daysDeleted: Math.floor(daysDeleted)
                });
            }
            
            // Restaurar item (remover deleted_at)
            await pool.query(
                'UPDATE menu_items SET deleted_at = NULL WHERE id = $1',
                [id]
            );
            
            res.json({
                success: true,
                message: 'Item restaurado com sucesso!',
                item: {
                    id: item.id,
                    name: item.name
                }
            });
        } catch (error) {
            console.error('Erro ao restaurar item:', error);
            res.status(500).json({ error: 'Erro ao restaurar item.', details: error.message });
        }
    });

    return router;
};