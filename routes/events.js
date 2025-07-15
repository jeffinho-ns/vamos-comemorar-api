const fs = require('fs');
const express = require('express');
const multer = require('multer');
const path = require('path');
const router = express.Router();
// Adicione o import para o middleware de autenticação se não estiver presente
const auth = require('../middleware/auth'); // <<< CERTIFIQUE-SE DESTE IMPORT

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

    // ---- FUNÇÃO AUXILIAR ----
    const addFullImageUrls = (event) => {
        const baseUrl = process.env.API_BASE_URL || 'https://vamos-comemorar-api.onrender.com';
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

    // ---- ROTA POST para CRIAR EVENTO ----
    router.post('/', auth, upload.fields([ // 'auth' middleware já está aqui
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

            const adicionadoPor = req.user.id; // Garante que o ID do usuário logado é pego

            const params = [
                casa_do_evento, nome_do_evento, 
                tipo_evento === 'unico' ? data_do_evento : null,
                hora_do_evento, local_do_evento, categoria, mesas, valor_da_mesa, brinde,
                numero_de_convidados, descricao, valor_da_entrada,
                imagemDoEvento, imagemDoCombo, observacao,
                tipo_evento, tipo_evento === 'semanal' ? dia_da_semana : null,
                adicionadoPor // <<< SALVANDO 'adicionado_por'
            ];

            const query = `INSERT INTO eventos (
                casa_do_evento, nome_do_evento, data_do_evento, hora_do_evento,
                local_do_evento, categoria, mesas, valor_da_mesa, brinde,
                numero_de_convidados, descricao, valor_da_entrada,
                imagem_do_evento, imagem_do_combo, observacao,
                tipo_evento, dia_da_semana, adicionado_por ) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
            const [result] = await pool.query(query, params);

            const [rows] = await pool.query('SELECT * FROM eventos WHERE id = ?', [result.insertId]);
            const newEventWithUrls = addFullImageUrls(rows[0]);

            res.status(201).json(newEventWithUrls);

        } catch (error) {
            console.error('!!! ERRO DETALHADO AO CRIAR EVENTO !!!:', error);
            res.status(500).json({ error: 'Erro ao criar evento.' });
        }
    });
    
    // ---- ROTA GET (LISTA) ----
    // ADICIONADO 'auth' middleware aqui
    router.get('/', auth, async (req, res) => { // <<< CORRIGIDO
        const { tipo } = req.query;
        let query = 'SELECT * FROM eventos'; // 'SELECT *' deve incluir 'adicionado_por' se a coluna existe
        const params = [];

        if (tipo === 'unico') {
            query += ' WHERE tipo_evento = ? AND data_do_evento >= CURDATE() ORDER BY data_do_evento ASC';
            params.push('unico');
        } else if (tipo === 'semanal') {
            query += ' WHERE tipo_evento = ? ORDER BY dia_da_semana ASC, casa_do_evento';
            params.push('semanal');
        } else if (req.query.page) {
            // Lógica de paginação pode ser adicionada aqui
        } else if (tipo) {
            return res.status(400).json({ message: 'Tipo de evento inválido.' });
        }

        try {
            const [rows] = await pool.query(query, params);
            console.log('DEBUG BACKEND: Eventos listados - Exemplo de um evento (se existir):', rows.length > 0 ? rows[0] : 'Nenhum evento'); // DEBUG BACKEND
            
            if (rows.length === 0) {
                return res.status(200).json([]);
            }
            
            const eventsWithUrls = rows.map(addFullImageUrls);
            
            res.status(200).json(eventsWithUrls);
        } catch (error) {
            console.error('DEBUG BACKEND: Erro ao listar eventos:', error);
            res.status(500).json({ error: 'Erro ao listar eventos' });
        }
    });

    // ---- ROTA GET (ID ÚNICO) ----
    // ADICIONADO 'auth' middleware aqui
    router.get('/:id', auth, async (req, res) => { // <<< CORRIGIDO
        const eventId = req.params.id;
        try {
            const [rows] = await pool.query(`SELECT * FROM eventos WHERE id = ?`, [eventId]); // 'SELECT *' deve incluir 'adicionado_por'
            if (rows.length === 0) {
                return res.status(404).json({ message: 'Evento não encontrado' });
            }

            const eventWithUrls = addFullImageUrls(rows[0]);

            res.status(200).json(eventWithUrls);
        } catch (error) {
            console.error('Erro ao buscar evento:', error);
            res.status(500).json({ error: 'Erro ao buscar evento' });
        }
    });

    // ---- ROTA PUT (EDITAR) ----
    router.put('/:id', auth, upload.fields([ // 'auth' middleware já está aqui
        { name: 'imagem_do_evento', maxCount: 1 },
        { name: 'imagem_do_combo', maxCount: 1 }
    ]), async (req, res) => {
        const eventId = req.params.id;
        // Obtenha o adicionado_por do usuário logado para verificar permissão
        const adicionadoPor = req.user.id; 

        try {
            // Primeiro, verifique se o evento existe e se o usuário logado é o criador
            const [existingEvent] = await pool.query('SELECT adicionado_por FROM eventos WHERE id = ?', [eventId]);
            if (existingEvent.length === 0) {
                return res.status(404).json({ message: 'Evento não encontrado.' });
            }
            if (existingEvent[0].adicionado_por !== adicionadoPor && req.user.role !== 'admin') { // Permite admin editar
                return res.status(403).json({ message: 'Você não tem permissão para editar este evento.' });
            }

            // ... (sua lógica para buscar evento antigo e apagar imagens antigas se necessário)
            const [eventosAtuais] = await pool.query(`SELECT imagem_do_evento, imagem_do_combo FROM eventos WHERE id = ?`, [eventId]);
            if (eventosAtuais.length === 0) {
                return res.status(404).json({ message: 'Evento não encontrado.' });
            }
            const eventoAntigo = eventosAtuais[0];
            let imagemDoEventoFinal = eventoAntigo.imagem_do_evento;
            let imagemDoComboFinal = eventoAntigo.imagem_do_combo; // Certifique-se de pegar o combo também

            const imagemDoEventoFile = req.files?.['imagem_do_evento']?.[0];
            const imagemDoComboFile = req.files?.['imagem_do_combo']?.[0];

            if (imagemDoEventoFile) {
                imagemDoEventoFinal = imagemDoEventoFile.filename;
            }
            if (imagemDoComboFile) {
                imagemDoComboFinal = imagemDoComboFile.filename;
            }
            
            // Re-montar os parâmetros para o UPDATE
            const {
                casa_do_evento, nome_do_evento, data_do_evento, hora_do_evento,
                local_do_evento, categoria, mesas, valor_da_mesa, brinde,
                numero_de_convidados, descricao, valor_da_entrada, observacao,
                tipo_evento, dia_da_semana
            } = req.body;

            const updateParams = [
                casa_do_evento, nome_do_evento, 
                tipo_evento === 'unico' ? data_do_evento : null,
                hora_do_evento, local_do_evento, categoria, mesas, valor_da_mesa, brinde,
                numero_de_convidados, descricao, valor_da_entrada,
                imagemDoEventoFinal, imagemDoComboFinal, observacao,
                tipo_evento, tipo_evento === 'semanal' ? dia_da_semana : null,
                eventId // WHERE clause parameter
            ];

            const updateQuery = `UPDATE eventos SET
                casa_do_evento = ?, nome_do_evento = ?, data_do_evento = ?, hora_do_evento = ?,
                local_do_evento = ?, categoria = ?, mesas = ?, valor_da_mesa = ?, brinde = ?,
                numero_de_convidados = ?, descricao = ?, valor_da_entrada = ?,
                imagem_do_evento = ?, imagem_do_combo = ?, observacao = ?,
                tipo_evento = ?, dia_da_semana = ?
                WHERE id = ?`;

            await pool.query(updateQuery, updateParams);

            // Após o UPDATE, busca o evento atualizado para retorná-lo
            const [rows] = await pool.query('SELECT * FROM eventos WHERE id = ?', [eventId]);
            const updatedEventWithUrls = addFullImageUrls(rows[0]);

            res.status(200).json({ message: 'Evento atualizado com sucesso!', event: updatedEventWithUrls });

        } catch (error) {
            console.error('Erro ao atualizar evento:', error);
            res.status(500).json({ error: 'Erro ao atualizar evento.' });
        }
    });

    // ---- ROTA DELETE ----
    router.delete('/:id', auth, async (req, res) => { // 'auth' middleware aqui também
        const eventId = req.params.id;
        const userId = req.user.id; // O usuário logado que está tentando deletar

        try {
            // Verifique se o evento existe e se o usuário logado é o criador
            const [existingEvent] = await pool.query('SELECT adicionado_por FROM eventos WHERE id = ?', [eventId]);
            if (existingEvent.length === 0) {
                return res.status(404).json({ message: 'Evento não encontrado.' });
            }
            if (existingEvent[0].adicionado_por !== userId && req.user.role !== 'admin') { // Permite admin deletar
                return res.status(403).json({ message: 'Você não tem permissão para excluir este evento.' });
            }

            // TODO: (Opcional) Adicionar lógica para deletar arquivos de imagem do servidor

            await pool.query(`DELETE FROM eventos WHERE id = ?`, [eventId]);
            res.status(200).json({ message: 'Evento excluído com sucesso' });
        } catch (error) {
            console.error('Erro ao excluir evento:', error);
            res.status(500).json({ error: 'Erro ao excluir evento' });
        }
    });

    return router;
};