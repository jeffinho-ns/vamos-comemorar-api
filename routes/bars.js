const express = require('express');
const router = express.Router();

module.exports = (pool) => {
    // Rota para criar um novo estabelecimento
    router.post('/', async (req, res) => {
        const { 
            name, slug, description, logoUrl, coverImageUrl, coverImages, address, rating, 
            reviewsCount, latitude, longitude, amenities, popupImageUrl,
            // ✨ Adicionados os novos campos
            facebook, instagram, whatsapp,
            partner_logos
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

            let partnerLogosValue = '[]';
            if (partner_logos) {
                if (Array.isArray(partner_logos)) {
                    partnerLogosValue = JSON.stringify(partner_logos.slice(0, 5));
                } else if (typeof partner_logos === 'string') {
                    partnerLogosValue = partner_logos;
                }
            }
            
            // ✨ Query de INSERT atualizada para incluir as novas colunas
            const result = await pool.query(
                'INSERT INTO bars (name, slug, description, logoUrl, coverImageUrl, coverImages, address, rating, reviewsCount, latitude, longitude, amenities, popupImageUrl, facebook, instagram, whatsapp, partner_logos) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17) RETURNING id',
                [
                    name, slug, description, logoUrl, coverImageUrl, coverImagesValue, 
                    address, ratingValue, reviewsCountValue, latitudeValue, longitudeValue, 
                    JSON.stringify(amenities), popupImageUrl, 
                    // ✨ Adicionados os valores dos novos campos
                    facebook || null, instagram || null, whatsapp || null,
                    partnerLogosValue
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

        const partnerLogosRaw = bar.partner_logos;
        if (partnerLogosRaw !== undefined && partnerLogosRaw !== null && partnerLogosRaw !== '') {
            try {
                normalized.partner_logos =
                    typeof partnerLogosRaw === 'string'
                        ? JSON.parse(partnerLogosRaw)
                        : partnerLogosRaw;
                if (!Array.isArray(normalized.partner_logos)) {
                    normalized.partner_logos = [];
                }
            } catch (e) {
                normalized.partner_logos = [];
            }
        } else {
            normalized.partner_logos = [];
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
    router.get('/', async (req, res) => {
        try {
            const {
                shouldReadFromEstablishments,
                listBarsFromEstablishments,
            } = require('../services/establishmentLegacyAdapter');

            // Estabelecimentos arquivados no Super Admin não aparecem em nenhuma listagem.
            // enabled_modules: NULL = sem configuração (tudo liberado); array = só o que está habilitado.
            const result = shouldReadFromEstablishments()
                ? { rows: await listBarsFromEstablishments(pool) }
                : await pool.query(`
                    SELECT b.*,
                      (
                        SELECT CASE WHEN COUNT(*) = 0 THEN NULL
                                    ELSE COALESCE(json_agg(m.key) FILTER (WHERE em.is_enabled = TRUE), '[]'::json) END
                          FROM meu_backup_db.establishments e
                          JOIN meu_backup_db.establishment_modules em ON em.establishment_id = e.id
                          JOIN meu_backup_db.modules m ON m.id = em.module_id AND m.is_active = TRUE
                         WHERE e.legacy_bar_id = b.id
                      ) AS enabled_modules
                    FROM bars b
                    WHERE NOT EXISTS (
                      SELECT 1 FROM meu_backup_db.establishments e
                       WHERE e.legacy_bar_id = b.id AND e.status = 'archived'
                    )
                `);
            const barsFormatted = result.rows.map(bar => normalizeBarFields(bar));
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
            const {
                shouldReadFromEstablishments,
                getBarFromEstablishments,
            } = require('../services/establishmentLegacyAdapter');

            const barRow = shouldReadFromEstablishments()
                ? await getBarFromEstablishments(pool, id)
                : (
                    await pool.query('SELECT * FROM bars WHERE id = $1', [id])
                  ).rows[0];

            if (!barRow) {
                return res.status(404).json({ error: 'Estabelecimento não encontrado.' });
            }
            const bar = normalizeBarFields(barRow);
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
            facebook, instagram, whatsapp,
            partner_logos
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

            let partnerLogosValue = '[]';
            if (partner_logos) {
                if (Array.isArray(partner_logos)) {
                    partnerLogosValue = JSON.stringify(partner_logos.slice(0, 5));
                } else if (typeof partner_logos === 'string') {
                    partnerLogosValue = partner_logos;
                }
            }

            // ✨ Query de UPDATE atualizada para incluir as novas colunas
            await pool.query(
                'UPDATE bars SET name = $1, slug = $2, description = $3, logoUrl = $4, coverImageUrl = $5, coverImages = $6, address = $7, rating = $8, reviewsCount = $9, latitude = $10, longitude = $11, amenities = $12, popupImageUrl = $13, facebook = $14, instagram = $15, whatsapp = $16, partner_logos = $17 WHERE id = $18',
                [
                    name, slug, description, logoUrl, coverImageUrl, coverImagesValue, 
                    address, ratingValue, reviewsCountValue, latitudeValue, longitudeValue, 
                    JSON.stringify(amenities), popupImageUrl, 
                    // ✨ Adicionados os valores dos novos campos
                    facebook || null, instagram || null, whatsapp || null,
                    partnerLogosValue,
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
            await pool.query('DELETE FROM bars WHERE id = $1', [id]);
            res.json({ message: 'Estabelecimento excluído com sucesso.' });
        } catch (error) {
            console.error('Erro ao excluir estabelecimento:', error);
            res.status(500).json({ error: 'Erro ao excluir estabelecimento.' });
        }
    });

    return router;
};
