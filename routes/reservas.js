const express = require('express');
const generateQRCode = require('../middleware/qrcode');

module.exports = (pool) => {
    const router = express.Router();

    // Rota para criar uma nova reserva
    router.post('/', async (req, res) => {
        const { userId, eventId, quantidade_pessoas, mesas, data_da_reserva, casa_da_reserva } = req.body;

        try {
            // Buscar dados do usuário
            const [userResult] = await pool.query(
                'SELECT name, email, telefone, foto_perfil FROM users WHERE id = ?', 
                [userId]
            );
            const user = userResult[0];
            if (!user) return res.status(404).json({ error: "Usuário não encontrado" });

            // Buscar dados do evento
            const [eventResult] = await pool.query(
                `SELECT nome_do_evento, casa_do_evento, data_do_evento, hora_do_evento, 
                        local_do_evento, brinde, imagem_do_evento 
                 FROM eventos WHERE id = ?`, 
                [eventId]
            );
            const event = eventResult[0];
            if (!event) return res.status(404).json({ error: "Evento não encontrado" });

            // Inserir dados na tabela reservas
            await pool.query(
                `INSERT INTO reservas (
                    user_id, event_id, name, email, telefone, foto_perfil,
                    nome_do_evento, casa_do_evento, data_do_evento, hora_do_evento, 
                    local_do_evento, brinde, imagem_do_evento,
                    quantidade_pessoas, mesas, data_da_reserva, casa_da_reserva
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,

                [
                    userId, eventId, user.name, user.email, user.telefone, user.foto_perfil,
                    event.nome_do_evento, event.casa_do_evento, event.data_do_evento, event.hora_do_evento, 
                    event.local_do_evento, event.brinde, event.imagem_do_evento,
                    quantidade_pessoas, mesas, data_da_reserva, casa_da_reserva, 'Aguardando' 
                ]
            );

            res.status(201).json({ message: "Reserva criada com sucesso" });
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: "Erro ao criar reserva" });
        }
    });

        // ====================================================================
    // NOVA ROTA GENÉRICA: Criar uma reserva para um LOCAL
    // Esta rota recebe o nome da casa diretamente do frontend.
    // ====================================================================
 router.post('/place-reservation', async (req, res) => {
    const { userId, quantidade_pessoas, mesas, data_da_reserva, casa_da_reserva } = req.body;

    const nome_do_evento_padrao = `Reserva para ${casa_da_reserva}`;
    const event_id_padrao = null;
    const data_do_evento_padrao = null;
    const hora_do_evento_padrao = null;
    const brinde_padrao = "Não aplicável";
    const imagem_do_evento_padrao = null;
    const local_do_evento_padrao = "Endereço não especificado (Reserva de Local)";

    try {
        const [userResult] = await pool.query(
            'SELECT name, email, telefone, foto_perfil FROM users WHERE id = ?',
            [userId]
        );
        const user = userResult[0];
        if (!user) return res.status(404).json({ error: "Usuário não encontrado" });

        await pool.query(
            `INSERT INTO reservas (
                user_id, event_id, name, email, telefone, foto_perfil,
                nome_do_evento, casa_do_evento, data_do_evento, hora_do_evento,
                local_do_evento, brinde, imagem_do_evento,
                quantidade_pessoas, mesas, data_da_reserva, casa_da_reserva, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, // <-- AQUI! Adicionei um ? a mais para o status

            [
                userId, event_id_padrao, user.name, user.email, user.telefone, user.foto_perfil,
                nome_do_evento_padrao, casa_da_reserva, data_do_evento_padrao, hora_do_evento_padrao,
                local_do_evento_padrao, brinde_padrao, imagem_do_evento_padrao,
                quantidade_pessoas, mesas, data_da_reserva, casa_da_reserva, 'Aguardando' // <-- AQUI! Adicionei o valor 'Aguardando'
            ]
        );

        res.status(201).json({ message: `Reserva para ${casa_da_reserva} criada com sucesso` });
    } catch (error) {
        console.error(`Erro ao criar reserva para ${casa_da_reserva}:`, error);
        res.status(500).json({ error: `Erro ao criar reserva para ${casa_da_reserva}` });
    }
});

    // Rota para listar todas as reservas
    router.get('/', async (req, res) => {
        try {
            const [reservas] = await pool.query('SELECT * FROM reservas');
            res.status(200).json(reservas);
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: "Erro ao buscar reservas" });
        }
    });

    // Rota para atualizar uma reserva específica pelo ID
    router.put('/:id', async (req, res) => {
        const { id } = req.params;
        const {
            quantidade_pessoas,
            mesas,
            data_da_reserva,
            casa_da_reserva,
            status
        } = req.body;

        try {
            // Verifica se a reserva existe
            const [reservaExistente] = await pool.query(
                'SELECT * FROM reservas WHERE id = ?',
                [id]
            );
            if (!reservaExistente.length) return res.status(404).json({ error: "Reserva não encontrada" });

            // Atualiza a reserva com os dados fornecidos
            await pool.query(
                `UPDATE reservas SET 
                    quantidade_pessoas = ?, 
                    mesas = ?, 
                    data_da_reserva = ?, 
                    casa_da_reserva = ?, 
                    status = ?
                 WHERE id = ?`,
                [
                    quantidade_pessoas,
                    mesas,
                    data_da_reserva,
                    casa_da_reserva,
                    status,
                    id
                ]
            );

            res.status(200).json({ message: "Reserva atualizada com sucesso" });
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: "Erro ao atualizar reserva" });
        }
    });

    // Rota para obter uma reserva específica pelo ID
    router.get('/:id', async (req, res) => {
        const { id } = req.params;

        try {
            const [reserva] = await pool.query('SELECT * FROM reservas WHERE id = ?', [id]);
            if (!reserva.length) return res.status(404).json({ error: "Reserva não encontrada" });

            res.status(200).json(reserva[0]);
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: "Erro ao buscar reserva" });
        }
    });

    // Rota para atualizar o status da reserva e gerar o QR code se aprovado
    router.put('/update-status/:id', async (req, res) => {
        const { id } = req.params;
        const { status } = req.body;
    
        try {
            await pool.query('UPDATE reservas SET status = ? WHERE id = ?', [status, id]);
    
            if (status === 'Aprovado') {
                const [reservas] = await pool.query('SELECT nome_do_evento FROM reservas WHERE id = ?', [id]);
                if (reservas.length > 0) {
                    const nomeDoEvento = reservas[0].nome_do_evento;
                    await generateQRCode(id, nomeDoEvento); // Gera o QR code e o armazena no banco
                }
            }
    
            res.status(200).json({ message: 'Status atualizado com sucesso!' });
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: 'Erro ao atualizar o status da reserva' });
        }
    });

    return router;
};
