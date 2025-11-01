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
    router.get('/', async (req, res) => {
        try {
            const [bars] = await pool.query('SELECT * FROM bars');
            const barsFormatted = bars.map(bar => {
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
            const [bars] = await pool.query('SELECT * FROM bars WHERE id = ?', [id]);
            if (bars.length === 0) {
                return res.status(404).json({ error: 'Estabelecimento não encontrado.' });
            }
            const bar = bars[0];
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
                'UPDATE bars SET name = ?, slug = ?, description = ?, logoUrl = ?, coverImageUrl = ?, coverImages = ?, address = ?, rating = ?, reviewsCount = ?, latitude = ?, longitude = ?, amenities = ?, popupImageUrl = ?, facebook = ?, instagram = ?, whatsapp = ? WHERE id = ?',
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
            await pool.query('DELETE FROM bars WHERE id = ?', [id]);
            res.json({ message: 'Estabelecimento excluído com sucesso.' });
        } catch (error) {
            console.error('Erro ao excluir estabelecimento:', error);
            res.status(500).json({ error: 'Erro ao excluir estabelecimento.' });
        }
    });

    return router;
};
