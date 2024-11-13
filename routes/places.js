// Importa o Express
const fs = require('fs');
const express = require('express');
const bcryptjs = require('bcryptjs');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require("multer");
const path = require("path");
const authenticateToken = require('../middleware/auth');
const router = express.Router();

const rootPath = path.resolve(__dirname, '..');
const upload = multer({
    storage: multer.diskStorage({
        destination: (req, file, cb) => cb(null, path.join(rootPath, 'uploads')),
        filename: (req, file, cb) => {
            const timestamp = Date.now();
            const ext = path.extname(file.originalname);
            const filename = `${timestamp}${ext}`; // Nomeia o arquivo como "timestamp.extensão"
            cb(null, filename);
        },
    }),
    limits: { fileSize: 20 * 1024 * 1024 },
});


const IMAGE_DIRECTORY = path.join(__dirname, 'uploads');

// Exporta uma função que aceita 'pool'
module.exports = (pool, upload) => {
    // Endpoint para criar um novo 'place' com logo e fotos
 // Endpoint para criar um novo 'place' com logo e fotos
router.post('/',upload.fields([{ name: 'logo', maxCount: 1 }, { name: 'photos', maxCount: 10 }]), // Configura 'logo' e 'photos'
    (req, res) => {
        console.log('Requisição recebida:', req.body);

        // Extrair dados do corpo da requisição
        const { 
            slug, name, email, description, street, number, latitude, longitude, status, visible, 
            commodities: commoditiesData // Recebe commodities como string JSON
        } = req.body;

        // Verificação de campos obrigatórios
        if (!slug || !name) {
            return res.status(400).json({ error: "Campos obrigatórios: slug e name" });
        }

        // Parse do JSON de commodities, caso exista
        const commodities = commoditiesData ? JSON.parse(commoditiesData) : [];

        // Obter apenas o nome do arquivo da logo
        const logo = req.files.logo ? req.files.logo[0].filename : null;

        // Preparar as fotos para inserir no banco de dados
        const photos = req.files.photos ? req.files.photos.map(file => ({
            photo: file.filename,
            type: 'photos',
            url: `${req.protocol}://${req.get('host')}/uploads/${file.filename}`
        })) : [];

        // Iniciar transação com o banco de dados
        pool.getConnection((err, connection) => {
            if (err) {
                console.error("Erro ao conectar ao banco de dados:", err);
                return res.status(500).json({ error: "Erro ao conectar com o banco de dados" });
            }

            connection.beginTransaction((transactionErr) => {
                if (transactionErr) {
                    connection.release();
                    console.error("Erro ao iniciar a transação:", transactionErr);
                    return res.status(500).json({ error: "Erro ao iniciar a transação" });
                }

                // Inserir dados do lugar ('place')
                const placeQuery = `
                    INSERT INTO places (slug, name, email, description, logo, street, number, latitude, longitude, status, visible)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `;
                const placeData = [
                    slug, name, email, description, logo, street, number, latitude, longitude, 
                    status || 'active', visible !== undefined ? visible : 1
                ];

                connection.query(placeQuery, placeData, (placeErr, placeResults) => {
                    if (placeErr) {
                        return connection.rollback(() => {
                            connection.release();
                            console.error("Erro ao inserir o place:", placeErr);
                            res.status(500).json({ error: "Erro ao salvar o place no banco de dados" });
                        });
                    }

                    const placeId = placeResults.insertId;

                    // Inserir commodities relacionadas
                    if (commodities.length > 0) {
                        const commoditiesQuery = `
                            INSERT INTO commodities (place_id, icon, color, name, description)
                            VALUES ?
                        `;
                        const commoditiesData = commodities.map(c => [placeId, c.icon, c.color, c.name, c.description]);

                        connection.query(commoditiesQuery, [commoditiesData], (commoditiesErr) => {
                            if (commoditiesErr) {
                                return connection.rollback(() => {
                                    connection.release();
                                    console.error("Erro ao inserir commodities:", commoditiesErr);
                                    res.status(500).json({ error: "Erro ao salvar commodities" });
                                });
                            }
                        });
                    }

                    // Inserir fotos relacionadas
                    if (photos.length > 0) {
                        const photosQuery = `
                            INSERT INTO photos (place_id, photo, type, url)
                            VALUES ?
                        `;
                        const photosData = photos.map(p => [placeId, p.photo, p.type, p.url]);

                        connection.query(photosQuery, [photosData], (photosErr) => {
                            if (photosErr) {
                                return connection.rollback(() => {
                                    connection.release();
                                    console.error("Erro ao inserir fotos:", photosErr);
                                    res.status(500).json({ error: "Erro ao salvar fotos" });
                                });
                            }
                        });
                    }

                    // Commit da transação se tudo ocorreu bem
                    connection.commit((commitErr) => {
                        connection.release();
                        if (commitErr) {
                            console.error("Erro ao confirmar a transação:", commitErr);
                            return res.status(500).json({ error: "Erro ao confirmar a transação" });
                        }
                        res.status(201).json({ message: "Place criado com sucesso", placeId });
                    });
                });
            });
        });
    }
);


    //Rota para atualizar os dados do Places
  // Rota para atualizar os dados do Places
router.put('/:id', upload.fields([{ name: 'logo', maxCount: 1 }, { name: 'photos', maxCount: 10 }]), 
async (req, res) => {
    const placeId = req.params.id; // Obter o ID do lugar a ser atualizado

    console.log('Requisição recebida:', req.body);

    // Extrair dados do corpo da requisição
    const { 
        slug, name, email, description, street, number, latitude, longitude, status, visible, 
        commodities: commoditiesData // Recebe commodities como string JSON
    } = req.body;

    // Verificação de campos obrigatórios
    if (!slug || !name) {
        return res.status(400).json({ error: "Campos obrigatórios: slug e name" });
    }

    // Parse do JSON de commodities, caso exista
    const commodities = commoditiesData ? JSON.parse(commoditiesData) : [];

    // Obter apenas o nome do arquivo da logo, se existir
    const logo = req.files.logo ? req.files.logo[0].filename : null;

    // Preparar as fotos para inserir no banco de dados
    const photos = req.files.photos ? req.files.photos.map(file => ({
        photo: file.filename,
        type: 'photos',
        url: `${req.protocol}://${req.get('host')}/uploads/${file.filename}`
    })) : [];

    // Iniciar transação com o banco de dados
    pool.getConnection(async (err, connection) => {
        if (err) {
            console.error("Erro ao conectar ao banco de dados:", err);
            return res.status(500).json({ error: "Erro ao conectar com o banco de dados" });
        }

        connection.beginTransaction((transactionErr) => {
            if (transactionErr) {
                connection.release();
                console.error("Erro ao iniciar a transação:", transactionErr);
                return res.status(500).json({ error: "Erro ao iniciar a transação" });
            }

            // Atualizar dados do lugar ('place')
            const placeQuery = `
                UPDATE places 
                SET slug = ?, name = ?, email = ?, description = ?, logo = ?, street = ?, number = ?, latitude = ?, longitude = ?, status = ?, visible = ?
                WHERE id = ?
            `;
            const placeData = [
                slug, name, email, description, logo, street, number, latitude, longitude, 
                status || 'active', visible !== undefined ? visible : 1, placeId
            ];

            connection.query(placeQuery, placeData, (placeErr, placeResults) => {
                if (placeErr) {
                    return connection.rollback(() => {
                        connection.release();
                        console.error("Erro ao atualizar o place:", placeErr);
                        res.status(500).json({ error: "Erro ao atualizar o place no banco de dados" });
                    });
                }

                // Atualizar commodities relacionadas
                const deleteCommoditiesQuery = `
                    DELETE FROM commodities WHERE place_id = ?
                `;
                connection.query(deleteCommoditiesQuery, [placeId], (deleteCommoditiesErr) => {
                    if (deleteCommoditiesErr) {
                        return connection.rollback(() => {
                            connection.release();
                            console.error("Erro ao excluir commodities existentes:", deleteCommoditiesErr);
                            res.status(500).json({ error: "Erro ao excluir commodities existentes" });
                        });
                    }

                    if (commodities.length > 0) {
                        const commoditiesQuery = `
                            INSERT INTO commodities (place_id, icon, color, name, description)
                            VALUES ?
                        `;
                        const commoditiesData = commodities.map(c => [placeId, c.icon, c.color, c.name, c.description]);

                        connection.query(commoditiesQuery, [commoditiesData], (commoditiesErr) => {
                            if (commoditiesErr) {
                                return connection.rollback(() => {
                                    connection.release();
                                    console.error("Erro ao inserir commodities:", commoditiesErr);
                                    res.status(500).json({ error: "Erro ao salvar commodities" });
                                });
                            }
                        });
                    }

                    // Atualizar fotos relacionadas, se necessário
                    if (photos.length > 0) {
                        const deletePhotosQuery = `
                            DELETE FROM photos WHERE place_id = ?
                        `;
                        connection.query(deletePhotosQuery, [placeId], (deletePhotosErr) => {
                            if (deletePhotosErr) {
                                return connection.rollback(() => {
                                    connection.release();
                                    console.error("Erro ao excluir fotos existentes:", deletePhotosErr);
                                    res.status(500).json({ error: "Erro ao excluir fotos existentes" });
                                });
                            }

                            const photosQuery = `
                                INSERT INTO photos (place_id, photo, type, url)
                                VALUES ?
                            `;
                            const photosData = photos.map(p => [placeId, p.photo, p.type, p.url]);

                            connection.query(photosQuery, [photosData], (photosErr) => {
                                if (photosErr) {
                                    return connection.rollback(() => {
                                        connection.release();
                                        console.error("Erro ao inserir fotos:", photosErr);
                                        res.status(500).json({ error: "Erro ao salvar fotos" });
                                    });
                                }
                            });
                        });
                    }

                    // Commit da transação se tudo ocorreu bem
                    connection.commit(async (commitErr) => {
                        if (commitErr) {
                            console.error("Erro ao confirmar a transação:", commitErr);
                            return res.status(500).json({ error: "Erro ao confirmar a transação" });
                        }

                        // Recuperar todos os dados atualizados para retornar
                        const [updatedPlace] = await pool.promise().query(`
                            SELECT 
                                p.id, p.slug, p.name, p.email, p.description, p.logo, p.street, p.number, 
                                p.latitude, p.longitude, p.status, p.visible 
                            FROM places p
                            WHERE p.id = ?
                        `, [placeId]);

                        const [updatedCommodities] = await pool.promise().query(`
                            SELECT 
                                place_id, id, icon, color, name, description 
                            FROM commodities 
                            WHERE place_id = ?
                        `, [placeId]);

                        const [updatedPhotos] = await pool.promise().query(`
                            SELECT 
                                place_id, id, photo, type, url 
                            FROM photos 
                            WHERE place_id = ?
                        `, [placeId]);

                        // Formatar os dados atualizados
                        const result = {
                            ...updatedPlace[0],
                            commodities: updatedCommodities,
                            photos: updatedPhotos
                        };

                        connection.release();
                        res.status(200).json({ message: "Place atualizado com sucesso", place: result });
                    });
                });
            });
        });
    });
}
);









    // Rota para listar todos os lugares
  router.get('/', async (req, res) => {
    try {
        // Recupera todos os lugares
        const [places] = await pool.promise().query(`
            SELECT 
                id, slug, name, email, description, logo, street, number, 
                latitude, longitude, status, visible 
            FROM places
        `);

        // Recupera commodities e fotos
        const [commodities] = await pool.promise().query(`
            SELECT 
                place_id, id, icon, color, name, description 
            FROM commodities
        `);

        const [photos] = await pool.promise().query(`
            SELECT 
                place_id, id, photo, type, url 
            FROM photos
        `);

        // Formata os lugares com suas commodities e fotos
        const formattedPlaces = places.map(place => {
            const placeCommodities = commodities.filter(c => c.place_id === place.id);
            const placePhotos = photos.filter(p => p.place_id === place.id);

            return {
                ...place,
                commodities: placeCommodities,
                photos: placePhotos
            };
        });

        res.json({ data: formattedPlaces });
    } catch (error) {
        console.error('Erro ao listar locais:', error);
        res.status(500).json({ error: 'Erro ao listar locais' });
    }
  });


// Endpoint para excluir um 'place' e seus dados relacionados (logo, commodities, fotos)
router.delete('/:id', (req, res) => {
    const { id } = req.params;

    pool.getConnection((err, connection) => {
        if (err) {
            console.error("Erro ao conectar ao banco de dados:", err);
            return res.status(500).json({ error: "Erro ao conectar com o banco de dados" });
        }

        connection.beginTransaction((transactionErr) => {
            if (transactionErr) {
                connection.release();
                console.error("Erro ao iniciar a transação:", transactionErr);
                return res.status(500).json({ error: "Erro ao iniciar a transação" });
            }

            // Excluir commodities relacionadas
            const deleteCommoditiesQuery = `
                DELETE FROM commodities WHERE place_id = ?
            `;
            connection.query(deleteCommoditiesQuery, [id], (commoditiesErr) => {
                if (commoditiesErr) {
                    return connection.rollback(() => {
                        connection.release();
                        console.error("Erro ao excluir commodities:", commoditiesErr);
                        res.status(500).json({ error: "Erro ao excluir commodities" });
                    });
                }

                // Excluir fotos relacionadas
                const deletePhotosQuery = `
                    DELETE FROM photos WHERE place_id = ?
                `;
                connection.query(deletePhotosQuery, [id], (photosErr) => {
                    if (photosErr) {
                        return connection.rollback(() => {
                            connection.release();
                            console.error("Erro ao excluir fotos:", photosErr);
                            res.status(500).json({ error: "Erro ao excluir fotos" });
                        });
                    }

                    // Excluir o place
                    const deletePlaceQuery = `
                        DELETE FROM places WHERE id = ?
                    `;
                    connection.query(deletePlaceQuery, [id], (placeErr) => {
                        if (placeErr) {
                            return connection.rollback(() => {
                                connection.release();
                                console.error("Erro ao excluir o place:", placeErr);
                                res.status(500).json({ error: "Erro ao excluir o place" });
                            });
                        }

                        // Commit da transação se tudo ocorreu bem
                        connection.commit((commitErr) => {
                            connection.release();
                            if (commitErr) {
                                console.error("Erro ao confirmar a transação:", commitErr);
                                return res.status(500).json({ error: "Erro ao confirmar a transação" });
                            }
                            res.status(200).json({ message: "Place excluído com sucesso" });
                        });
                    });
                });
            });
        });
    });
});

  

    return router;
};