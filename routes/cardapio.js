// routes/cardapio.js

const express = require('express');
const router = express.Router();

module.exports = (pool) => {
    // Rota para criar um novo estabelecimento
    router.post('/bars', async (req, res) => {
        const { name, slug, description, logoUrl, coverImageUrl, address, rating, reviewsCount, latitude, longitude, amenities } = req.body;
        try {
            const ratingValue = rating ? parseFloat(rating) : null;
            const reviewsCountValue = reviewsCount ? parseInt(reviewsCount) : null;
            const latitudeValue = latitude ? parseFloat(latitude) : null;
            const longitudeValue = longitude ? parseFloat(longitude) : null;
            
            const [result] = await pool.query(
                'INSERT INTO bars (name, slug, description, logoUrl, coverImageUrl, address, rating, reviewsCount, latitude, longitude, amenities) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [name, slug, description, logoUrl, coverImageUrl, address, ratingValue, reviewsCountValue, latitudeValue, longitudeValue, JSON.stringify(amenities)]
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
            const [bars] = await pool.query('SELECT *, JSON_UNQUOTE(amenities) as amenities FROM bars');
            const barsFormatted = bars.map(bar => ({
                ...bar,
                amenities: bar.amenities ? JSON.parse(bar.amenities) : []
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
            const [bars] = await pool.query('SELECT *, JSON_UNQUOTE(amenities) as amenities FROM bars WHERE id = ?', [id]);
            if (bars.length === 0) {
                return res.status(404).json({ error: 'Estabelecimento não encontrado.' });
            }
            const bar = bars[0];
            bar.amenities = bar.amenities ? JSON.parse(bar.amenities) : [];
            res.json(bar);
        } catch (error) {
            console.error('Erro ao buscar estabelecimento:', error);
            res.status(500).json({ error: 'Erro ao buscar estabelecimento.' });
        }
    });

    // Rota para atualizar um estabelecimento
    router.put('/bars/:id', async (req, res) => {
        const { id } = req.params;
        const { name, slug, description, logoUrl, coverImageUrl, address, rating, reviewsCount, latitude, longitude, amenities } = req.body;
        try {
            const ratingValue = rating ? parseFloat(rating) : null;
            const reviewsCountValue = reviewsCount ? parseInt(reviewsCount) : null;
            const latitudeValue = latitude ? parseFloat(latitude) : null;
            const longitudeValue = longitude ? parseFloat(longitude) : null;

            await pool.query(
                'UPDATE bars SET name = ?, slug = ?, description = ?, logoUrl = ?, coverImageUrl = ?, address = ?, rating = ?, reviewsCount = ?, latitude = ?, longitude = ?, amenities = ? WHERE id = ?',
                [name, slug, description, logoUrl, coverImageUrl, address, ratingValue, reviewsCountValue, latitudeValue, longitudeValue, JSON.stringify(amenities), id]
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
    // ROTAS PARA SUB-CATEGORIAS
    // ============================================

    // Criar sub-categoria
    router.post('/subcategories', async (req, res) => {
        const { name, categoryId, barId, order } = req.body;
        try {
            const [result] = await pool.query(
                'INSERT INTO menu_subcategories (name, categoryId, barId, `order`) VALUES (?, ?, ?, ?)',
                [name, categoryId, barId, order || 0]
            );
            res.status(201).json({ id: result.insertId, ...req.body });
        } catch (error) {
            console.error('Erro ao criar sub-categoria:', error);
            res.status(500).json({ error: 'Erro ao criar sub-categoria.' });
        }
    });

    // Listar todas as sub-categorias
    router.get('/subcategories', async (req, res) => {
        try {
            const [subCategories] = await pool.query(`
                SELECT 
                    ms.*,
                    mc.name as categoryName,
                    b.name as barName
                FROM menu_subcategories ms
                LEFT JOIN menu_categories mc ON ms.categoryId = mc.id
                LEFT JOIN bars b ON ms.barId = b.id
                ORDER BY ms.barId, ms.categoryId, ms.order
            `);
            res.json(subCategories);
        } catch (error) {
            console.error('Erro ao listar sub-categorias:', error);
            res.status(500).json({ error: 'Erro ao listar sub-categorias.' });
        }
    });

    // Buscar sub-categoria específica
    router.get('/subcategories/:id', async (req, res) => {
        const { id } = req.params;
        try {
            const [subCategories] = await pool.query(`
                SELECT 
                    ms.*,
                    mc.name as categoryName,
                    b.name as barName
                FROM menu_subcategories ms
                LEFT JOIN menu_categories mc ON ms.categoryId = mc.id
                LEFT JOIN bars b ON ms.barId = b.id
                WHERE ms.id = ?
            `, [id]);
            
            if (subCategories.length === 0) {
                return res.status(404).json({ error: 'Sub-categoria não encontrada.' });
            }
            res.json(subCategories[0]);
        } catch (error) {
            console.error('Erro ao buscar sub-categoria:', error);
            res.status(500).json({ error: 'Erro ao buscar sub-categoria.' });
        }
    });

    // Atualizar sub-categoria
    router.put('/subcategories/:id', async (req, res) => {
        const { id } = req.params;
        const { name, categoryId, barId, order } = req.body;
        try {
            await pool.query(
                'UPDATE menu_subcategories SET name = ?, categoryId = ?, barId = ?, `order` = ? WHERE id = ?',
                [name, categoryId, barId, order || 0, id]
            );
            res.json({ message: 'Sub-categoria atualizada com sucesso.' });
        } catch (error) {
            console.error('Erro ao atualizar sub-categoria:', error);
            res.status(500).json({ error: 'Erro ao atualizar sub-categoria.' });
        }
    });

    // Deletar sub-categoria específica
    router.delete('/subcategories/:id', async (req, res) => {
        const { id } = req.params;
        try {
            await pool.query('DELETE FROM menu_subcategories WHERE id = ?', [id]);
            res.json({ message: 'Sub-categoria deletada com sucesso.' });
        } catch (error) {
            console.error('Erro ao deletar sub-categoria:', error);
            res.status(500).json({ error: 'Erro ao deletar sub-categoria.' });
        }
    });

    // Deletar todas as sub-categorias de uma categoria (usado ao editar categoria)
    router.delete('/subcategories/category/:categoryId', async (req, res) => {
        const { categoryId } = req.params;
        try {
            await pool.query('DELETE FROM menu_subcategories WHERE categoryId = ?', [categoryId]);
            res.json({ message: 'Sub-categorias da categoria deletadas com sucesso.' });
        } catch (error) {
            console.error('Erro ao deletar sub-categorias da categoria:', error);
            res.status(500).json({ error: 'Erro ao deletar sub-categorias da categoria.' });
        }
    });

    // ============================================
    // ROTAS PARA ITENS (ATUALIZADAS)
    // ============================================

    // Rotas para Itens
    router.post('/items', async (req, res) => {
        const { name, description, price, imageUrl, categoryId, barId, subCategoryId, order, toppings } = req.body;
        try {
            const [result] = await pool.query(
                'INSERT INTO menu_items (name, description, price, imageUrl, categoryId, barId, subCategoryId, `order`) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                [name, description, price, imageUrl, categoryId, barId, subCategoryId || null, order]
            );
            const itemId = result.insertId;
            if (toppings && toppings.length > 0) {
                for (const topping of toppings) {
                    const [toppingResult] = await pool.query('INSERT INTO toppings (name, price) VALUES (?, ?)', [topping.name, topping.price]);
                    const toppingId = toppingResult.insertId;
                    await pool.query('INSERT INTO item_toppings (item_id, topping_id) VALUES (?, ?)', [itemId, toppingId]);
                }
            }
            res.status(201).json({ id: itemId, ...req.body });
        } catch (error) {
            res.status(500).json({ error: 'Erro ao criar item.' });
        }
    });

    router.get('/items', async (req, res) => {
        try {
            const [items] = await pool.query(`
                SELECT 
                    mi.id, 
                    mi.name, 
                    mi.description, 
                    mi.price, 
                    mi.imageUrl, 
                    mi.categoryId, 
                    mi.barId, 
                    mi.subCategoryId,
                    mi.order, 
                    mc.name as category,
                    ms.name as subCategoryName
                FROM menu_items mi 
                JOIN menu_categories mc ON mi.categoryId = mc.id
                LEFT JOIN menu_subcategories ms ON mi.subCategoryId = ms.id
                ORDER BY mi.barId, mi.categoryId, mi.subCategoryId, mi.order
            `);
            const itemsWithToppings = await Promise.all(items.map(async (item) => {
                const [toppings] = await pool.query('SELECT t.id, t.name, t.price FROM toppings t JOIN item_toppings it ON t.id = it.topping_id WHERE it.item_id = ?', [item.id]);
                return { ...item, toppings };
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
            const [items] = await pool.query(`
                SELECT 
                    mi.id, 
                    mi.name, 
                    mi.description, 
                    mi.price, 
                    mi.imageUrl, 
                    mi.categoryId, 
                    mi.barId, 
                    mi.subCategoryId,
                    mi.order, 
                    mc.name as category,
                    ms.name as subCategoryName
                FROM menu_items mi 
                JOIN menu_categories mc ON mi.categoryId = mc.id
                LEFT JOIN menu_subcategories ms ON mi.subCategoryId = ms.id
                WHERE mi.id = ?
            `, [id]);
            if (items.length === 0) {
                return res.status(404).json({ error: 'Item não encontrado.' });
            }
            const item = items[0];
            const [toppings] = await pool.query('SELECT t.id, t.name, t.price FROM toppings t JOIN item_toppings it ON t.id = it.topping_id WHERE it.item_id = ?', [id]);
            item.toppings = toppings;
            res.json(item);
        } catch (error) {
            console.error('Erro ao buscar item:', error);
            res.status(500).json({ error: 'Erro ao buscar item.' });
        }
    });

    // Rota para atualizar um item
    router.put('/items/:id', async (req, res) => {
        const { id } = req.params;
        const { name, description, price, imageUrl, categoryId, barId, subCategoryId, order, toppings } = req.body;
        try {
            await pool.query(
                'UPDATE menu_items SET name = ?, description = ?, price = ?, imageUrl = ?, categoryId = ?, barId = ?, subCategoryId = ?, `order` = ? WHERE id = ?',
                [name, description, price, imageUrl, categoryId, barId, subCategoryId || null, order, id]
            );
            
            if (toppings && toppings.length > 0) {
                await pool.query('DELETE FROM item_toppings WHERE item_id = ?', [id]);
                
                for (const topping of toppings) {
                    const [toppingResult] = await pool.query('INSERT INTO toppings (name, price) VALUES (?, ?)', [topping.name, topping.price]);
                    const toppingId = toppingResult.insertId;
                    await pool.query('INSERT INTO item_toppings (item_id, topping_id) VALUES (?, ?)', [id, toppingId]);
                }
            }
            
            res.json({ message: 'Item atualizado com sucesso.' });
        } catch (error) {
            console.error('Erro ao atualizar item:', error);
            res.status(500).json({ error: 'Erro ao atualizar item.' });
        }
    });

    // Rota para deletar um item
    router.delete('/items/:id', async (req, res) => {
        const { id } = req.params;
        try {
            await pool.query('DELETE FROM item_toppings WHERE item_id = ?', [id]);
            await pool.query('DELETE FROM menu_items WHERE id = ?', [id]);
            res.json({ message: 'Item deletado com sucesso.' });
        } catch (error) {
            console.error('Erro ao deletar item:', error);
            res.status(500).json({ error: 'Erro ao deletar item.' });
        }
    });
    
    return router;
};