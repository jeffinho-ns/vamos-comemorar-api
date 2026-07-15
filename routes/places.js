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
    async (req, res) => {
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
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // Inserir dados do lugar ('place')
            const placeQuery = `
                INSERT INTO places (slug, name, email, description, logo, street, number, latitude, longitude, status, visible)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id
            `;
            const placeData = [
                slug, name, email, description, logo, street, number, latitude, longitude, 
                status || 'active', visible !== undefined ? visible : 1
            ];

            const placeResult = await client.query(placeQuery, placeData);
            const placeId = placeResult.rows[0].id;

            // Inserir commodities relacionadas
            if (commodities.length > 0) {
                for (const c of commodities) {
                    await client.query(
                        'INSERT INTO commodities (place_id, icon, color, name, description) VALUES ($1, $2, $3, $4, $5)',
                        [placeId, c.icon, c.color, c.name, c.description]
                    );
                }
            }

            // Inserir fotos relacionadas
            if (photos.length > 0) {
                for (const p of photos) {
                    await client.query(
                        'INSERT INTO photos (place_id, photo, type, url) VALUES ($1, $2, $3, $4)',
                        [placeId, p.photo, p.type, p.url]
                    );
                }
            }

            // Commit da transação se tudo ocorreu bem
            await client.query('COMMIT');
            res.status(201).json({ message: "Place criado com sucesso", placeId });
        } catch (error) {
            await client.query('ROLLBACK');
            console.error("Erro ao processar place:", error);
            res.status(500).json({ error: "Erro ao salvar o place no banco de dados" });
        } finally {
            client.release();
        }
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
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Atualizar dados do lugar ('place')
        const placeQuery = `
            UPDATE places 
            SET slug = $1, name = $2, email = $3, description = $4, logo = COALESCE($5, logo), street = $6, number = $7, latitude = $8, longitude = $9, status = $10, visible = $11
            WHERE id = $12
        `;
        const placeData = [
            slug, name, email, description, logo, street, number, latitude, longitude, 
            status || 'active', visible !== undefined ? visible : 1, placeId
        ];

        await client.query(placeQuery, placeData);

        // Atualizar commodities relacionadas
        await client.query('DELETE FROM commodities WHERE place_id = $1', [placeId]);

        if (commodities.length > 0) {
            for (const c of commodities) {
                await client.query(
                    'INSERT INTO commodities (place_id, icon, color, name, description) VALUES ($1, $2, $3, $4, $5)',
                    [placeId, c.icon, c.color, c.name, c.description]
                );
            }
        }

        // Atualizar fotos relacionadas, se necessário
        if (photos.length > 0) {
            await client.query('DELETE FROM photos WHERE place_id = $1', [placeId]);
            for (const p of photos) {
                await client.query(
                    'INSERT INTO photos (place_id, photo, type, url) VALUES ($1, $2, $3, $4)',
                    [placeId, p.photo, p.type, p.url]
                );
            }
        }

        // Commit da transação se tudo ocorreu bem
        await client.query('COMMIT');

        // Recuperar todos os dados atualizados para retornar
        const updatedPlaceResult = await pool.query(`
            SELECT 
                p.id, p.slug, p.name, p.email, p.description, p.logo, p.street, p.number, 
                p.latitude, p.longitude, p.status, p.visible 
            FROM places p
            WHERE p.id = $1
        `, [placeId]);

        const updatedCommoditiesResult = await pool.query(`
            SELECT 
                place_id, id, icon, color, name, description 
            FROM commodities 
            WHERE place_id = $1
        `, [placeId]);

        const updatedPhotosResult = await pool.query(`
            SELECT 
                place_id, id, photo, type, url 
            FROM photos 
            WHERE place_id = $1
        `, [placeId]);

        // Formatar os dados atualizados
        const result = {
            ...updatedPlaceResult.rows[0],
            commodities: updatedCommoditiesResult.rows,
            photos: updatedPhotosResult.rows
        };

        res.status(200).json({ message: "Place atualizado com sucesso", place: result });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error("Erro ao atualizar place:", error);
        res.status(500).json({ error: "Erro ao atualizar o place no banco de dados" });
    } finally {
        client.release();
    }
}
);









    // Rota para listar todos os lugares
// Rota para listar todos os lugares
router.get('/', async (req, res) => {
    const client = await pool.connect();
    try {
      // Uma conexão, queries em série (client pg não suporta paralelo na mesma conexão).
      const {
        shouldReadFromEstablishments,
        listPlacesFromEstablishments,
      } = require('../services/establishmentLegacyAdapter');

      // Estabelecimentos arquivados no Super Admin não aparecem em nenhuma listagem.
      const placesResult = shouldReadFromEstablishments()
        ? { rows: await listPlacesFromEstablishments(client) }
        : await client.query(`
          SELECT 
            p.id, p.slug, p.name, p.email, p.description, p.logo, p.street, p.number, 
            p.latitude, p.longitude, p.status, p.visible 
          FROM places p
          WHERE NOT EXISTS (
            SELECT 1 FROM meu_backup_db.establishments e
             WHERE e.legacy_place_id = p.id AND e.status = 'archived'
          )
        `);
      const commoditiesResult = await client.query(`
          SELECT 
            place_id, id, icon, color, name, description 
          FROM commodities
        `);
      const photosResult = await client.query(`
          SELECT 
            place_id, id, photo, type, url 
          FROM photos
        `);

      const commoditiesByPlace = new Map();
      for (const row of commoditiesResult.rows) {
        const pid = Number(row.place_id);
        if (!commoditiesByPlace.has(pid)) commoditiesByPlace.set(pid, []);
        commoditiesByPlace.get(pid).push(row);
      }
      const photosByPlace = new Map();
      for (const row of photosResult.rows) {
        const pid = Number(row.place_id);
        if (!photosByPlace.has(pid)) photosByPlace.set(pid, []);
        photosByPlace.get(pid).push(row);
      }

      const formattedPlaces = placesResult.rows.map((place) => {
        const pid = Number(place.id);
        return {
          ...place,
          commodities: commoditiesByPlace.get(pid) || [],
          photos: photosByPlace.get(pid) || [],
        };
      });

      res.json({ data: formattedPlaces });
    } catch (error) {
      console.error('Erro ao listar locais:', error);
      res.status(500).json({ error: 'Erro ao listar locais' });
    } finally {
      client.release();
    }
  });

  
// Rota para buscar um lugar por ID
router.get('/:id', async (req, res) => {
    const client = await pool.connect();
    try {
      const { id } = req.params;
      const {
        shouldReadFromEstablishments,
        getPlaceFromEstablishments,
      } = require('../services/establishmentLegacyAdapter');

      const placeRow = shouldReadFromEstablishments()
        ? await getPlaceFromEstablishments(client, id)
        : (
            await client.query(`
        SELECT 
          id, slug, name, email, description, logo, street, number, 
          latitude, longitude, status, visible 
        FROM places
        WHERE id = $1
      `, [id])
          ).rows[0];

      if (!placeRow) {
        return res.status(404).json({ error: 'Lugar não encontrado' });
      }

      const placeResult = { rows: [placeRow] };

      const commoditiesResult = await client.query(`
        SELECT 
          place_id, id, icon, color, name, description 
        FROM commodities
        WHERE place_id = $1
      `, [id]);

      const photosResult = await client.query(`
        SELECT 
          place_id, id, photo, type, url 
        FROM photos
        WHERE place_id = $1
      `, [id]);

      res.json({
        place: placeResult.rows[0],
        commodities: commoditiesResult.rows,
        photos: photosResult.rows,
      });
    } catch (error) {
      console.error('Erro ao buscar lugar:', error);
      res.status(500).json({ error: 'Erro ao buscar lugar' });
    } finally {
      client.release();
    }
  });
  



// Endpoint para excluir um 'place' e seus dados relacionados (logo, commodities, fotos)
router.delete('/:id', async (req, res) => {
    const { id } = req.params;

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Excluir commodities relacionadas
        await client.query('DELETE FROM commodities WHERE place_id = $1', [id]);

        // Excluir fotos relacionadas
        await client.query('DELETE FROM photos WHERE place_id = $1', [id]);

        // Excluir o place
        await client.query('DELETE FROM places WHERE id = $1', [id]);

        // Commit da transação se tudo ocorreu bem
        await client.query('COMMIT');
        res.status(200).json({ message: "Place excluído com sucesso" });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error("Erro ao excluir place:", error);
        res.status(500).json({ error: "Erro ao excluir o place" });
    } finally {
        client.release();
    }
});

  

    return router;
};