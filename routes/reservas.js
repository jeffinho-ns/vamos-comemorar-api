// routes/reservas.js

const express = require('express');
const router = express.Router();
const db = require('../config/database'); // Assumindo que você já tenha a conexão configurada aqui

// Rota para criar uma nova reserva
router.post('/', async (req, res) => {
    const { userId, eventId, quantidade_pessoas, mesas, data_da_reserva, casa_da_reserva } = req.body;

    try {
        // Buscar dados do usuário
        const [user] = await db.query('SELECT name, email, telefone, foto_perfil FROM users WHERE id = ?', [userId]);
        if (!user) return res.status(404).json({ error: "Usuário não encontrado" });

        // Buscar dados do evento
        const [event] = await db.query('SELECT nome AS nome_do_evento, casa AS casa_do_evento, data AS data_do_evento, hora AS hora_do_evento, local AS local_do_evento, brinde, imagem AS imagem_do_evento FROM eventos WHERE id = ?', [eventId]);
        if (!event) return res.status(404).json({ error: "Evento não encontrado" });

        // Inserir dados na tabela reservas
        await db.query(`
            INSERT INTO reservas (
                user_id, event_id, name, email, telefone, foto_perfil,
                nome_do_evento, casa_do_evento, data_do_evento, hora_do_evento, local_do_evento, brinde, imagem_do_evento,
                quantidade_pessoas, mesas, data_da_reserva, casa_da_reserva
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            userId, eventId, user.name, user.email, user.telefone, user.foto_perfil,
            event.nome_do_evento, event.casa_do_evento, event.data_do_evento, event.hora_do_evento, event.local_do_evento, event.brinde, event.imagem_do_evento,
            quantidade_pessoas, mesas, data_da_reserva, casa_da_reserva
        ]);

        res.status(201).json({ message: "Reserva criada com sucesso" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Erro ao criar reserva" });
    }
});

// Rota para listar todas as reservas
router.get('/', async (req, res) => {
    try {
        const [reservas] = await db.query('SELECT * FROM reservas');
        res.status(200).json(reservas);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Erro ao buscar reservas" });
    }
});

// Rota para obter uma reserva específica pelo ID
router.get('/:id', async (req, res) => {
    const { id } = req.params;

    try {
        const [reserva] = await db.query('SELECT * FROM reservas WHERE id = ?', [id]);
        if (!reserva.length) return res.status(404).json({ error: "Reserva não encontrada" });

        res.status(200).json(reserva[0]);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Erro ao buscar reserva" });
    }
});

module.exports = router;
