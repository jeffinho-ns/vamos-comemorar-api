const express = require('express');
const router = express.Router();

module.exports = (pool) => {
    // Rota para criar um novo estabelecimento
    router.post('/', async (req, res) => {
        const { 
            name, slug, description, logoUrl, coverImageUrl, coverImages, address, rating, 
            reviewsCount, latitude, longitude, amenities, popupImageUrl,
            facebook, instagram, whatsapp,
            menu_category_bg_color, menu_category_text_color,
            menu_subcategory_bg_color, menu_subcategory_text_color,
            mobile_sidebar_bg_color, mobile_sidebar_text_color,
            custom_seals,
            menu_display_style
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

            const menuDisplayStyleValue = menu_display_style === 'clean' ? 'clean' : 'normal';

            const [result] = await pool.query(
                'INSERT INTO bars (name, slug, description, logoUrl, coverImageUrl, coverImages, address, rating, reviewsCount, latitude, longitude, amenities, popupImageUrl, facebook, instagram, whatsapp, menu_category_bg_color, menu_category_text_color, menu_subcategory_bg_color, menu_subcategory_text_color, mobile_sidebar_bg_color, mobile_sidebar_text_color, custom_seals, menu_display_style) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [
                    name, slug, description, logoUrl, coverImageUrl, coverImagesValue, 
                    address, ratingValue, reviewsCountValue, latitudeValue, longitudeValue, 
                    JSON.stringify(amenities), popupImageUrl,
                    facebook || null, instagram || null, whatsapp || null,
                    menu_category_bg_color || null, menu_category_text_color || null,
                    menu_subcategory_bg_color || null, menu_subcategory_text_color || null,
                    mobile_sidebar_bg_color || null, mobile_sidebar_text_color || null,
                    customSealsValue,
                    menuDisplayStyleValue
                ]
            );
            
            const newBar = {
                id: result.insertId,
                ...req.body,
                amenities,
                coverImages,
                custom_seals: custom_seals || [],
                menu_display_style: menuDisplayStyleValue
            };
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
                if (bar.custom_seals) {
                    try {
                        formatted.custom_seals = typeof bar.custom_seals === 'string' ? JSON.parse(bar.custom_seals) : bar.custom_seals;
                    } catch (e) {
                        formatted.custom_seals = [];
                    }
                } else {
                    formatted.custom_seals = [];
                }

                formatted.menu_display_style = bar.menu_display_style || 'normal';
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
            if (bar.custom_seals) {
                try {
                    bar.custom_seals = typeof bar.custom_seals === 'string' ? JSON.parse(bar.custom_seals) : bar.custom_seals;
                } catch (e) {
                    bar.custom_seals = [];
                }
            } else {
                bar.custom_seals = [];
            }

            bar.menu_display_style = bar.menu_display_style || 'normal';
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
            facebook, instagram, whatsapp,
            menu_category_bg_color, menu_category_text_color,
            menu_subcategory_bg_color, menu_subcategory_text_color,
            mobile_sidebar_bg_color, mobile_sidebar_text_color,
            custom_seals,
            menu_display_style
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

            const menuDisplayStyleValue = menu_display_style === 'clean' ? 'clean' : 'normal';

            await pool.query(
                'UPDATE bars SET name = ?, slug = ?, description = ?, logoUrl = ?, coverImageUrl = ?, coverImages = ?, address = ?, rating = ?, reviewsCount = ?, latitude = ?, longitude = ?, amenities = ?, popupImageUrl = ?, facebook = ?, instagram = ?, whatsapp = ?, menu_category_bg_color = ?, menu_category_text_color = ?, menu_subcategory_bg_color = ?, menu_subcategory_text_color = ?, mobile_sidebar_bg_color = ?, mobile_sidebar_text_color = ?, custom_seals = ?, menu_display_style = ? WHERE id = ?',
                [
                    name, slug, description, logoUrl, coverImageUrl, coverImagesValue, 
                    address, ratingValue, reviewsCountValue, latitudeValue, longitudeValue, 
                    JSON.stringify(amenities), popupImageUrl,
                    facebook || null, instagram || null, whatsapp || null,
                    menu_category_bg_color || null, menu_category_text_color || null,
                    menu_subcategory_bg_color || null, menu_subcategory_text_color || null,
                    mobile_sidebar_bg_color || null, mobile_sidebar_text_color || null,
                    customSealsValue,
                    menuDisplayStyleValue,
                    id
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
