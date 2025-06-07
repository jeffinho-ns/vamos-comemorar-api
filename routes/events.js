const fs = require('fs');
const express = require('express');
const multer = require('multer');
const path = require('path');
const authenticateToken = require('../middleware/auth');
const router = express.Router();

const rootPath = path.resolve(__dirname, '..');
const uploadDir = path.join(rootPath, 'uploads/events');
 
// Configuração do Multer para upload de imagens
const upload = multer({
    storage: multer.diskStorage({
        destination: (req, file, cb) => cb(null, uploadDir),
        filename: (req, file, cb) => {
            const timestamp = Date.now();
            const ext = path.extname(file.originalname);
            const filename = `${timestamp}${ext}`; // Nomeia o arquivo como "timestamp.extensão"
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
        const {
            casa_do_evento, nome_do_evento, data_do_evento, hora_do_evento,
            local_do_evento, categoria, mesas, valor_da_mesa, brinde,
            numero_de_convidados, descricao, valor_da_entrada, observacao
        } = req.body;
    
        const imagemDoEvento = req.files['imagem_do_evento'] ? req.files['imagem_do_evento'][0].filename : null;
        const imagemDoCombo = req.files['imagem_do_combo'] ? req.files['imagem_do_combo'][0].filename : null;        
    
        try {
            const [result] = await pool.query(
                `INSERT INTO eventos (
                    casa_do_evento, nome_do_evento, data_do_evento, hora_do_evento,
                    local_do_evento, categoria, mesas, valor_da_mesa, brinde,
                    numero_de_convidados, descricao, valor_da_entrada,
                    imagem_do_evento, imagem_do_combo, observacao
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    casa_do_evento, nome_do_evento, data_do_evento, hora_do_evento,
                    local_do_evento, categoria, mesas, valor_da_mesa, brinde,
                    numero_de_convidados, descricao, valor_da_entrada,
                    imagemDoEvento, imagemDoCombo, observacao
                ]
            );
            res.status(201).json({ message: 'Evento criado com sucesso!', eventId: result.insertId });
        } catch (error) {
            console.error('Erro ao criar evento:', error.message);
            console.error(error);
            res.status(500).json({ error: 'Erro ao criar evento' });
        }
    });
    
    // Rota para listar todos os eventos
    router.get('/', async (req, res) => {
        try {
            const [rows] = await pool.query(`SELECT * FROM eventos`);
            if (rows.length === 0) {
                return res.status(404).json({ message: 'Nenhum evento encontrado' });
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
        } catch (error) {
            console.error('Erro ao buscar evento:', error);
            res.status(500).json({ error: 'Erro ao buscar evento' });
        }
    });

    // ================================================================
    // NOVA ROTA PARA EDITAR UM EVENTO (PUT)
    // ================================================================
    router.put('/:id', upload.fields([
        { name: 'imagem_do_evento', maxCount: 1 },
        { name: 'imagem_do_combo', maxCount: 1 }
    ]), async (req, res) => {
        const eventId = req.params.id;
        const {
            casa_do_evento, nome_do_evento, data_do_evento, hora_do_evento,
            local_do_evento, categoria, mesas, valor_da_mesa, brinde,
            numero_de_convidados, descricao, valor_da_entrada, observacao
        } = req.body;

        try {
            // 1. Buscar o evento atual para pegar os nomes das imagens antigas
            const [eventosAtuais] = await pool.query(`SELECT imagem_do_evento, imagem_do_combo FROM eventos WHERE id = ?`, [eventId]);

            if (eventosAtuais.length === 0) {
                return res.status(404).json({ message: 'Evento não encontrado para atualização.' });
            }
            const eventoAntigo = eventosAtuais[0];

            // 2. Determinar os nomes das imagens a serem salvas
            let imagemDoEventoFinal = eventoAntigo.imagem_do_evento;
            let imagemDoComboFinal = eventoAntigo.imagem_do_combo;

            // Se uma nova imagem de evento foi enviada
            if (req.files['imagem_do_evento']) {
                imagemDoEventoFinal = req.files['imagem_do_evento'][0].filename;
                // Deleta a imagem antiga, se existir
                if (eventoAntigo.imagem_do_evento) {
                    const oldImagePath = path.join(uploadDir, eventoAntigo.imagem_do_evento);
                    if (fs.existsSync(oldImagePath)) {
                        fs.unlinkSync(oldImagePath);
                    }
                }
            }

            // Se uma nova imagem de combo foi enviada
            if (req.files['imagem_do_combo']) {
                imagemDoComboFinal = req.files['imagem_do_combo'][0].filename;
                // Deleta a imagem antiga, se existir
                if (eventoAntigo.imagem_do_combo) {
                    const oldComboPath = path.join(uploadDir, eventoAntigo.imagem_do_combo);
                    if (fs.existsSync(oldComboPath)) {
                        fs.unlinkSync(oldComboPath);
                    }
                }
            }

            // 3. Atualizar o evento no banco de dados com os novos dados
            await pool.query(
                `UPDATE eventos SET
                    casa_do_evento = ?, nome_do_evento = ?, data_do_evento = ?, hora_do_evento = ?,
                    local_do_evento = ?, categoria = ?, mesas = ?, valor_da_mesa = ?, brinde = ?,
                    numero_de_convidados = ?, descricao = ?, valor_da_entrada = ?, observacao = ?,
                    imagem_do_evento = ?, imagem_do_combo = ?
                WHERE id = ?`,
                [
                    casa_do_evento, nome_do_evento, data_do_evento, hora_do_evento,
                    local_do_evento, categoria, mesas, valor_da_mesa, brinde,
                    numero_de_convidados, descricao, valor_da_entrada, observacao,
                    imagemDoEventoFinal, imagemDoComboFinal,
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

            // Remove os arquivos de imagem associados, se existirem
            if (imagem_do_evento) {
                const imagePath = path.join(uploadDir, imagem_do_evento);
                if (fs.existsSync(imagePath)) {
                    fs.unlinkSync(imagePath);
                }
            }
            if (imagem_do_combo) {
                const comboImagePath = path.join(uploadDir, imagem_do_combo);
                if (fs.existsSync(comboImagePath)) {
                    fs.unlinkSync(comboImagePath);
                }
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