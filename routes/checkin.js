// Em /routes/checkin.js

const express = require('express');

// Função auxiliar para verificar e notificar sobre brindes
async function verificarBrindes(reservaId, db, io) {
    // Conta quantos convidados já fizeram check-in para esta reserva
    const sqlCount = 'SELECT COUNT(*) as total FROM convidados WHERE reserva_id = ? AND status = "CHECK-IN"';
    const [[{ total: checkinsFeitos }]] = await db.query(sqlCount, [reservaId]);

    // Busca todas as regras de brinde que ainda estão pendentes para esta reserva
    const sqlRegras = 'SELECT * FROM brindes_regras WHERE reserva_id = ? AND status = "PENDENTE"';
    const [regras] = await db.query(sqlRegras, [reservaId]);

    // Passa por cada regra pendente
    for (const regra of regras) {
        // Verifica se a condição foi atingida (ex: 20 check-ins >= meta de 20)
        if (checkinsFeitos >= regra.condicao_valor) {
            console.log(`Brinde Liberado para Reserva ${reservaId}: ${regra.descricao}`);
            
            // Atualiza o status do brinde para 'LIBERADO' para não notificar de novo
            await db.query('UPDATE brindes_regras SET status = "LIBERADO" WHERE id = ?', [regra.id]);

            // ✨ A MÁGICA DO SOCKET.IO ✨
            // Emite um evento para a "sala" daquela reserva específica
            io.to(`reserva_${reservaId}`).emit('brinde_liberado', {
                brindeId: regra.id,
                descricao: regra.descricao,
                mensagem: `Brinde "${regra.descricao}" liberado para a lista!`
            });
        }
    }
}


module.exports = (db) => {
    const router = express.Router();

    /**
     * @route   POST /api/checkin
     * @desc    Processa o check-in de um convidado a partir do QR Code escaneado
     * @access  Private (Apenas para o Staff no Dashboard Next.js)
     */
    router.post('/', async (req, res) => {
        // O Dashboard Next.js vai enviar o texto puro que ele leu do QR Code
        const { qrCodeData } = req.body;
        const io = req.app.get('socketio'); // Pega a instância do Socket.IO

        if (!qrCodeData) {
            return res.status(400).json({ message: 'qrCodeData é obrigatório.' });
        }

        try {
            // 1. Encontra o convidado que possui este QR Code
            const sqlBusca = 'SELECT * FROM convidados WHERE qr_code = ?';
            const [convidados] = await db.query(sqlBusca, [qrCodeData]);

            if (convidados.length === 0) {
                return res.status(404).json({ message: 'QR Code inválido ou não encontrado.' });
            }

            const convidado = convidados[0];

            // 2. Verifica se o check-in já foi feito
            if (convidado.status === 'CHECK-IN') {
                return res.status(409).json({ // 409 Conflict é o status ideal para "já existe"
                    message: `Check-in já realizado para ${convidado.nome} em ${new Date(convidado.data_checkin).toLocaleString('pt-BR')}.`
                });
            }

            // 3. Atualiza o status do convidado para 'CHECK-IN'
            const sqlUpdate = 'UPDATE convidados SET status = "CHECK-IN", data_checkin = NOW() WHERE id = ?';
            await db.query(sqlUpdate, [convidado.id]);

            console.log(`Check-in realizado para: ${convidado.nome} (Reserva ID: ${convidado.reserva_id})`);

            // 4. ✨ A MÁGICA DO SOCKET.IO ✨
            // Notifica o app do promoter/aniversariante E o dashboard em tempo real
            io.to(`reserva_${convidado.reserva_id}`).emit('convidado_checkin', {
                convidadoId: convidado.id,
                nome: convidado.nome,
                status: 'CHECK-IN'
            });

            // 5. Chama a função para verificar se algum brinde foi desbloqueado
            await verificarBrindes(convidado.reserva_id, db, io);

            res.status(200).json({ message: 'Check-in realizado com sucesso!', convidado: convidado.nome });

        } catch (error) {
            console.error('Erro no processo de check-in:', error);
            res.status(500).json({ message: 'Erro interno no servidor durante o check-in.' });
        }
    });

    return router;
};