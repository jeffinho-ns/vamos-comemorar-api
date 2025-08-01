// routes/events.js

const fs = require('fs');
const express = require('express');
const multer = require('multer');
const path = require('path');

const auth = require('../middleware/auth');
const rootPath = path.resolve(__dirname, '..');
const uploadDir = path.join(rootPath, 'uploads/events');

if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}
 
const upload = multer({
    storage: multer.diskStorage({
        destination: (req, file, cb) => cb(null, uploadDir),
        filename: (req, file, cb) => {
            const timestamp = Date.now();
            const ext = path.extname(file.originalname);
            const filename = `${timestamp}${ext}`;
            cb(null, filename);
        },
    }),
    limits: { fileSize: 20 * 1024 * 1024 },
});

// Helper function to calculate distance between two lat/lon points in km
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Radius of Earth in kilometers
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c; // Distance in km
    return distance;
}

// Recebe checkAndAwardBrindes como argumento
module.exports = (pool, checkAndAwardBrindes) => {
    const router = express.Router();

    const addFullImageUrls = (event) => {
        const baseUrl = process.env.API_BASE_URL || 'https://vamos-comemorar-api.onrender.com';
        if (!event) return null;
        return {
            ...event,
            imagem_do_evento_url: event.imagem_do_evento
                ? `${baseUrl}/uploads/events/${event.imagem_do_evento}`
                : null,
            imagem_do_combo_url: event.imagem_do_combo
                ? `${baseUrl}/uploads/events/${event.imagem_do_combo}`
                : null,
        };
    };

    // ROTA TEMPORÁRIA SEM AUTENTICAÇÃO PARA TESTE
    router.get('/public', async (req, res) => {
        try {
            const [events] = await pool.query(`
                SELECT *
                FROM eventos
                ORDER BY data_do_evento DESC, hora_do_evento ASC
            `);

            // Adiciona URLs completas das imagens
            const eventsWithUrls = events.map(addFullImageUrls);

            res.status(200).json(eventsWithUrls);
        } catch (error) {
            console.error('Erro ao buscar eventos públicos:', error);
            res.status(500).json({ message: 'Erro ao buscar eventos.' });
        }
    });

    // NOVO ENDPOINT: Buscar eventos onde o usuário é promoter
    router.get('/promoter', auth, async (req, res) => {
        console.log('--- BUSCANDO EVENTOS DO PROMOTER ---');
        try {
            const userId = req.user.id;
            
            // Busca eventos onde o usuário é promoter
            // Por enquanto, vamos considerar que um usuário é promoter se criou reservas para o evento
            // ou se tem uma relação específica com o evento
            const [events] = await pool.query(`
                SELECT DISTINCT e.*
                FROM eventos e
                LEFT JOIN reservas r ON e.id = r.evento_id
                LEFT JOIN users u ON r.user_id = u.id
                WHERE r.user_id = ? OR e.criado_por = ?
                ORDER BY e.data_do_evento DESC, e.hora_do_evento ASC
            `, [userId, userId]);

            // Adiciona URLs completas das imagens
            const eventsWithUrls = events.map(addFullImageUrls);

            console.log(`Encontrados ${eventsWithUrls.length} eventos para o promoter ${userId}`);
            res.status(200).json(eventsWithUrls);

        } catch (error) {
            console.error('Erro ao buscar eventos do promoter:', error);
            res.status(500).json({ message: 'Erro ao buscar eventos do promoter.' });
        }
    });

    // NOVO ENDPOINT: Verificar se o usuário é promoter de um evento específico
    router.get('/:id/promoter-check', auth, async (req, res) => {
        console.log('--- VERIFICANDO SE USUÁRIO É PROMOTER DO EVENTO ---');
        try {
            const userId = req.user.id;
            const eventId = req.params.id;

            // Verifica se o usuário é promoter do evento
            const [rows] = await pool.query(`
                SELECT COUNT(*) as count
                FROM (
                    SELECT DISTINCT e.id
                    FROM eventos e
                    LEFT JOIN reservas r ON e.id = r.evento_id
                    LEFT JOIN users u ON r.user_id = u.id
                    WHERE (r.user_id = ? OR e.criado_por = ?) AND e.id = ?
                ) as promoter_events
            `, [userId, userId, eventId]);

            const isPromoter = rows[0].count > 0;

            console.log(`Usuário ${userId} é promoter do evento ${eventId}: ${isPromoter}`);
            res.status(200).json({ isPromoter });

        } catch (error) {
            console.error('Erro ao verificar se usuário é promoter:', error);
            res.status(500).json({ message: 'Erro ao verificar permissões de promoter.' });
        }
    });

    router.post('/', auth, upload.fields([
        { name: 'imagem_do_evento', maxCount: 1 },
        { name: 'imagem_do_combo', maxCount: 1 }
    ]), async (req, res) => {
        console.log('--- INICIANDO ROTA DE CRIAÇÃO DE EVENTO ---');
        try {
            const imagemDoEventoFile = req.files?.['imagem_do_evento']?.[0];
            const imagemDoComboFile = req.files?.['imagem_do_combo']?.[0];

            const imagemDoEvento = imagemDoEventoFile ? imagemDoEventoFile.filename : null;
            const imagemDoCombo = imagemDoComboFile ? imagemDoComboFile.filename : null;
            
            const {
                casa_do_evento, nome_do_evento, data_do_evento, hora_do_evento,
                local_do_evento, categoria, mesas, valor_da_mesa, brinde,
                numero_de_convidados, descricao, valor_da_entrada, observacao,
                tipo_evento, dia_da_semana, id_place // Adicionado id_place aqui
            } = req.body;

            if (!nome_do_evento || !casa_do_evento) {
                return res.status(400).json({ message: 'Nome do evento e casa do evento são obrigatórios.' });
            }
            
            const insertQuery = `
                INSERT INTO eventos (
                    casa_do_evento, nome_do_evento, data_do_evento, hora_do_evento,
                    local_do_evento, categoria, mesas, valor_da_mesa, brinde,
                    numero_de_convidados, descricao, valor_da_entrada,
                    imagem_do_evento, imagem_do_combo, observacao,
                    tipo_evento, dia_da_semana, id_place, criado_por
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;
            const insertParams = [
                casa_do_evento, nome_do_evento,
                tipo_evento === 'unico' ? data_do_evento : null,
                hora_do_evento, local_do_evento, categoria, mesas, valor_da_mesa, brinde,
                numero_de_convidados, descricao, valor_da_entrada,
                imagemDoEvento, imagemDoCombo, observacao,
                tipo_evento, tipo_evento === 'semanal' ? dia_da_semana : null,
                id_place, req.user.id // Adiciona o ID do usuário que criou o evento
            ];

            const [result] = await pool.query(insertQuery, insertParams);

            const [rows] = await pool.query('SELECT * FROM eventos WHERE id = ?', [result.insertId]);
            const newEventWithUrls = addFullImageUrls(rows[0]);

            res.status(201).json(newEventWithUrls);

        } catch (error) {
            console.error('!!! ERRO DETALHADO AO CRIAR EVENTO (POST /) !!!:', error);
            res.status(500).json({ message: 'Erro ao criar evento.', error: error.message, stack: error.stack });
        }
    });
    
    // ---- ROTA GET (LISTA DE EVENTOS) ----
    router.get('/', auth, async (req, res) => {
        try {
            const { tipo } = req.query;
            let query = `
                SELECT
                    id, casa_do_evento, nome_do_evento, data_do_evento, hora_do_evento,
                    local_do_evento, criado_em, categoria, mesas, valor_da_mesa, brinde,
                    numero_de_convidados, descricao, valor_da_entrada,
                    imagem_do_evento, imagem_do_combo, observacao,
                    tipo_evento AS tipoEvento, dia_da_semana, id_place
                FROM eventos
            `;
            let queryParams = [];

            if (tipo) {
                query += ` WHERE tipo_evento = ?`;
                queryParams.push(tipo);
            }

            query += ` ORDER BY data_do_evento DESC, hora_do_evento DESC`;

            const [events] = await pool.query(query, queryParams);
            
            const eventsWithUrls = events.map(addFullImageUrls);

            res.status(200).json(eventsWithUrls);
        } catch (error) {
            console.error("Erro ao buscar eventos:", error);
            res.status(500).json({ message: "Erro ao buscar eventos" });
        }
    });

    // ---- ROTA GET (ID ÚNICO) ----
    router.get('/:id', auth, async (req, res) => {
        const eventId = req.params.id;
        try {
            const [rows] = await pool.query(`SELECT * FROM eventos WHERE id = ?`, [eventId]);
            if (rows.length === 0) {
                return res.status(404).json({ message: 'Evento não encontrado' });
            }

            const eventWithUrls = addFullImageUrls(rows[0]);

            res.status(200).json(eventWithUrls);
        } catch (error) {
            console.error('Erro ao buscar evento por ID (GET /:id):', error);
            res.status(500).json({ error: 'Erro ao buscar evento.', message: error.message, stack: error.stack });
        }
    });

    // ---- ROTA PUT (EDITAR) ----
    router.put('/:id', auth, upload.fields([
        { name: 'imagem_do_evento', maxCount: 1 },
        { name: 'imagem_do_combo', maxCount: 1 }
    ]), async (req, res) => {
        const eventId = req.params.id;
        try {
            const [eventosAtuais] = await pool.query(`SELECT imagem_do_evento, imagem_do_combo FROM eventos WHERE id = ?`, [eventId]);
            if (eventosAtuais.length === 0) {
                return res.status(404).json({ message: 'Evento não encontrado.' });
            }
            const eventoAntigo = eventosAtuais[0];
            let imagemDoEventoFinal = eventoAntigo.imagem_do_evento;
            let imagemDoComboFinal = eventoAntigo.imagem_do_combo;

            const imagemDoEventoFile = req.files?.['imagem_do_evento']?.[0];
            const imagemDoComboFile = req.files?.['imagem_do_combo']?.[0];

            if (imagemDoEventoFile) {
                imagemDoEventoFinal = imagemDoEventoFile.filename;
                if (eventoAntigo.imagem_do_evento && fs.existsSync(path.join(uploadDir, eventoAntigo.imagem_do_evento))) {
                    fs.unlinkSync(path.join(uploadDir, eventoAntigo.imagem_do_evento));
                }
            }
            if (imagemDoComboFile) {
                imagemDoComboFinal = imagemDoComboFile.filename;
                if (eventoAntigo.imagem_do_combo && fs.existsSync(path.join(uploadDir, eventoAntigo.imagem_do_combo))) {
                    fs.unlinkSync(path.join(uploadDir, eventoAntigo.imagem_do_combo));
                }
            }

            const {
                casa_do_evento, nome_do_evento, data_do_evento, hora_do_evento,
                local_do_evento, categoria, mesas, valor_da_mesa, brinde,
                numero_de_convidados, descricao, valor_da_entrada, observacao,
                tipo_evento, dia_da_semana, id_place
            } = req.body;

            const updateQuery = `
                UPDATE eventos SET
                    casa_do_evento = ?, nome_do_evento = ?, data_do_evento = ?, hora_do_evento = ?,
                    local_do_evento = ?, categoria = ?, mesas = ?, valor_da_mesa = ?, brinde = ?,
                    numero_de_convidados = ?, descricao = ?, valor_da_entrada = ?,
                    imagem_do_evento = ?, imagem_do_combo = ?, observacao = ?,
                    tipo_evento = ?, dia_da_semana = ?, id_place = ?
                WHERE id = ?
            `;
            const updateParams = [
                casa_do_evento, nome_do_evento,
                tipo_evento === 'unico' ? data_do_evento : null,
                hora_do_evento, local_do_evento, categoria, mesas, valor_da_mesa, brinde,
                numero_de_convidados, descricao, valor_da_entrada,
                imagemDoEventoFinal, imagemDoComboFinal, observacao,
                tipo_evento, tipo_evento === 'semanal' ? dia_da_semana : null,
                id_place,
                eventId
            ];

            const [result] = await pool.query(updateQuery, updateParams);
            if (result.affectedRows === 0) {
                return res.status(404).json({ message: 'Evento não encontrado para atualização.' });
            }

            const [rows] = await pool.query('SELECT * FROM eventos WHERE id = ?', [eventId]);
            const updatedEventWithUrls = addFullImageUrls(rows[0]);

            res.status(200).json({ message: 'Evento atualizado com sucesso!', event: updatedEventWithUrls });

        } catch (error) {
            console.error('Erro ao atualizar evento (PUT /:id):', error);
            res.status(500).json({ message: 'Erro ao atualizar evento.', error: error.message, stack: error.stack });
        }
    });

    // ---- ROTA DELETE ----
    router.delete('/:id', auth, async (req, res) => {
        const eventId = req.params.id;
        try {
            if (req.user.role !== 'admin' && req.user.role !== 'gerente') {
                return res.status(403).json({ message: 'Acesso negado. Somente administradores ou gerentes podem excluir eventos.' });
            }
            
            const [eventosAtuais] = await pool.query(`SELECT imagem_do_evento, imagem_do_combo FROM eventos WHERE id = ?`, [eventId]);
            if (eventosAtuais.length > 0) {
                const evento = eventosAtuais[0];
                if (evento.imagem_do_evento && fs.existsSync(path.join(uploadDir, evento.imagem_do_evento))) {
                    fs.unlinkSync(path.join(uploadDir, evento.imagem_do_evento));
                }
                if (evento.imagem_do_combo && fs.existsSync(path.join(uploadDir, evento.imagem_do_combo))) {
                    fs.unlinkSync(path.join(uploadDir, evento.imagem_do_combo));
                }
            }
            
            const [result] = await pool.query(`DELETE FROM eventos WHERE id = ?`, [eventId]);
            if (result.affectedRows === 0) {
                return res.status(404).json({ message: 'Evento não encontrado para exclusão.' });
            }
            res.status(200).json({ message: 'Evento excluído com sucesso' });
        } catch (error) {
            console.error('Erro ao excluir evento (DELETE /:id):', error);
            res.status(500).json({ error: 'Erro ao excluir evento.', message: error.message, stack: error.stack });
        }
    });

    /**
     * @route   GET /api/events/:id/reservas
     * @desc    Busca todas as reservas associadas a um evento específico
     * @access  Private (Admin, Manager, Promoter do evento/reserva)
     */
    router.get('/:id/reservas', auth, async (req, res) => {
        const eventId = req.params.id;
        const userId = req.user?.id;
        const userRole = req.user?.role;

        try {
            let hasPermissionToView = false;
            if (userRole === 'admin' || userRole === 'gerente') {
                hasPermissionToView = true;
            } else {
                const [[reservaCheck]] = await pool.query('SELECT 1 FROM reservas WHERE evento_id = ? AND user_id = ? LIMIT 1', [eventId, userId]);
                if (reservaCheck) {
                    hasPermissionToView = true;
                }
            }

            if (!hasPermissionToView) {
                return res.status(403).json({ message: 'Acesso negado. Você não tem permissão para ver as reservas deste evento.' });
            }

            const [eventRows] = await pool.query('SELECT id, nome_do_evento FROM eventos WHERE id = ?', [eventId]);
            if (eventRows.length === 0) {
                return res.status(404).json({ message: 'Evento não encontrado' });
            }

            const sql = `
                SELECT 
                    r.id,
                    r.nome_lista,
                    r.tipo_reserva,
                    r.status,
                    u.name as nome_do_criador,
                    r.quantidade_convidados,
                    (SELECT COUNT(c.id) FROM convidados c WHERE c.reserva_id = r.id AND (c.status = 'CHECK-IN' OR c.geo_checkin_status = 'CONFIRMADO_LOCAL')) as confirmedGuestsCount,
                    (SELECT br.status FROM brindes_regras br WHERE br.reserva_id = r.id LIMIT 1) AS brindeStatus
                FROM 
                    reservas r
                JOIN 
                    users u ON r.user_id = u.id
                WHERE 
                    r.evento_id = ?
                ORDER BY 
                    r.id DESC;
            `;

            const [reservas] = await pool.query(sql, [eventId]);

            res.status(200).json({
                evento: eventRows[0],
                reservas_associadas: reservas
            });

        } catch (error) {
            console.error(`Erro ao buscar reservas para o evento ${eventId}:`, error);
            res.status(500).json({ error: 'Erro ao buscar as reservas do evento.', message: error.message, stack: error.stack });
        }
    });

    /**
     * @route   GET /api/events/:id/guests
     * @desc    Busca TODOS os convidados de TODAS as reservas de um evento específico.
     * @access  Private (Admin, Promoter, etc)
     */
    router.get('/:id/guests', auth, async (req, res) => {
        const { id: eventId } = req.params;
        const userId = req.user?.id;
        const userRole = req.user?.role;

        try {
            let hasPermissionToView = false;
            if (userRole === 'admin' || userRole === 'gerente') {
                hasPermissionToView = true;
            } else {
                const [[reservaCheck]] = await pool.query('SELECT 1 FROM reservas WHERE evento_id = ? AND user_id = ? LIMIT 1', [eventId, userId]);
                if (reservaCheck) {
                    hasPermissionToView = true;
                }
            }

            if (!hasPermissionToView) {
                return res.status(403).json({ message: 'Acesso negado. Você não tem permissão para ver os convidados deste evento.' });
            }

            const sql = `
                SELECT 
                    c.id,
                    c.nome,
                    c.documento,
                    c.email,
                    c.telefone,
                    c.qr_code,
                    c.status, -- Use 'status' ao invés de 'status_checkin' para o campo correto
                    c.data_checkin,
                    c.geo_checkin_status, -- Incluído
                    r.nome_lista,
                    u.name as nome_do_criador_da_lista
                FROM 
                    convidados c
                JOIN 
                    reservas r ON c.reserva_id = r.id
                JOIN
                    users u ON r.user_id = u.id
                WHERE 
                    r.evento_id = ?;
            `;

            const [guests] = await pool.query(sql, [eventId]);
            res.status(200).json(guests);

        } catch (error) {
            console.error(`Erro ao buscar convidados para o evento ${eventId}:`, error);
            res.status(500).json({ error: 'Erro ao buscar convidados do evento.', message: error.message, stack: error.stack });
        }
    });

    /**
     * @route   PUT /api/events/guests/:guestId/checkin
     * @desc    Atualiza o status de check-in de um convidado (QR Code ou Confirmar Local)
     * @access  Private (Promoter/Admin)
     * @body    { latitude, longitude } (opcional, para verificação de local)
     */
    router.put('/guests/:guestId/checkin', auth, async (req, res) => {
        const { guestId } = req.params;
        const { latitude, longitude } = req.body; // Latitude e longitude do self check-in

        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();

            // 1. Obter informações do convidado e da reserva/evento associados
            const [[guest]] = await connection.query(
                `SELECT c.id, c.reserva_id, r.evento_id, p.latitude AS place_latitude, p.longitude AS place_longitude
                 FROM convidados c
                 JOIN reservas r ON c.reserva_id = r.id
                 LEFT JOIN eventos e ON r.evento_id = e.id
                 LEFT JOIN places p ON e.id_place = p.id
                 WHERE c.id = ?`,
                [guestId]
            );

            if (!guest) {
                await connection.rollback();
                return res.status(404).json({ message: 'Convidado não encontrado.' });
            }

            const reservaId = guest.reserva_id;
            const eventId = guest.evento_id; // Pode ser útil para logs ou futuras verificações

            let geoCheckinStatus = 'PENDENTE';
            let message = 'Check-in realizado com sucesso!';

            // 2. Lógica de Geolocalização
            if (guest.place_latitude && guest.place_longitude && latitude != null && longitude != null) {
                const distance = calculateDistance(guest.place_latitude, guest.place_longitude, latitude, longitude);
                const toleranceKm = 0.1; // 100 metros de tolerância

                if (distance <= toleranceKm) {
                    geoCheckinStatus = 'CONFIRMADO_LOCAL';
                    message = 'Check-in confirmado no local!';
                } else {
                    geoCheckinStatus = 'INVALIDO';
                    message = 'Check-in realizado, mas a localização parece inválida. Por favor, aproxime-se do local do evento.';
                }
            } else if (guest.evento_id && (latitude == null || longitude == null)) {
                 // Se o evento existe mas não foram fornecidas coordenadas do cliente
                geoCheckinStatus = 'LOCAL_NAO_INFORMADO'; // Novo status para indicar falta de info
                message = 'Check-in realizado, mas a localização do seu dispositivo não foi informada.';
            } else {
                // Se não há evento associado ou informações de localização do local
                geoCheckinStatus = 'NAO_APLICAVEL';
                message = 'Check-in realizado com sucesso! Verificação de local não aplicável.';
            }

            // 3. Atualizar o status do convidado
            const [updateResult] = await connection.query(
                `UPDATE convidados SET status = 'CHECK-IN', geo_checkin_status = ?, data_checkin = NOW(), latitude_checkin = ?, longitude_checkin = ? WHERE id = ?`,
                [geoCheckinStatus, latitude, longitude, guestId]
            );

            if (updateResult.affectedRows === 0) {
                await connection.rollback();
                return res.status(400).json({ message: 'Não foi possível atualizar o status do convidado.' });
            }

            await connection.commit();

            // 4. CHAME A FUNÇÃO PARA VERIFICAR E ATRIBUIR BRINDES PARA A RESERVA
            if (checkAndAwardBrindes) {
                await checkAndAwardBrindes(reservaId);
            } else {
                console.warn('checkAndAwardBrindes não foi passado para routes/events.js. Verificação de brinde não executada.');
            }
            
            res.status(200).json({ message: message, geo_status: geoCheckinStatus });

        } catch (error) {
            await connection.rollback();
            console.error('Erro ao realizar check-in do convidado:', error);
            res.status(500).json({ message: 'Erro ao realizar check-in do convidado.' });
        } finally {
            if (connection) connection.release();
        }
    });

router.get("/:id/convidados-com-status", auth, async (req, res) => {
  const eventoId = req.params.id;

  try {
    const [rows] = await pool.query(`
      SELECT
        convidados.id,
        convidados.nome,
        convidados.documento,
        convidados.email,
        convidados.status,
        convidados.data_checkin,
        reservas.id AS reserva_id,
        reservas.evento_id,
        users.name AS criador_da_reserva
      FROM convidados
      JOIN reservas ON convidados.reserva_id = reservas.id
      JOIN users ON reservas.user_id = users.id
      WHERE reservas.evento_id = ?
    `, [eventoId]);

    res.status(200).json(rows);
  } catch (error) {
    console.error("Erro ao buscar convidados do evento:", error);
    res.status(500).json({ message: "Erro ao buscar convidados do evento." });
  }
});

    return router;
};