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
            const [result] = await pool.promise().query(
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
            console.error('Erro ao criar evento:', error.message); // Loga a mensagem de erro
            console.error(error); // Loga o erro completo
            res.status(500).json({ error: 'Erro ao criar evento' });
        }
    });
    
    // Rota para listar todos os eventos
    router.get('/', async (req, res) => {
        try {
            const [rows] = await pool.promise().query(`SELECT * FROM eventos`);
            if (rows.length === 0) {
                return res.status(404).json({ message: 'Nenhum evento encontrado' });
            }
            res.status(200).json(rows);
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: 'Erro ao listar eventos' });
        }
    });

    // Rota para excluir um evento pelo ID
    router.delete('/:id', async (req, res) => {
        const eventId = req.params.id;

        try {
            // Verifica se o evento existe e obtém os nomes das imagens associadas
            const [rows] = await pool.promise().query(`SELECT imagem_do_evento, imagem_do_combo FROM eventos WHERE id = ?`, [eventId]);

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

            // Exclui o evento do banco de dados
            await pool.promise().query(`DELETE FROM eventos WHERE id = ?`, [eventId]);

            res.status(200).json({ message: 'Evento excluído com sucesso' });
        } catch (error) {
            console.error('Erro ao excluir evento:', error);
            res.status(500).json({ error: 'Erro ao excluir evento' });
        }
    });

    return router;
};
