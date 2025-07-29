// events.js (VERSÃO FINAL REVISADA PARA GROUP BY)

const fs = require('fs');
const express = require('express');
const multer = require('multer');
const path = require('path');
const router = express.Router();

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

module.exports = (pool) => {

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
                tipo_evento, dia_da_semana
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
                    tipo_evento, dia_da_semana, user_id, status_evento
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;
            const userId = req.user?.id || null;
            const statusEvento = 'ativo';

            const insertParams = [
                casa_do_evento, nome_do_evento,
                tipo_evento === 'unico' ? data_do_evento : null,
                hora_do_evento, local_do_evento, categoria, mesas, valor_da_mesa, brinde,
                numero_de_convidados, descricao, valor_da_entrada,
                imagemDoEvento, imagemDoCombo, observacao,
                tipo_evento, tipo_evento === 'semanal' ? dia_da_semana : null,
                userId,
                statusEvento
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
    
    // ---- ROTA GET (LISTA DE EVENTOS) - COM CONTAGEM DE CONVIDADOS e GROUP BY CORRIGIDO ----
    router.get('/', auth, async (req, res) => {
        const { tipo } = req.query;
        let query = `
            SELECT 
                e.id,
                e.casa_do_evento,
                e.nome_do_evento,
                e.data_do_evento,
                e.hora_do_evento,
                e.local_do_evento,
                e.categoria,
                e.mesas,
                e.valor_da_mesa,
                e.brinde,
                e.numero_de_convidados,
                e.descricao,
                e.valor_da_entrada,
                e.imagem_do_evento,
                e.imagem_do_combo,
                e.observacao,
                e.tipo_evento,
                e.dia_da_semana,
                e.user_id,
                e.status_evento,
                COUNT(CASE WHEN c.status_checkin = 'CHECK-IN' THEN c.id END) AS total_convidados_checkin,
                COUNT(c.id) AS total_convidados_cadastrados
            FROM 
                eventos e
            LEFT JOIN 
                reservas r ON e.id = r.evento_id
            LEFT JOIN 
                convidados c ON r.id = c.reserva_id
            GROUP BY 
                e.id, e.casa_do_evento, e.nome_do_evento, e.data_do_evento, e.hora_do_evento,
                e.local_do_evento, e.categoria, e.mesas, e.valor_da_mesa, e.brinde,
                e.numero_de_convidados, e.descricao, e.valor_da_entrada,
                e.imagem_do_evento, e.imagem_do_combo, e.observacao,
                e.tipo_evento, e.dia_da_semana, e.user_id, e.status_evento
        `;
        const params = [];

        // Condições WHERE ou HAVING
        if (tipo === 'unico') {
            query += ' HAVING e.tipo_evento = ? AND e.data_do_evento >= CURDATE() ORDER BY e.data_do_evento ASC';
            params.push('unico');
        } else if (tipo === 'semanal') {
            query += ' HAVING e.tipo_evento = ? ORDER BY e.dia_da_semana ASC, e.casa_do_evento';
            params.push('semanal');
        }
        
        try {
            const [rows] = await pool.query(query, params);
            
            const eventsWithUrlsAndCounts = rows.map(event => ({
                ...addFullImageUrls(event),
                total_convidados_checkin: Number(event.total_convidados_checkin) || 0,
                total_convidados_cadastrados: Number(event.total_convidados_cadastrados) || 0,
            }));
            
            res.status(200).json(eventsWithUrlsAndCounts);
        } catch (error) {
            console.error('Erro ao listar eventos no GET /api/events (ERRO SQL/BACKEND):', error);
            res.status(500).json({ message: 'Erro interno ao listar eventos.', error: error.message, stack: error.stack });
        }
    });

    // ---- ROTA GET (ID ÚNICO) - COM AUTH E MELHOR ERRO ----
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

    // ---- ROTA PUT (EDITAR) - ADICIONADO AUTH E MELHOR ERRO ----
    router.put('/:id', auth, upload.fields([
        { name: 'imagem_do_evento', maxCount: 1 },
        { name: 'imagem_do_combo', maxCount: 1 }
    ]), async (req, res) => {
        const eventId = req.params.id;
        try {
            const [[eventOwnerCheck]] = await pool.query('SELECT user_id FROM eventos WHERE id = ?', [eventId]);
            if (!eventOwnerCheck || (Number(eventOwnerCheck.user_id) !== Number(req.user.id) && req.user.role !== 'admin' && req.user.role !== 'gerente')) {
                return res.status(403).json({ message: 'Acesso negado. Você não tem permissão para editar este evento.' });
            }

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
                tipo_evento, dia_da_semana, status_evento
            } = req.body;

            const updateQuery = `
                UPDATE eventos SET
                    casa_do_evento = ?, nome_do_evento = ?, data_do_evento = ?, hora_do_evento = ?,
                    local_do_evento = ?, categoria = ?, mesas = ?, valor_da_mesa = ?, brinde = ?,
                    numero_de_convidados = ?, descricao = ?, valor_da_entrada = ?,
                    imagem_do_evento = ?, imagem_do_combo = ?, observacao = ?,
                    tipo_evento = ?, dia_da_semana = ?, status_evento = ?
                WHERE id = ?
            `;
            const updateParams = [
                casa_do_evento, nome_do_evento,
                tipo_evento === 'unico' ? data_do_evento : null,
                hora_do_evento, local_do_evento, categoria, mesas, valor_da_mesa, brinde,
                numero_de_convidados, descricao, valor_da_entrada,
                imagemDoEventoFinal, imagemDoComboFinal, observacao,
                tipo_evento, tipo_evento === 'semanal' ? dia_da_semana : null,
                status_evento,
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

    // ---- ROTA DELETE - COM AUTH E MELHOR ERRO ----
    router.delete('/:id', auth, async (req, res) => {
        const eventId = req.params.id;
        try {
            const [[eventOwnerCheck]] = await pool.query('SELECT user_id FROM eventos WHERE id = ?', [eventId]);
            if (!eventOwnerCheck || (Number(eventOwnerCheck.user_id) !== Number(req.user.id) && req.user.role !== 'admin' && req.user.role !== 'gerente')) {
                return res.status(403).json({ message: 'Acesso negado. Você não tem permissão para excluir este evento.' });
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
     * @access  Private (Admin, Manager)
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
                const [[eventCheck]] = await pool.query('SELECT user_id FROM eventos WHERE id = ?', [eventId]);
                if (eventCheck && Number(eventCheck.user_id) === Number(userId)) {
                    hasPermissionToView = true;
                } else {
                    const [[reservaCheck]] = await pool.query('SELECT 1 FROM reservas WHERE evento_id = ? AND user_id = ? LIMIT 1', [eventId, userId]);
                    if (reservaCheck) {
                        hasPermissionToView = true;
                    }
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
                    r.brindes_solicitados,
                    (SELECT COUNT(c.id) FROM convidados c WHERE c.reserva_id = r.id AND c.status_checkin = 'CHECK-IN') as total_checkins
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
                const [[eventCheck]] = await pool.query('SELECT user_id FROM eventos WHERE id = ?', [eventId]);
                if (eventCheck && Number(eventCheck.user_id) === Number(userId)) {
                    hasPermissionToView = true;
                } else {
                    const [[reservaCheck]] = await pool.query('SELECT 1 FROM reservas WHERE evento_id = ? AND user_id = ? LIMIT 1', [eventId, userId]);
                    if (reservaCheck) {
                        hasPermissionToView = true;
                    }
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
                    c.status_checkin,
                    c.data_checkin,
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

    return router;
}