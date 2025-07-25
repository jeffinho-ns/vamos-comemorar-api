const fs = require('fs');
const express = require('express');
const multer = require('multer');
const path = require('path');
const router = express.Router();

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

    // ---- NOVA FUNÇÃO AUXILIAR ----
    // Esta função centraliza a lógica de adicionar as URLs completas a um objeto de evento.
    const addFullImageUrls = (event) => {
        // Use uma variável de ambiente para a URL base em produção.
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

    // ---- ROTA POST OTIMIZADA ----
    // Agora retorna o objeto completo do evento criado, já com as URLs das imagens.
    router.post('/', upload.fields([
        { name: 'imagem_do_evento', maxCount: 1 },
        { name: 'imagem_do_combo', maxCount: 1 }
    ]), async (req, res) => {
        // Seus console.log de depuração estão aqui. Mantenha-os por enquanto.
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

            const params = [
                casa_do_evento, nome_do_evento, 
                tipo_evento === 'unico' ? data_do_evento : null,
                hora_do_evento, local_do_evento, categoria, mesas, valor_da_mesa, brinde,
                numero_de_convidados, descricao, valor_da_entrada,
                imagemDoEvento, imagemDoCombo, observacao,
                tipo_evento, tipo_evento === 'semanal' ? dia_da_semana : null
            ];

            const query = `INSERT INTO eventos (...) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
            const [result] = await pool.query(query, params);

            // Busca o evento recém-criado para retorná-lo completo.
            const [rows] = await pool.query('SELECT * FROM eventos WHERE id = ?', [result.insertId]);
            const newEventWithUrls = addFullImageUrls(rows[0]);

            res.status(201).json(newEventWithUrls);

        } catch (error) {
            console.error('!!! ERRO DETALHADO AO CRIAR EVENTO !!!:', error);
            res.status(500).json({ error: 'Erro ao criar evento.' });
        }
    });
    
    // ---- ROTA GET (LISTA) CORRIGIDA ----
    router.get('/', async (req, res) => {
        const { tipo } = req.query;
        let query = 'SELECT * FROM eventos';
        const params = [];

        if (tipo === 'unico') {
            query += ' WHERE tipo_evento = ? AND data_do_evento >= CURDATE() ORDER BY data_do_evento ASC';
            params.push('unico');
        } else if (tipo === 'semanal') {
            query += ' WHERE tipo_evento = ? ORDER BY dia_da_semana ASC, casa_do_evento';
            params.push('semanal');
        } else if (req.query.page) { // Mantém a compatibilidade com sua paginação inicial
            // Lógica de paginação pode ser adicionada aqui se necessário
        } else if (tipo) {
            return res.status(400).json({ message: 'Tipo de evento inválido.' });
        }

        try {
            const [rows] = await pool.query(query, params);
            if (rows.length === 0) {
                return res.status(200).json([]);
            }
            
            // Mapeia TODOS os resultados para adicionar as URLs completas
            const eventsWithUrls = rows.map(addFullImageUrls);
            
            res.status(200).json(eventsWithUrls);
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: 'Erro ao listar eventos' });
        }
    });

    // ---- ROTA GET (ID ÚNICO) CORRIGIDA ----
    router.get('/:id', async (req, res) => {
        const eventId = req.params.id;
        try {
            const [rows] = await pool.query(`SELECT * FROM eventos WHERE id = ?`, [eventId]);
            if (rows.length === 0) {
                return res.status(404).json({ message: 'Evento não encontrado' });
            }

            // Adiciona as URLs completas ao evento encontrado
            const eventWithUrls = addFullImageUrls(rows[0]);

            res.status(200).json(eventWithUrls);
        } catch (error) {
            console.error('Erro ao buscar evento:', error);
            res.status(500).json({ error: 'Erro ao buscar evento' });
        }
    });

    // ---- ROTA PUT (EDITAR) CORRIGIDA E OTIMIZADA ----
    router.put('/:id', upload.fields([
        { name: 'imagem_do_evento', maxCount: 1 },
        { name: 'imagem_do_combo', maxCount: 1 }
    ]), async (req, res) => {
        const eventId = req.params.id;
        try {
            // ... (sua lógica para buscar evento antigo e apagar imagens antigas se necessário)
            const [eventosAtuais] = await pool.query(`SELECT imagem_do_evento, imagem_do_combo FROM eventos WHERE id = ?`, [eventId]);
            if (eventosAtuais.length === 0) {
                return res.status(404).json({ message: 'Evento não encontrado.' });
            }
            const eventoAntigo = eventosAtuais[0];
            let imagemDoEventoFinal = eventoAntigo.imagem_do_evento;
            // ... (sua lógica de `if (req.files...` continua aqui)

            // ...

            // Após o UPDATE, busca o evento atualizado para retorná-lo
            const [rows] = await pool.query('SELECT * FROM eventos WHERE id = ?', [eventId]);
            const updatedEventWithUrls = addFullImageUrls(rows[0]);

            res.status(200).json({ message: 'Evento atualizado com sucesso!', event: updatedEventWithUrls });

        } catch (error) {
            console.error('Erro ao atualizar evento:', error);
            res.status(500).json({ error: 'Erro ao atualizar evento.' });
        }
    });

    // ---- ROTA DELETE (SEM ALTERAÇÕES NECESSÁRIAS) ----
    router.delete('/:id', async (req, res) => {
        const eventId = req.params.id;
        try {
            // ... (sua lógica de delete continua a mesma)
            // ...
            await pool.query(`DELETE FROM eventos WHERE id = ?`, [eventId]);
            res.status(200).json({ message: 'Evento excluído com sucesso' });
        } catch (error) {
            console.error('Erro ao excluir evento:', error);
            res.status(500).json({ error: 'Erro ao excluir evento' });
        }
    });


    /**
 * @route   GET /api/events/:id/reservas
 * @desc    Busca todas as reservas associadas a um evento específico
 * @access  Private (Admin)
 */
router.get('/:id/reservas', async (req, res) => {
    const eventId = req.params.id;

    try {
        // Primeiro, verificamos se o evento realmente existe
        const [eventRows] = await pool.query('SELECT id, nome_do_evento FROM eventos WHERE id = ?', [eventId]);
        if (eventRows.length === 0) {
            return res.status(404).json({ message: 'Evento não encontrado' });
        }

        // Agora, buscamos as reservas vinculadas a este evento.
        // Usamos um JOIN para já trazer o nome do criador da reserva (o promoter/aniversariante).
        const sql = `
            SELECT 
                r.id,
                r.nome_lista,
                r.tipo_reserva,
                r.status,
                u.name as nome_do_criador 
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

        // Retornamos um objeto com os dados do evento e um array com suas reservas
        res.status(200).json({
            evento: eventRows[0],
            reservas_associadas: reservas
        });

    } catch (error) {
        console.error(`Erro ao buscar reservas para o evento ${eventId}:`, error);
        res.status(500).json({ error: 'Erro ao buscar as reservas do evento.' });
    }
});


    return router;
};