// Importa o Express
const express = require('express');
const router = express.Router();

// Exporta uma função que aceita 'pool' e 'upload'
module.exports = (pool, upload) => {
  // Endpoint para criar um novo 'place'
  router.post('/', upload.single('file'), (req, res) => {
    console.log('Requisição recebida:', req.body);
    const { 
      slug, name, email, description, street, number, latitude, longitude, status, visible, 
      commodities, photos 
    } = req.body;

    // Verificação de campos obrigatórios
    if (!slug || !name) {
      return res.status(400).json({ error: "Campos obrigatórios: slug e name" });
    }

    // Obter apenas o nome do arquivo da logo
    const logo = req.file ? req.file.filename : null;

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
          if (commodities && commodities.length > 0) {
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
          if (photos && photos.length > 0) {
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
  });

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

  // Endpoint para atualizar um lugar
// Endpoint para atualizar um lugar
router.put("/places/:id", upload.fields([{ name: "logo" }, { name: "photos" }]), (req, res) => {
    const placeId = req.params.id;
    const { name, email, phone, address, number, neighborhood, city, state, zipcode, description, latitude, longitude, slug, status, commodities } = req.body;

    // Verifique se o lugar existe (você deve ter uma função ou variável para isso)
    const placeIndex = places.findIndex((place) => place.id === placeId);

    if (placeIndex === -1) {
        return res.status(404).json({ message: "Place not found" });
    }

    // Atualize os dados do lugar
    const updatedPlace = {
        ...places[placeIndex],
        name,
        email,
        phone,
        address,
        number,
        neighborhood,
        city,
        state,
        zipcode,
        description,
        latitude,
        longitude,
        slug,
        status,
        commodities,
        logo: req.files.logo && req.files.logo[0] ? req.files.logo[0].filename : places[placeIndex].logo, // Salva apenas o nome do arquivo da logo
        photos: req.files.photos ? req.files.photos.map(file => file.filename) : places[placeIndex].photos // Salva apenas os nomes dos arquivos das fotos
    };

    // Atualiza o lugar na "base de dados"
    places[placeIndex] = updatedPlace;

    // Atualiza o banco de dados (exemplo, ajuste conforme a sua lógica)
    const updateQuery = `
        UPDATE places 
        SET name = ?, email = ?, phone = ?, address = ?, number = ?, neighborhood = ?, city = ?, 
            state = ?, zipcode = ?, description = ?, latitude = ?, longitude = ?, slug = ?, 
            status = ?, visible = ?, logo = ? 
        WHERE id = ?
    `;
    
    const updateValues = [
        updatedPlace.name, updatedPlace.email, updatedPlace.phone, updatedPlace.address, 
        updatedPlace.number, updatedPlace.neighborhood, updatedPlace.city, updatedPlace.state, 
        updatedPlace.zipcode, updatedPlace.description, updatedPlace.latitude, updatedPlace.longitude, 
        updatedPlace.slug, updatedPlace.status, updatedPlace.logo, placeId
    ];

    pool.query(updateQuery, updateValues, (err, result) => {
        if (err) {
            return res.status(500).json({ error: "Erro ao atualizar o lugar" });
        }
        return res.status(200).json(updatedPlace);
    });
});



  return router;
};
