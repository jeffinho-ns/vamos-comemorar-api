// routes/events.js

const express = require('express');
const auth = require('../middleware/auth');

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

    // URL base das imagens (FTP - usado apenas para URLs legadas durante migração)
    const BASE_IMAGE_URL = 'https://grupoideiaum.com.br/cardapio-agilizaiapp/';

    /**
     * Função auxiliar para construir URL completa de imagem
     * Suporta URLs completas do Cloudinary e filenames legados do FTP
     */
    const buildImageUrl = (imageValue) => {
        if (!imageValue) return null;
        
        const trimmed = String(imageValue).trim();
        if (!trimmed || trimmed === 'null' || trimmed === 'undefined') return null;
        
        // Se já é uma URL completa (Cloudinary, FTP ou outro serviço), usar diretamente
        if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
            return trimmed;
        }
        
        // Se ainda é apenas um filename (legado do FTP), construir URL do FTP
        // Isso permite compatibilidade durante a migração
        return `${BASE_IMAGE_URL}${trimmed}`;
    };

    // Função assíncrona para buscar URL do Cloudinary na tabela cardapio_images
    const getCloudinaryUrl = async (filename) => {
        if (!filename || filename.startsWith('http://') || filename.startsWith('https://')) {
            return null; // Já é uma URL completa ou não tem filename
        }
        
        try {
            const result = await pool.query(
                'SELECT url FROM cardapio_images WHERE filename = $1 LIMIT 1',
                [filename]
            );
            
            if (result.rows.length > 0 && result.rows[0].url) {
                return result.rows[0].url; // Retorna URL completa do Cloudinary
            }
        } catch (error) {
            console.error('Erro ao buscar URL do Cloudinary:', error);
        }
        
        return null;
    };

    const addFullImageUrls = async (event) => {
        if (!event) return null;
        
        // Buscar URLs do Cloudinary se necessário
        let imagemEventoUrl = buildImageUrl(event.imagem_do_evento);
        let imagemComboUrl = buildImageUrl(event.imagem_do_combo);
        
        // Se a URL foi construída do FTP, tentar buscar no Cloudinary
        if (imagemEventoUrl && imagemEventoUrl.startsWith(BASE_IMAGE_URL)) {
            const cloudinaryUrl = await getCloudinaryUrl(event.imagem_do_evento);
            if (cloudinaryUrl) {
                imagemEventoUrl = cloudinaryUrl;
            }
        }
        
        if (imagemComboUrl && imagemComboUrl.startsWith(BASE_IMAGE_URL)) {
            const cloudinaryUrl = await getCloudinaryUrl(event.imagem_do_combo);
            if (cloudinaryUrl) {
                imagemComboUrl = cloudinaryUrl;
            }
        }
        
        return {
            ...event,
            imagem_do_evento_url: imagemEventoUrl,
            imagem_do_combo_url: imagemComboUrl,
            // Garantir que tipoEvento está presente (pode vir como tipoevento do PostgreSQL)
            tipoEvento: event.tipoEvento || event.tipo_evento || event.tipoevento,
        };
    };

    // NOVO ENDPOINT: Buscar eventos onde o usuário é promoter
    router.get('/promoter', auth, async (req, res) => {
        console.log('--- BUSCANDO EVENTOS DO PROMOTER ---');
        try {
            const userId = req.user.id;
            
            // Busca eventos onde o usuário é promoter
            // Por enquanto, vamos considerar que um usuário é promoter se criou reservas para o evento
            // ou se tem uma relação específica com o evento
            const result = await pool.query(`
                SELECT DISTINCT e.*
                FROM eventos e
                LEFT JOIN reservas r ON e.id = r.evento_id
                LEFT JOIN users u ON r.user_id = u.id
                WHERE r.user_id = $1 OR e.criado_por = $2
                ORDER BY e.data_do_evento DESC, e.hora_do_evento ASC
            `, [userId, userId]);

            // Adiciona URLs completas das imagens
            const eventsWithUrls = await Promise.all(result.rows.map(event => addFullImageUrls(event)));

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
            const result = await pool.query(`
                SELECT COUNT(*) as count
                FROM (
                    SELECT DISTINCT e.id
                    FROM eventos e
                    LEFT JOIN reservas r ON e.id = r.evento_id
                    LEFT JOIN users u ON r.user_id = u.id
                    WHERE (r.user_id = $1 OR e.criado_por = $2) AND e.id = $3
                ) as promoter_events
            `, [userId, userId, eventId]);

            const isPromoter = parseInt(result.rows[0].count) > 0;

            console.log(`Usuário ${userId} é promoter do evento ${eventId}: ${isPromoter}`);
            res.status(200).json({ isPromoter });

        } catch (error) {
            console.error('Erro ao verificar se usuário é promoter:', error);
            res.status(500).json({ message: 'Erro ao verificar permissões de promoter.' });
        }
    });

    router.post('/', auth, async (req, res) => {
        console.log('--- INICIANDO ROTA DE CRIAÇÃO DE EVENTO ---');
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            
            const {
                casa_do_evento, nome_do_evento, data_do_evento, hora_do_evento,
                local_do_evento, categoria, mesas, valor_da_mesa, brinde,
                numero_de_convidados, descricao, valor_da_entrada, observacao,
                tipo_evento, dia_da_semana, id_place,
                imagem_do_evento, imagem_do_combo, // Agora recebe os filenames no body
                atracoes // Array de atrações
            } = req.body;

            if (!nome_do_evento || !casa_do_evento) {
                await client.query('ROLLBACK');
                return res.status(400).json({ message: 'Nome do evento e casa do evento são obrigatórios.' });
            }
            
            const insertQuery = `
                INSERT INTO eventos (
                    casa_do_evento, nome_do_evento, data_do_evento, hora_do_evento,
                    local_do_evento, categoria, mesas, valor_da_mesa, brinde,
                    numero_de_convidados, descricao, valor_da_entrada,
                    imagem_do_evento, imagem_do_combo, observacao,
                    tipo_evento, dia_da_semana, id_place, criado_por
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19) RETURNING id
            `;
            const insertParams = [
                casa_do_evento, nome_do_evento,
                tipo_evento === 'unico' ? data_do_evento : null,
                hora_do_evento, local_do_evento, categoria, mesas, valor_da_mesa, brinde,
                numero_de_convidados, descricao, valor_da_entrada,
                imagem_do_evento || null, imagem_do_combo || null, observacao,
                tipo_evento, tipo_evento === 'semanal' ? dia_da_semana : null,
                id_place, req.user.id // Adiciona o ID do usuário que criou o evento
            ];

            const result = await client.query(insertQuery, insertParams);
            const eventoId = result.rows[0].id;

            // Inserir atrações se houver
            if (atracoes && Array.isArray(atracoes) && atracoes.length > 0) {
                console.log(`📋 Inserindo ${atracoes.length} atração(ões) para o evento ${eventoId}`);
                for (const atracao of atracoes) {
                    if (atracao.nome_atracao && atracao.ambiente && atracao.horario_inicio && atracao.horario_termino) {
                        await client.query(`
                            INSERT INTO evento_atracoes (evento_id, nome_atracao, ambiente, horario_inicio, horario_termino)
                            VALUES ($1, $2, $3, $4, $5)
                        `, [
                            eventoId,
                            atracao.nome_atracao,
                            atracao.ambiente,
                            atracao.horario_inicio,
                            atracao.horario_termino
                        ]);
                    }
                }
            }

            await client.query('COMMIT');

            const rowsResult = await pool.query('SELECT * FROM eventos WHERE id = $1', [eventoId]);
            const newEventWithUrls = await addFullImageUrls(rowsResult.rows[0]);

            res.status(201).json(newEventWithUrls);

        } catch (error) {
            await client.query('ROLLBACK');
            console.error('!!! ERRO DETALHADO AO CRIAR EVENTO (POST /) !!!:', error);
            res.status(500).json({ message: 'Erro ao criar evento.', error: error.message, stack: error.stack });
        } finally {
            client.release();
        }
    });
    
    // ---- ROTA GET (LISTA DE EVENTOS) ----
    // Permite acesso público para leitura de eventos (sem autenticação)
    router.get('/', async (req, res) => {
        try {
            const { tipo } = req.query;
            let query = `
                SELECT
                    id, casa_do_evento, nome_do_evento, 
                    TO_CHAR(data_do_evento, 'YYYY-MM-DD') as data_do_evento, 
                    hora_do_evento,
                    local_do_evento, criado_em, categoria, mesas, valor_da_mesa, brinde,
                    numero_de_convidados, descricao, valor_da_entrada,
                    imagem_do_evento, imagem_do_combo, observacao,
                    tipo_evento AS tipoEvento, dia_da_semana, id_place
                FROM meu_backup_db.eventos
            `;
            let queryParams = [];

            if (tipo) {
                query += ` WHERE tipo_evento = $1`;
                queryParams.push(tipo);
            }

            // Ordenação melhorada: eventos únicos por data (NULLs por último), semanais por dia da semana (inteiro)
            query += ` ORDER BY 
                CASE WHEN tipo_evento = 'unico' THEN 0 ELSE 1 END,
                CASE WHEN tipo_evento = 'unico' AND data_do_evento IS NULL THEN 1 ELSE 0 END,
                data_do_evento DESC NULLS LAST,
                (CASE WHEN tipo_evento = 'semanal' THEN dia_da_semana END) ASC NULLS LAST,
                hora_do_evento DESC NULLS LAST,
                criado_em DESC NULLS LAST`;

            const result = await pool.query(query, queryParams);
            
            const eventsWithUrls = await Promise.all(result.rows.map(event => addFullImageUrls(event)));

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
            const result = await pool.query(`SELECT * FROM eventos WHERE id = $1`, [eventId]);
            if (result.rows.length === 0) {
                return res.status(404).json({ message: 'Evento não encontrado' });
            }

            const eventWithUrls = await addFullImageUrls(result.rows[0]);

            res.status(200).json(eventWithUrls);
        } catch (error) {
            console.error('Erro ao buscar evento por ID (GET /:id):', error);
            res.status(500).json({ error: 'Erro ao buscar evento.', message: error.message, stack: error.stack });
        }
    });

    // ---- ROTA PUT (EDITAR) ----
    router.put('/:id', auth, async (req, res) => {
        const eventId = req.params.id;
        try {
            const eventosAtuaisResult = await pool.query(`SELECT imagem_do_evento, imagem_do_combo FROM eventos WHERE id = $1`, [eventId]);
            if (eventosAtuaisResult.rows.length === 0) {
                return res.status(404).json({ message: 'Evento não encontrado.' });
            }
            
            const {
                casa_do_evento, nome_do_evento, data_do_evento, hora_do_evento,
                local_do_evento, categoria, mesas, valor_da_mesa, brinde,
                numero_de_convidados, descricao, valor_da_entrada, observacao,
                tipo_evento, dia_da_semana, id_place,
                imagem_do_evento, imagem_do_combo // Agora recebe os filenames no body
            } = req.body;

            // Usa as imagens fornecidas ou mantém as antigas
            const eventoAntigo = eventosAtuaisResult.rows[0];
            const imagemDoEventoFinal = imagem_do_evento || eventoAntigo.imagem_do_evento;
            const imagemDoComboFinal = imagem_do_combo || eventoAntigo.imagem_do_combo;

            const updateQuery = `
                UPDATE eventos SET
                    casa_do_evento = $1, nome_do_evento = $2, data_do_evento = $3, hora_do_evento = $4,
                    local_do_evento = $5, categoria = $6, mesas = $7, valor_da_mesa = $8, brinde = $9,
                    numero_de_convidados = $10, descricao = $11, valor_da_entrada = $12,
                    imagem_do_evento = $13, imagem_do_combo = $14, observacao = $15,
                    tipo_evento = $16, dia_da_semana = $17, id_place = $18
                WHERE id = $19
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

            const result = await pool.query(updateQuery, updateParams);
            if (result.rowCount === 0) {
                return res.status(404).json({ message: 'Evento não encontrado para atualização.' });
            }

            const rowsResult = await pool.query('SELECT * FROM eventos WHERE id = $1', [eventId]);
            const updatedEventWithUrls = await addFullImageUrls(rowsResult.rows[0]);

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
            
            // As imagens agora estão no FTP, não precisamos deletar localmente
            // Se necessário, implementar lógica de deleção via FTP no futuro
            
            const result = await pool.query(`DELETE FROM eventos WHERE id = $1`, [eventId]);
            if (result.rowCount === 0) {
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
                const reservaCheckResult = await pool.query('SELECT 1 FROM reservas WHERE evento_id = $1 AND user_id = $2 LIMIT 1', [eventId, userId]);
                if (reservaCheckResult.rows.length > 0) {
                    hasPermissionToView = true;
                }
            }

            if (!hasPermissionToView) {
                return res.status(403).json({ message: 'Acesso negado. Você não tem permissão para ver as reservas deste evento.' });
            }

            const eventRowsResult = await pool.query('SELECT id, nome_do_evento FROM eventos WHERE id = $1', [eventId]);
            if (eventRowsResult.rows.length === 0) {
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
                    r.evento_id = $1
                ORDER BY 
                    r.id DESC;
            `;

            const reservasResult = await pool.query(sql, [eventId]);

            res.status(200).json({
                evento: eventRowsResult.rows[0],
                reservas_associadas: reservasResult.rows
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
                const reservaCheckResult = await pool.query('SELECT 1 FROM reservas WHERE evento_id = $1 AND user_id = $2 LIMIT 1', [eventId, userId]);
                if (reservaCheckResult.rows.length > 0) {
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
                    r.evento_id = $1;
            `;

            const guestsResult = await pool.query(sql, [eventId]);
            res.status(200).json(guestsResult.rows);

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

        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // 1. Obter informações do convidado e da reserva/evento associados
            const guestResult = await client.query(
                `SELECT c.id, c.reserva_id, r.evento_id, p.latitude AS place_latitude, p.longitude AS place_longitude
                 FROM convidados c
                 JOIN reservas r ON c.reserva_id = r.id
                 LEFT JOIN eventos e ON r.evento_id = e.id
                 LEFT JOIN places p ON e.id_place = p.id
                 WHERE c.id = $1`,
                [guestId]
            );

            if (guestResult.rows.length === 0) {
                await client.query('ROLLBACK');
                return res.status(404).json({ message: 'Convidado não encontrado.' });
            }
            
            const guest = guestResult.rows[0];

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
            const updateResult = await client.query(
                `UPDATE convidados SET status = 'CHECK-IN', geo_checkin_status = $1, data_checkin = NOW(), latitude_checkin = $2, longitude_checkin = $3 WHERE id = $4`,
                [geoCheckinStatus, latitude, longitude, guestId]
            );

            if (updateResult.rowCount === 0) {
                await client.query('ROLLBACK');
                return res.status(400).json({ message: 'Não foi possível atualizar o status do convidado.' });
            }

            await client.query('COMMIT');

            // 4. CHAME A FUNÇÃO PARA VERIFICAR E ATRIBUIR BRINDES PARA A RESERVA
            if (checkAndAwardBrindes) {
                await checkAndAwardBrindes(reservaId);
            } else {
                console.warn('checkAndAwardBrindes não foi passado para routes/events.js. Verificação de brinde não executada.');
            }
            
            res.status(200).json({ message: message, geo_status: geoCheckinStatus });

        } catch (error) {
            await client.query('ROLLBACK');
            console.error('Erro ao realizar check-in do convidado:', error);
            res.status(500).json({ message: 'Erro ao realizar check-in do convidado.' });
        } finally {
            if (client) client.release();
        }
    });

router.get("/:id/convidados-com-status", auth, async (req, res) => {
  const eventoId = req.params.id;

  try {
    const result = await pool.query(`
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
      WHERE reservas.evento_id = $1
    `, [eventoId]);

    res.status(200).json(result.rows);
  } catch (error) {
    console.error("Erro ao buscar convidados do evento:", error);
    res.status(500).json({ message: "Erro ao buscar convidados do evento." });
  }
});

    return router;
};