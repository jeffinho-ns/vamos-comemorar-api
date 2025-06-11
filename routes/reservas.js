const express = require('express');
const generateQRCode = require('../middleware/qrcode');

module.exports = (pool) => {
    const router = express.Router();

    // Rota para criar uma nova reserva para um Evento
    router.post('/', async (req, res) => {
        const { userId, eventId, quantidade_pessoas, mesas, data_da_reserva, casa_da_reserva } = req.body;
        try {
            const [userResult] = await pool.query('SELECT name, email, telefone, foto_perfil FROM users WHERE id = ?', [userId]);
            const user = userResult[0];
            if (!user) return res.status(404).json({ error: "Usuário não encontrado" });

            const [eventResult] = await pool.query(
                `SELECT nome_do_evento, casa_do_evento, data_do_evento, hora_do_evento, local_do_evento, brinde, imagem_do_evento FROM eventos WHERE id = ?`, 
                [eventId]
            );
            const event = eventResult[0];
            if (!event) return res.status(404).json({ error: "Evento não encontrado" });

            await pool.query(
                `INSERT INTO reservas (user_id, event_id, name, email, telefone, foto_perfil, nome_do_evento, casa_do_evento, data_do_evento, hora_do_evento, local_do_evento, brinde, imagem_do_evento, quantidade_pessoas, mesas, data_da_reserva, casa_da_reserva, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [userId, eventId, user.name, user.email, user.telefone, user.foto_perfil, event.nome_do_evento, event.casa_do_evento, event.data_do_evento, event.hora_do_evento, event.local_do_evento, event.brinde, event.imagem_do_evento, quantidade_pessoas, mesas, data_da_reserva, casa_da_reserva, 'Aguardando']
            );
            res.status(201).json({ message: "Reserva criada com sucesso" });
        } catch (error) {
            console.error("Erro ao criar reserva de evento:", error);
            res.status(500).json({ error: "Erro ao criar reserva" });
        }
    });

    // Rota para criar uma nova reserva para um Local (sem evento específico)
    router.post('/place-reservation', async (req, res) => {
        const { userId, quantidade_pessoas, mesas, data_da_reserva, casa_da_reserva } = req.body;
        const nome_do_evento_padrao = `Reserva para ${casa_da_reserva}`;
        try {
            const [userResult] = await pool.query('SELECT name, email, telefone, foto_perfil FROM users WHERE id = ?', [userId]);
            const user = userResult[0];
            if (!user) return res.status(404).json({ error: "Usuário não encontrado" });

            await pool.query(
                `INSERT INTO reservas (user_id, event_id, name, email, telefone, foto_perfil, nome_do_evento, casa_do_evento, data_do_evento, hora_do_evento, local_do_evento, brinde, imagem_do_evento, quantidade_pessoas, mesas, data_da_reserva, casa_da_reserva, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [userId, null, user.name, user.email, user.telefone, user.foto_perfil, nome_do_evento_padrao, casa_da_reserva, null, null, "Endereço não especificado (Reserva de Local)", "Não aplicável", null, quantidade_pessoas, mesas, data_da_reserva, casa_da_reserva, 'Aguardando']
            );
            res.status(201).json({ message: `Reserva para ${casa_da_reserva} criada com sucesso` });
        } catch (error) {
            console.error(`Erro ao criar reserva de local:`, error);
            res.status(500).json({ error: `Erro ao criar reserva para ${casa_da_reserva}` });
        }
    });

    // Rota para listar todas as reservas
    router.get('/', async (req, res) => {
        try {
            const [reservas] = await pool.query('SELECT * FROM reservas');
            res.status(200).json(reservas);
        } catch (error) {
            console.error("Erro ao buscar reservas:", error);
            res.status(500).json({ error: "Erro ao buscar reservas" });
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
            console.error("Erro ao buscar reserva:", error);
            res.status(500).json({ error: "Erro ao buscar reserva" });
        }
    });
    
    // Rota para atualizar uma reserva (não o status)
    router.put('/:id', async (req, res) => {
        const { id } = req.params;
        const { quantidade_pessoas, mesas, data_da_reserva, casa_da_reserva, status } = req.body;
        try {
            const [reservaExistente] = await pool.query('SELECT * FROM reservas WHERE id = ?', [id]);
            if (!reservaExistente.length) return res.status(404).json({ error: "Reserva não encontrada" });

            await pool.query(
                `UPDATE reservas SET quantidade_pessoas = ?, mesas = ?, data_da_reserva = ?, casa_da_reserva = ?, status = ? WHERE id = ?`,
                [quantidade_pessoas, mesas, data_da_reserva, casa_da_reserva, status, id]
            );
            res.status(200).json({ message: "Reserva atualizada com sucesso" });
        } catch (error) {
            console.error("Erro ao atualizar reserva:", error);
            res.status(500).json({ error: "Erro ao atualizar reserva" });
        }
    });

    // ---- ROTA DE ATUALIZAÇÃO DE STATUS (VERSÃO FINAL E CORRIGIDA) ----
    router.put('/update-status/:id', async (req, res) => {
        const { id } = req.params;
        const { status } = req.body;
    
        console.log(`Recebida requisição para atualizar status da reserva ID: ${id} para "${status}"`);
    
        try {
            // 1. Atualiza o status no banco de dados
            await pool.query('UPDATE reservas SET status = ? WHERE id = ?', [status, id]);
            console.log(`Status da reserva ID: ${id} atualizado para "${status}" no banco.`);
    
            // 2. Se o status for 'Aprovado', tenta gerar o QR Code
            if (status === 'Aprovado') {
                console.log(`Status é 'Aprovado'. Tentando gerar QR Code para a reserva ID: ${id}.`);
    
                try {
                    // 3. Chama a função de QR Code (versão correta, apenas com o ID)
                    await generateQRCode(id);
                    console.log(`QR Code gerado com SUCESSO para a reserva ID: ${id}.`);
                } catch (qrError) {
                    // Se a geração do QR Code falhar, loga o erro específico
                    console.error(`!!! ERRO AO GERAR O QRCODE para a reserva ID: ${id} !!!`, qrError);
                    // Avisa o frontend que o status foi atualizado, mas o QR Code falhou
                    return res.status(500).json({ message: 'Status atualizado, mas falha ao gerar QR Code.', error: qrError.message });
                }
            }
    
            // 4. Se tudo correu bem, envia a resposta de sucesso final
            res.status(200).json({ message: 'Status atualizado com sucesso!' });
    
        } catch (error) {
            // Se houver um erro geral (ex: falha na primeira query de UPDATE), captura aqui
            console.error(`Erro geral ao atualizar o status da reserva ID: ${id}`, error);
            res.status(500).json({ message: 'Erro ao atualizar o status da reserva.' });
        }
    });

    return router;
};