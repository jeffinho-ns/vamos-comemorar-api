const express = require('express');
const router = express.Router();

module.exports = (pool) => {
    // Rota para criar um novo estabelecimento
    router.post('/bars', async (req, res) => {
        const { 
            name, slug, description, logoUrl, coverImageUrl, coverImages, address, rating, 
            reviewsCount, latitude, longitude, amenities, popupImageUrl,
            // ✨ Adicionados os novos campos
            facebook, instagram, whatsapp 
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
            
            // ✨ Query de INSERT atualizada para incluir as novas colunas
            const [result] = await pool.query(
                'INSERT INTO bars (name, slug, description, logoUrl, coverImageUrl, coverImages, address, rating, reviewsCount, latitude, longitude, amenities, popupImageUrl, facebook, instagram, whatsapp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [
                    name, slug, description, logoUrl, coverImageUrl, coverImagesValue, 
                    address, ratingValue, reviewsCountValue, latitudeValue, longitudeValue, 
                    JSON.stringify(amenities), popupImageUrl, 
                    // ✨ Adicionados os valores dos novos campos
                    facebook || null, instagram || null, whatsapp || null
                ]
            );
            
            const newBar = { id: result.insertId, ...req.body };
            res.status(201).json(newBar);
        } catch (error) {
            console.error('Erro ao criar estabelecimento:', error);
            res.status(500).json({ error: 'Erro ao criar estabelecimento.' });
        }
    });

    // Rota para listar todos os estabelecimentos
    router.get('/bars', async (req, res) => {
        try {
            // ✨ Query de SELECT atualizada para buscar as novas colunas
            const [bars] = await pool.query('SELECT *, JSON_UNQUOTE(amenities) as amenities, JSON_UNQUOTE(coverImages) as coverImages FROM bars');
            const barsFormatted = bars.map(bar => ({
                ...bar,
                amenities: bar.amenities ? JSON.parse(bar.amenities) : [],
                coverImages: bar.coverImages ? JSON.parse(bar.coverImages) : []
            }));
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
            const [bars] = await pool.query('SELECT *, JSON_UNQUOTE(amenities) as amenities, JSON_UNQUOTE(coverImages) as coverImages FROM bars WHERE id = ?', [id]);
            if (bars.length === 0) {
                return res.status(404).json({ error: 'Estabelecimento não encontrado.' });
            }
            const bar = bars[0];
            bar.amenities = bar.amenities ? JSON.parse(bar.amenities) : [];
            bar.coverImages = bar.coverImages ? JSON.parse(bar.coverImages) : [];
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
            facebook, instagram, whatsapp
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
            
            // ✨ Query de UPDATE atualizada para incluir as novas colunas
            await pool.query(
                'UPDATE bars SET name = ?, slug = ?, description = ?, logoUrl = ?, coverImageUrl = ?, coverImages = ?, address = ?, rating = ?, reviewsCount = ?, latitude = ?, longitude = ?, amenities = ?, popupImageUrl = ?, facebook = ?, instagram = ?, whatsapp = ? WHERE id = ?',
                [
                    name, slug, description, logoUrl, coverImageUrl, coverImagesValue, 
                    address, ratingValue, reviewsCountValue, latitudeValue, longitudeValue, 
                    JSON.stringify(amenities), popupImageUrl, 
                    // ✨ Adicionados os valores dos novos campos
                    facebook || null, instagram || null, whatsapp || null,
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
            await pool.query('DELETE FROM bars WHERE id = ?', [id]);
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
            const [result] = await pool.query(
                'INSERT INTO menu_categories (barId, name, `order`) VALUES (?, ?, ?)',
                [barId, name, order]
            );
            res.status(201).json({ id: result.insertId, ...req.body });
        } catch (error) {
            res.status(500).json({ error: 'Erro ao criar categoria.' });
        }
    });

    router.get('/categories', async (req, res) => {
        try {
            const [categories] = await pool.query('SELECT * FROM menu_categories');
            res.json(categories);
        } catch (error) {
            res.status(500).json({ error: 'Erro ao listar categorias.' });
        }
    });

    // Rota para buscar uma categoria específica
    router.get('/categories/:id', async (req, res) => {
        const { id } = req.params;
        try {
            const [categories] = await pool.query('SELECT * FROM menu_categories WHERE id = ?', [id]);
            if (categories.length === 0) {
                return res.status(404).json({ error: 'Categoria não encontrada.' });
            }
            res.json(categories[0]);
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
                'UPDATE menu_categories SET barId = ?, name = ?, `order` = ? WHERE id = ?',
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
            await pool.query('DELETE FROM menu_categories WHERE id = ?', [id]);
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
            const [subCategories] = await pool.query(`
                SELECT DISTINCT 
                    mi.subCategory as name,
                    mi.categoryId,
                    mi.barId,
                    mc.name as categoryName,
                    b.name as barName,
                    COUNT(mi.id) as itemsCount
                FROM menu_items mi
                JOIN menu_categories mc ON mi.categoryId = mc.id
                JOIN bars b ON mi.barId = b.id
                WHERE mi.subCategory IS NOT NULL 
                  AND mi.subCategory != ''
                  AND mi.subCategory != ' '
                GROUP BY mi.subCategory, mi.categoryId, mi.barId
                ORDER BY b.name, mc.order, mi.subCategory
            `);
            res.json(subCategories);
        } catch (error) {
            console.error('Erro ao listar sub-categorias:', error);
            res.status(500).json({ error: 'Erro ao listar sub-categorias.' });
        }
    });

    // Listar subcategorias de uma categoria específica
    router.get('/subcategories/category/:categoryId', async (req, res) => {
        const { categoryId } = req.params;
        try {
            const [subCategories] = await pool.query(`
                SELECT DISTINCT 
                    mi.subCategory as name,
                    mi.categoryId,
                    mi.barId,
                    COUNT(mi.id) as itemsCount,
                    MIN(mi.id) as id
                FROM menu_items mi
                WHERE mi.categoryId = ? 
                  AND mi.subCategory IS NOT NULL 
                  AND mi.subCategory != ''
                  AND mi.subCategory != ' '
                GROUP BY mi.subCategory, mi.categoryId, mi.barId
                ORDER BY mi.subCategory
            `, [categoryId]);
            res.json(subCategories);
        } catch (error) {
            console.error('Erro ao listar sub-categorias da categoria:', error);
            res.status(500).json({ error: 'Erro ao listar sub-categorias da categoria.' });
        }
    });

    // Listar subcategorias de um bar específico
    router.get('/subcategories/bar/:barId', async (req, res) => {
        const { barId } = req.params;
        try {
            const [subCategories] = await pool.query(`
                SELECT DISTINCT 
                    mi.subCategory as name,
                    mi.categoryId,
                    mi.barId,
                    mc.name as categoryName,
                    COUNT(mi.id) as itemsCount,
                    MIN(mi.id) as id
                FROM menu_items mi
                JOIN menu_categories mc ON mi.categoryId = mc.id
                WHERE mi.barId = ? 
                  AND mi.subCategory IS NOT NULL 
                  AND mi.subCategory != ''
                  AND mi.subCategory != ' '
                GROUP BY mi.subCategory, mi.categoryId, mi.barId
                ORDER BY mc.order, mi.subCategory
            `, [barId]);
            res.json(subCategories);
        } catch (error) {
            console.error('Erro ao listar sub-categorias do bar:', error);
            res.status(500).json({ error: 'Erro ao listar sub-categorias do bar.' });
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
            const [categories] = await pool.query('SELECT id FROM menu_categories WHERE id = ? AND barId = ?', [categoryId, barId]);
            if (categories.length === 0) {
                return res.status(404).json({ error: 'Categoria não encontrada.' });
            }

            // Verificar se o bar existe
            const [bars] = await pool.query('SELECT id FROM bars WHERE id = ?', [barId]);
            if (bars.length === 0) {
                return res.status(404).json({ error: 'Bar não encontrado.' });
            }

            // Verificar se já existe uma subcategoria com o mesmo nome na mesma categoria
            const [existing] = await pool.query(
                'SELECT COUNT(*) as count FROM menu_items WHERE subCategory = ? AND categoryId = ? AND barId = ?',
                [name, categoryId, barId]
            );
            
            if (existing[0].count > 0) {
                return res.status(409).json({ error: 'Já existe uma subcategoria com este nome nesta categoria.' });
            }

            // Verificar se o campo seals existe
            let hasSealsField = false;
            try {
                const [columns] = await pool.query(
                    "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'menu_items' AND COLUMN_NAME = 'seals'"
                );
                hasSealsField = columns.length > 0;
            } catch (e) {
                console.log('Campo seals não encontrado, ignorando selos');
            }

            // Criar um item vazio com a nova subcategoria para "reservar" o nome
            const query = hasSealsField ? 
                'INSERT INTO menu_items (name, description, price, imageUrl, categoryId, barId, subCategory, `order`, seals) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)' :
                'INSERT INTO menu_items (name, description, price, imageUrl, categoryId, barId, subCategory, `order`) VALUES (?, ?, ?, ?, ?, ?, ?, ?)';
            
            const values = hasSealsField ? 
                [`[Nova Subcategoria] ${name}`, 'Item temporário para reservar subcategoria', 0.00, null, categoryId, barId, name, order || 0, null] :
                [`[Nova Subcategoria] ${name}`, 'Item temporário para reservar subcategoria', 0.00, null, categoryId, barId, name, order || 0];

            const [result] = await pool.query(query, values);

            const newSubCategory = {
                id: result.insertId,
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
            const [items] = await pool.query('SELECT * FROM menu_items WHERE id = ?', [id]);
            if (items.length === 0) {
                return res.status(404).json({ error: 'Subcategoria não encontrada.' });
            }

            const item = items[0];
            const oldSubCategoryName = item.subCategory;

            // Verificar se o novo nome já existe na mesma categoria
            if (name !== oldSubCategoryName) {
                const [duplicate] = await pool.query(
                    'SELECT COUNT(*) as count FROM menu_items WHERE subCategory = ? AND categoryId = ? AND barId = ?',
                    [name, item.categoryId, item.barId]
                );
                
                if (duplicate[0].count > 0) {
                    return res.status(409).json({ error: 'Já existe uma subcategoria com este nome nesta categoria.' });
                }

                // Atualizar todos os itens que usam esta subcategoria
                await pool.query(
                    'UPDATE menu_items SET subCategory = ? WHERE subCategory = ? AND categoryId = ? AND barId = ?',
                    [name, oldSubCategoryName, item.categoryId, item.barId]
                );
            }

            // Atualizar ordem se fornecida
            if (order !== undefined && order !== item.order) {
                await pool.query(
                    'UPDATE menu_items SET `order` = ? WHERE id = ?',
                    [order, id]
                );
            }

            // Buscar item atualizado
            const [updated] = await pool.query('SELECT * FROM menu_items WHERE id = ?', [id]);
            
            res.json({
                id: updated[0].id,
                name: updated[0].subCategory,
                categoryId: updated[0].categoryId,
                barId: updated[0].barId,
                order: updated[0].order,
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
            const [items] = await pool.query('SELECT * FROM menu_items WHERE id = ?', [id]);
            if (items.length === 0) {
                return res.status(404).json({ error: 'Subcategoria não encontrada.' });
            }

            const item = items[0];
            const subCategoryName = item.subCategory;

            // Verificar se há outros itens usando esta subcategoria
            const [otherItems] = await pool.query(
                'SELECT COUNT(*) as count FROM menu_items WHERE subCategory = ? AND categoryId = ? AND barId = ? AND id != ?',
                [subCategoryName, item.categoryId, item.barId, id]
            );

            if (otherItems[0].count > 0) {
                return res.status(400).json({ 
                    error: `Não é possível excluir esta subcategoria. Ela está sendo usada por ${otherItems[0].count} outro(s) item(s).`,
                    itemsCount: otherItems[0].count
                });
            }

            // Excluir o item que representa a subcategoria
            await pool.query('DELETE FROM menu_items WHERE id = ?', [id]);

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
            const [categories] = await pool.query('SELECT id FROM menu_categories WHERE id = ?', [categoryId]);
            if (categories.length === 0) {
                return res.status(404).json({ error: 'Categoria não encontrada.' });
            }

            // Atualizar ordem das subcategorias
            for (let i = 0; i < subcategoryNames.length; i++) {
                await pool.query(
                    'UPDATE menu_items SET `order` = ? WHERE subCategory = ? AND categoryId = ?',
                    [i, subcategoryNames[i], categoryId]
                );
            }

            // Buscar subcategorias atualizadas
            const [updated] = await pool.query(`
                SELECT DISTINCT 
                    subCategory as name,
                    categoryId,
                    barId,
                    COUNT(*) as itemsCount
                FROM menu_items 
                WHERE categoryId = ? AND subCategory IS NOT NULL AND subCategory != ''
                GROUP BY subCategory, categoryId, barId
                ORDER BY \`order\`, name
            `, [categoryId]);

            res.json({
                message: 'Ordem das subcategorias atualizada com sucesso.',
                subcategories: updated
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
        try {
            await pool.query('START TRANSACTION');

            // Verificar se o campo seals existe
            let hasSealsField = false;
            try {
                const [columns] = await pool.query(
                    "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'menu_items' AND COLUMN_NAME = 'seals'"
                );
                hasSealsField = columns.length > 0;
            } catch (e) {
                console.log('Campo seals não encontrado, ignorando selos');
            }

            // Converter seals para JSON se for um array e o campo existir
            const sealsJson = hasSealsField && seals && Array.isArray(seals) ? JSON.stringify(seals) : null;

            const query = hasSealsField ? 
                'INSERT INTO menu_items (name, description, price, imageUrl, categoryId, barId, subCategory, `order`, seals) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)' :
                'INSERT INTO menu_items (name, description, price, imageUrl, categoryId, barId, subCategory, `order`) VALUES (?, ?, ?, ?, ?, ?, ?, ?)';
            
            const values = hasSealsField ? 
                [name, description, price, imageUrl, categoryId, barId, subCategory || null, order, sealsJson] :
                [name, description, price, imageUrl, categoryId, barId, subCategory || null, order];

            const [result] = await pool.query(query, values);
            const itemId = result.insertId;

            if (toppings && toppings.length > 0) {
                const toppingIds = [];
                for (const topping of toppings) {
                    const [toppingResult] = await pool.query('INSERT INTO toppings (name, price) VALUES (?, ?)', [topping.name, topping.price]);
                    toppingIds.push(toppingResult.insertId);
                }

                const itemToppingValues = toppingIds.map(toppingId => `(${itemId}, ${toppingId})`).join(', ');
                if (itemToppingValues) {
                    await pool.query(`INSERT INTO item_toppings (item_id, topping_id) VALUES ${itemToppingValues}`);
                }
            }

            await pool.query('COMMIT');
            res.status(201).json({ id: itemId, ...req.body });
        } catch (error) {
            await pool.query('ROLLBACK');
            console.error('Erro ao criar item:', error);
            res.status(500).json({ error: 'Erro ao criar item.' });
        }
    });


    router.get('/items', async (req, res) => {
        try {
            // Primeiro, verificar se o campo seals existe
            let hasSealsField = false;
            try {
                const [columns] = await pool.query(
                    "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'menu_items' AND COLUMN_NAME = 'seals'"
                );
                hasSealsField = columns.length > 0;
            } catch (e) {
                console.log('Campo seals não encontrado, usando versão compatível');
            }

            const query = hasSealsField ? `
                SELECT 
                    mi.id, 
                    mi.name, 
                    mi.description, 
                    mi.price, 
                    mi.imageUrl, 
                    mi.categoryId, 
                    mi.barId, 
                    mi.order, 
                    mc.name as category,
                    mi.subCategory as subCategoryName,
                    mi.seals
                FROM menu_items mi 
                JOIN menu_categories mc ON mi.categoryId = mc.id
                ORDER BY mi.barId, mi.categoryId, mi.order
            ` : `
                SELECT 
                    mi.id, 
                    mi.name, 
                    mi.description, 
                    mi.price, 
                    mi.imageUrl, 
                    mi.categoryId, 
                    mi.barId, 
                    mi.order, 
                    mc.name as category,
                    mi.subCategory as subCategoryName
                FROM menu_items mi 
                JOIN menu_categories mc ON mi.categoryId = mc.id
                ORDER BY mi.barId, mi.categoryId, mi.order
            `;
            
            const [items] = await pool.query(query);
            
            const itemsWithToppings = await Promise.all(items.map(async (item) => {
                const [toppings] = await pool.query('SELECT t.id, t.name, t.price FROM toppings t JOIN item_toppings it ON t.id = it.topping_id WHERE it.item_id = ?', [item.id]);
                
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
                
                return { ...item, toppings, seals };
            }));
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
                const [columns] = await pool.query(
                    "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'menu_items' AND COLUMN_NAME = 'seals'"
                );
                hasSealsField = columns.length > 0;
            } catch (e) {
                console.log('Campo seals não encontrado, usando versão compatível');
            }

            const query = hasSealsField ? `
                SELECT 
                    mi.id, 
                    mi.name, 
                    mi.description, 
                    mi.price, 
                    mi.imageUrl, 
                    mi.categoryId, 
                    mi.barId, 
                    mi.order, 
                    mc.name as category,
                    mi.subCategory as subCategoryName,
                    mi.seals
                FROM menu_items mi 
                JOIN menu_categories mc ON mi.categoryId = mc.id
                WHERE mi.id = ?
            ` : `
                SELECT 
                    mi.id, 
                    mi.name, 
                    mi.description, 
                    mi.price, 
                    mi.imageUrl, 
                    mi.categoryId, 
                    mi.barId, 
                    mi.order, 
                    mc.name as category,
                    mi.subCategory as subCategoryName
                FROM menu_items mi 
                JOIN menu_categories mc ON mi.categoryId = mc.id
                WHERE mi.id = ?
            `;

            const [items] = await pool.query(query, [id]);
            if (items.length === 0) {
                return res.status(404).json({ error: 'Item não encontrado.' });
            }
            const item = items[0];
            const [toppings] = await pool.query('SELECT t.id, t.name, t.price FROM toppings t JOIN item_toppings it ON t.id = it.topping_id WHERE it.item_id = ?', [id]);
            
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
            
            item.toppings = toppings;
            item.seals = seals;
            res.json(item);
        } catch (error) {
            console.error('Erro ao buscar item:', error);
            res.status(500).json({ error: 'Erro ao buscar item.' });
        }
    });

    // Rota para atualizar um item
    router.put('/items/:id', async (req, res) => {
        const { id } = req.params;
        const { name, description, price, imageUrl, categoryId, barId, subCategory, order, toppings, seals } = req.body;
        try {
            await pool.query('START TRANSACTION');

            // Verificar se o campo seals existe
            let hasSealsField = false;
            try {
                const [columns] = await pool.query(
                    "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'menu_items' AND COLUMN_NAME = 'seals'"
                );
                hasSealsField = columns.length > 0;
            } catch (e) {
                console.log('Campo seals não encontrado, ignorando selos');
            }

            // Converter seals para JSON se for um array e o campo existir
            const sealsJson = hasSealsField && seals && Array.isArray(seals) ? JSON.stringify(seals) : null;

            const query = hasSealsField ? 
                'UPDATE menu_items SET name = ?, description = ?, price = ?, imageUrl = ?, categoryId = ?, barId = ?, subCategory = ?, `order` = ?, seals = ? WHERE id = ?' :
                'UPDATE menu_items SET name = ?, description = ?, price = ?, imageUrl = ?, categoryId = ?, barId = ?, subCategory = ?, `order` = ? WHERE id = ?';
            
            const values = hasSealsField ? 
                [name, description, price, imageUrl, categoryId, barId, subCategory || null, order, sealsJson, id] :
                [name, description, price, imageUrl, categoryId, barId, subCategory || null, order, id];

            await pool.query(query, values);
            
            await pool.query('DELETE FROM item_toppings WHERE item_id = ?', [id]);
            
            if (toppings && toppings.length > 0) {
                const toppingIds = [];
                for (const topping of toppings) {
                    let toppingId;
                    // Tenta encontrar o topping existente pelo nome e preço
                    const [existingToppings] = await pool.query('SELECT id FROM toppings WHERE name = ? AND price = ?', [topping.name, topping.price]);
                    if (existingToppings.length > 0) {
                        toppingId = existingToppings[0].id;
                    } else {
                        // Se não encontrar, insere um novo
                        const [toppingResult] = await pool.query('INSERT INTO toppings (name, price) VALUES (?, ?)', [topping.name, topping.price]);
                        toppingId = toppingResult.insertId;
                    }
                    toppingIds.push(toppingId);
                }

                const itemToppingValues = toppingIds.map(toppingId => `(${id}, ${toppingId})`).join(', ');
                if (itemToppingValues) {
                     await pool.query(`INSERT INTO item_toppings (item_id, topping_id) VALUES ${itemToppingValues}`);
                }
            }
            
            await pool.query('COMMIT');
            res.json({ message: 'Item atualizado com sucesso.' });
        } catch (error) {
            await pool.query('ROLLBACK');
            console.error('Erro ao atualizar item:', error);
            res.status(500).json({ error: 'Erro ao atualizar item.' });
        }
    });

    // Rota para deletar um item
    router.delete('/items/:id', async (req, res) => {
        const { id } = req.params;
        try {
            await pool.query('START TRANSACTION');
            await pool.query('DELETE FROM item_toppings WHERE item_id = ?', [id]);
            await pool.query('DELETE FROM menu_items WHERE id = ?', [id]);
            await pool.query('COMMIT');
            res.json({ message: 'Item deletado com sucesso.' });
        } catch (error) {
            await pool.query('ROLLBACK');
            console.error('Erro ao deletar item:', error);
            res.status(500).json({ error: 'Erro ao deletar item.' });
        }
    });
    
    // Endpoint para executar migração de selos
    router.post('/migrate-seals', async (req, res) => {
        try {
            console.log('🚀 Iniciando migração de selos via API...');
            
            // Verificar se o campo já existe
            const [existingColumns] = await pool.query(
                "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'menu_items' AND COLUMN_NAME = 'seals'"
            );
            
            if (existingColumns.length > 0) {
                return res.json({ 
                    success: true, 
                    message: 'Campo "seals" já existe na tabela menu_items',
                    alreadyExists: true 
                });
            }

            console.log('📋 Executando migração...');
            
            // Executar comandos de migração
            await pool.query(
                "ALTER TABLE `menu_items` ADD COLUMN `seals` JSON DEFAULT NULL COMMENT 'Array de IDs dos selos selecionados para o item' AFTER `subCategory`"
            );
            
            await pool.query(
                "CREATE INDEX `idx_menu_items_seals` ON `menu_items` ((CAST(`seals` AS CHAR(255) ARRAY)))"
            );
            
            await pool.query(
                "ALTER TABLE `menu_items` COMMENT = 'Tabela de itens do cardápio com suporte a selos de identificação'"
            );

            console.log('✅ Migração executada com sucesso!');
            
            res.json({ 
                success: true, 
                message: 'Migração de selos executada com sucesso!',
                alreadyExists: false 
            });

        } catch (error) {
            console.error('❌ Erro durante a migração:', error);
            res.status(500).json({ 
                success: false, 
                error: 'Erro ao executar migração de selos',
                details: error.message 
            });
        }
    });

    return router;
};