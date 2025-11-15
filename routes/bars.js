const express = require('express');
const router = express.Router();

module.exports = (pool) => {
    // Rota para criar um novo estabelecimento
    router.post('/', async (req, res) => {
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
            const result = await pool.query(
                'INSERT INTO bars (name, slug, description, logoUrl, coverImageUrl, coverImages, address, rating, reviewsCount, latitude, longitude, amenities, popupImageUrl, facebook, instagram, whatsapp) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16) RETURNING id',
                [
                    name, slug, description, logoUrl, coverImageUrl, coverImagesValue, 
                    address, ratingValue, reviewsCountValue, latitudeValue, longitudeValue, 
                    JSON.stringify(amenities), popupImageUrl, 
                    // ✨ Adicionados os valores dos novos campos
                    facebook || null, instagram || null, whatsapp || null
                ]
            );
            
            const newBar = { id: result.rows[0].id, ...req.body };
            res.status(201).json(newBar);
        } catch (error) {
            console.error('Erro ao criar estabelecimento:', error);
            res.status(500).json({ error: 'Erro ao criar estabelecimento.' });
        }
    });

    // Rota para listar todos os estabelecimentos
    router.get('/', async (req, res) => {
        try {
            const result = await pool.query('SELECT * FROM bars');
            const barsFormatted = result.rows.map(bar => {
                const formatted = { ...bar };
                if (bar.amenities) {
                    try {
                        formatted.amenities = typeof bar.amenities === 'string' ? JSON.parse(bar.amenities) : bar.amenities;
                    } catch (e) {
                        formatted.amenities = [];
                    }
                } else {
                    formatted.amenities = [];
                }
                if (bar.coverImages) {
                    try {
                        formatted.coverImages = typeof bar.coverImages === 'string' ? JSON.parse(bar.coverImages) : bar.coverImages;
                    } catch (e) {
                        formatted.coverImages = [];
                    }
                } else {
                    formatted.coverImages = [];
                }
                return formatted;
            });
            res.json(barsFormatted);
        } catch (error) {
            console.error('Erro ao listar estabelecimentos:', error);
            res.status(500).json({ error: 'Erro ao listar estabelecimentos.' });
        }
    });

    // Rota para buscar um estabelecimento específico
    router.get('/:id', async (req, res) => {
        const { id } = req.params;
        try {
            const result = await pool.query('SELECT * FROM bars WHERE id = $1', [id]);
            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Estabelecimento não encontrado.' });
            }
            const bar = result.rows[0];
            if (bar.amenities) {
                try {
                    bar.amenities = typeof bar.amenities === 'string' ? JSON.parse(bar.amenities) : bar.amenities;
                } catch (e) {
                    bar.amenities = [];
                }
            } else {
                bar.amenities = [];
            }
            if (bar.coverImages) {
                try {
                    bar.coverImages = typeof bar.coverImages === 'string' ? JSON.parse(bar.coverImages) : bar.coverImages;
                } catch (e) {
                    bar.coverImages = [];
                }
            } else {
                bar.coverImages = [];
            }
            res.json(bar);
        } catch (error) {
            console.error('Erro ao buscar estabelecimento:', error);
            res.status(500).json({ error: 'Erro ao buscar estabelecimento.' });
        }
    });

    // Rota para atualizar um estabelecimento
    router.put('/:id', async (req, res) => {
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
                'UPDATE bars SET name = $1, slug = $2, description = $3, logoUrl = $4, coverImageUrl = $5, coverImages = $6, address = $7, rating = $8, reviewsCount = $9, latitude = $10, longitude = $11, amenities = $12, popupImageUrl = $13, facebook = $14, instagram = $15, whatsapp = $16 WHERE id = $17',
                [
                    name, slug, description, logoUrl, coverImageUrl, coverImagesValue, 
                    address, ratingValue, reviewsCountValue, latitudeValue, longitudeValue, 
                    JSON.stringify(amenities), popupImageUrl, 
                    // ✨ Adicionados os valores dos novos campos
                    facebook || null, instagram || null, whatsapp || null, id
                ]
            );
            
            res.json({ message: 'Estabelecimento atualizado com sucesso.' });
        } catch (error) {
            console.error('Erro ao atualizar estabelecimento:', error);
            res.status(500).json({ error: 'Erro ao atualizar estabelecimento.' });
        }
    });

    // Rota para excluir um estabelecimento
    router.delete('/:id', async (req, res) => {
        const { id } = req.params;
        try {
            await pool.query('DELETE FROM bars WHERE id = $1', [id]);
            res.json({ message: 'Estabelecimento excluído com sucesso.' });
        } catch (error) {
            console.error('Erro ao excluir estabelecimento:', error);
            res.status(500).json({ error: 'Erro ao excluir estabelecimento.' });
        }
    });

    return router;
};
