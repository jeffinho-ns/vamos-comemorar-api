const fs = require('fs');
const express = require('express');
const multer = require('multer');
const path = require('path');
// const authenticateToken = require('../middleware/auth'); // Descomente se for usar autenticação
const router = express.Router();

// 4 - Back-end arquivo event.js

const rootPath = path.resolve(__dirname, '..');
const uploadDir = path.join(rootPath, 'uploads/events');

// Garante que o diretório de upload exista
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}
 
// Configuração do Multer para upload de imagens
const upload = multer({
    storage: multer.diskStorage({
        destination: (req, file, cb) => {
            // ---- ADICIONE ESTE CONSOLE.LOG PARA DEBUG ----
            console.log('DESTINO DO UPLOAD:', uploadDir); 
            cb(null, uploadDir);
        },
        filename: (req, file, cb) => {
            const timestamp = Date.now();
            const ext = path.extname(file.originalname);
            const filename = `${timestamp}${ext}`;
            // ---- E ADICIONE ESTE TAMBÉM ----
            console.log('NOME DO ARQUIVO GERADO:', filename);
            cb(null, filename);
        },
    }),
    limits: { fileSize: 20 * 1024 * 1024 },
});

// Exporta uma função que aceita 'pool'
module.exports = (pool) => {

    // Rota para criar um novo evento
    router.post('/', upload.fields([
        { name: 'imagem_do_evento', maxCount: 1 },
        { name: 'imagem_do_combo', maxCount: 1 }
    ]), async (req, res) => {

         console.log('ARQUIVOS RECEBIDOS PELA ROTA:', req.files);
        console.log('CORPO DA REQUISIÇÃO:', req.body);

        const {
            casa_do_evento, nome_do_evento, data_do_evento, hora_do_evento,
            local_do_evento, categoria, mesas, valor_da_mesa, brinde,
            numero_de_convidados, descricao, valor_da_entrada, observacao,
            tipo_evento, dia_da_semana // Novos campos
        } = req.body;
    
        const imagemDoEvento = req.files['imagem_do_evento'] ? req.files['imagem_do_evento'][0].filename : null;
        const imagemDoCombo = req.files['imagem_do_combo'] ? req.files['imagem_do_combo'][0].filename : null;        
    
        try {
            const [result] = await pool.query(
                `INSERT INTO eventos (
                    casa_do_evento, nome_do_evento, data_do_evento, hora_do_evento,
                    local_do_evento, categoria, mesas, valor_da_mesa, brinde,
                    numero_de_convidados, descricao, valor_da_entrada,
                    imagem_do_evento, imagem_do_combo, observacao,
                    tipo_evento, dia_da_semana
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    casa_do_evento, nome_do_evento, 
                    tipo_evento === 'unico' ? data_do_evento : null, // Salva data apenas se for 'unico'
                    hora_do_evento, local_do_evento, categoria, mesas, valor_da_mesa, brinde,
                    numero_de_convidados, descricao, valor_da_entrada,
                    imagemDoEvento, imagemDoCombo, observacao,
                    tipo_evento,
                    tipo_evento === 'semanal' ? dia_da_semana : null // Salva dia da semana apenas se for 'semanal'
                ]
            );
            res.status(201).json({ message: 'Evento criado com sucesso!', eventId: result.insertId });
        } catch (error) {
            console.error('Erro ao criar evento:', error);
            res.status(500).json({ error: 'Erro ao criar evento' });
        }
    });
    
    // Rota para listar eventos com filtro por tipo
    router.get('/', async (req, res) => {
        const { tipo } = req.query; // Pega o parâmetro 'tipo' da URL (ex: /api/events?tipo=unico)

        let query = 'SELECT * FROM eventos';
        const params = [];

        if (tipo === 'unico') {
            // Para eventos únicos, filtramos e mostramos apenas os que ainda não aconteceram
            query += ' WHERE tipo_evento = ? AND data_do_evento >= CURDATE() ORDER BY data_do_evento ASC';
            params.push('unico');

        } else if (tipo === 'semanal') {
            // Para eventos semanais, filtramos e ordenamos pelo dia da semana
            query += ' WHERE tipo_evento = ? ORDER BY dia_da_semana ASC, casa_do_evento';
            params.push('semanal');

        } else if (tipo) {
            // Se um tipo inválido for passado
            return res.status(400).json({ message: 'Tipo de evento inválido. Use "unico" ou "semanal".' });
        }
        // Se nenhum 'tipo' for passado, a query busca todos os eventos (comportamento padrão)

        try {
            const [rows] = await pool.query(query, params);
            if (rows.length === 0) {
                // É normal não encontrar eventos, então retornamos um array vazio com status 200
                return res.status(200).json([]);
            }
            res.status(200).json(rows);
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: 'Erro ao listar eventos' });
        }
    });

    // Rota para obter um evento específico pelo ID
    router.get('/:id', async (req, res) => {
        const eventId = req.params.id;
        try {
            const [rows] = await pool.query(`SELECT * FROM eventos WHERE id = ?`, [eventId]);
            if (rows.length === 0) {
                return res.status(404).json({ message: 'Evento não encontrado' });
            }
            res.status(200).json(rows[0]);
        } catch (error)
         {
            console.error('Erro ao buscar evento:', error);
            res.status(500).json({ error: 'Erro ao buscar evento' });
        }
    });

    // Rota para editar um evento
    router.put('/:id', upload.fields([
        { name: 'imagem_do_evento', maxCount: 1 },
        { name: 'imagem_do_combo', maxCount: 1 }
    ]), async (req, res) => {
        const eventId = req.params.id;
        const {
            casa_do_evento, nome_do_evento, data_do_evento, hora_do_evento,
            local_do_evento, categoria, mesas, valor_da_mesa, brinde,
            numero_de_convidados, descricao, valor_da_entrada, observacao,
            tipo_evento, dia_da_semana // Novos campos
        } = req.body;

        try {
            const [eventosAtuais] = await pool.query(`SELECT imagem_do_evento, imagem_do_combo FROM eventos WHERE id = ?`, [eventId]);
            if (eventosAtuais.length === 0) {
                return res.status(404).json({ message: 'Evento não encontrado para atualização.' });
            }
            const eventoAntigo = eventosAtuais[0];

            let imagemDoEventoFinal = eventoAntigo.imagem_do_evento;
            if (req.files['imagem_do_evento']) {
                imagemDoEventoFinal = req.files['imagem_do_evento'][0].filename;
                if (eventoAntigo.imagem_do_evento) {
                    const oldImagePath = path.join(uploadDir, eventoAntigo.imagem_do_evento);
                    if (fs.existsSync(oldImagePath)) fs.unlinkSync(oldImagePath);
                }
            }

            let imagemDoComboFinal = eventoAntigo.imagem_do_combo;
            if (req.files['imagem_do_combo']) {
                imagemDoComboFinal = req.files['imagem_do_combo'][0].filename;
                if (eventoAntigo.imagem_do_combo) {
                    const oldComboPath = path.join(uploadDir, eventoAntigo.imagem_do_combo);
                    if (fs.existsSync(oldComboPath)) fs.unlinkSync(oldComboPath);
                }
            }

            await pool.query(
                `UPDATE eventos SET
                    casa_do_evento = ?, nome_do_evento = ?, data_do_evento = ?, hora_do_evento = ?,
                    local_do_evento = ?, categoria = ?, mesas = ?, valor_da_mesa = ?, brinde = ?,
                    numero_de_convidados = ?, descricao = ?, valor_da_entrada = ?, observacao = ?,
                    imagem_do_evento = ?, imagem_do_combo = ?, tipo_evento = ?, dia_da_semana = ?
                WHERE id = ?`,
                [
                    casa_do_evento, nome_do_evento, 
                    tipo_evento === 'unico' ? data_do_evento : null, // Lógica condicional
                    hora_do_evento, local_do_evento, categoria, mesas, valor_da_mesa, brinde,
                    numero_de_convidados, descricao, valor_da_entrada, observacao,
                    imagemDoEventoFinal, imagemDoComboFinal,
                    tipo_evento,
                    tipo_evento === 'semanal' ? dia_da_semana : null, // Lógica condicional
                    eventId
                ]
            );

            res.status(200).json({ message: 'Evento atualizado com sucesso!' });

        } catch (error) {
            console.error('Erro ao atualizar evento:', error);
            res.status(500).json({ error: 'Erro ao atualizar evento.' });
        }
    });

    // Rota para excluir um evento pelo ID
    router.delete('/:id', async (req, res) => {
        const eventId = req.params.id;
        try {
            const [rows] = await pool.query(`SELECT imagem_do_evento, imagem_do_combo FROM eventos WHERE id = ?`, [eventId]);
            if (rows.length === 0) {
                return res.status(404).json({ message: 'Evento não encontrado' });
            }
            const { imagem_do_evento, imagem_do_combo } = rows[0];

            if (imagem_do_evento) {
                const imagePath = path.join(uploadDir, imagem_do_evento);
                if (fs.existsSync(imagePath)) fs.unlinkSync(imagePath);
            }
            if (imagem_do_combo) {
                const comboImagePath = path.join(uploadDir, imagem_do_combo);
                if (fs.existsSync(comboImagePath)) fs.unlinkSync(comboImagePath);
            }
            await pool.query(`DELETE FROM eventos WHERE id = ?`, [eventId]);
            res.status(200).json({ message: 'Evento excluído com sucesso' });
        } catch (error) {
            console.error('Erro ao excluir evento:', error);
            res.status(500).json({ error: 'Erro ao excluir evento' });
        }
    });

    return router;
};