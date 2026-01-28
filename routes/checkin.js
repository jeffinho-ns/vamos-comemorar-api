// Em /routes/checkin.js

const express = require('express');

// Função auxiliar para verificar e notificar sobre brindes
async function verificarBrindes(reservaId, db, io) {
    // Conta quantos convidados já fizeram check-in para esta reserva
    const sqlCount = "SELECT COUNT(*) as total FROM convidados WHERE reserva_id = $1 AND status = 'CHECK-IN'";
    const resultCount = await db.query(sqlCount, [reservaId]);
    const checkinsFeitos = parseInt(resultCount.rows[0].total);

    // Busca todas as regras de brinde que ainda estão pendentes para esta reserva
    const sqlRegras = "SELECT * FROM brindes_regras WHERE reserva_id = $1 AND status = 'PENDENTE'";
    const regrasResult = await db.query(sqlRegras, [reservaId]);
    const regras = regrasResult.rows;

    // Passa por cada regra pendente
    for (const regra of regras) {
        // Verifica se a condição foi atingida (ex: 20 check-ins >= meta de 20)
        if (checkinsFeitos >= regra.condicao_valor) {
            console.log(`Brinde Liberado para Reserva ${reservaId}: ${regra.descricao}`);
            
            // Atualiza o status do brinde para 'LIBERADO' para não notificar de novo
            await db.query("UPDATE brindes_regras SET status = 'LIBERADO' WHERE id = $1", [regra.id]);

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
        // Suporta tanto QR Code quanto convidadoId direto
        const { qrCodeData, convidadoId, eventId, entrada_tipo, entrada_valor } = req.body;
        const io = req.app.get('socketio'); // Pega a instância do Socket.IO

        if (!qrCodeData && !convidadoId) {
            return res.status(400).json({ message: 'qrCodeData ou convidadoId é obrigatório.' });
        }

        try {
            let convidado;

            // 0. NOVO: Fluxo de guest (lista de convidados) por qr_code_token (QR contém "vc_guest_xxx")
            if (qrCodeData && typeof qrCodeData === 'string' && qrCodeData.startsWith('vc_guest_')) {
                const guestResult = await db.query(
                    `SELECT g.id, g.name, g.checked_in, g.checkin_time, g.guest_list_id, gl.reservation_id, gl.reservation_type
                     FROM guests g
                     JOIN guest_lists gl ON gl.id = g.guest_list_id
                     WHERE g.qr_code_token = $1`,
                    [qrCodeData]
                );
                if (guestResult.rows.length > 0) {
                    const g = guestResult.rows[0];
                    if (g.checked_in === true || g.checked_in === 1) {
                        const hora = g.checkin_time ? new Date(g.checkin_time).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : null;
                        return res.status(409).json({
                            message: 'QR já utilizado. Check-in já realizado para este convidado.',
                            checkin_time: g.checkin_time,
                            checkin_time_formatted: hora
                        });
                    }
                    const listResult = await db.query(
                        'SELECT expires_at, CASE WHEN expires_at >= NOW() THEN 1 ELSE 0 END AS is_valid FROM guest_lists WHERE id = $1',
                        [g.guest_list_id]
                    );
                    if (listResult.rows.length === 0 || !listResult.rows[0].is_valid) {
                        return res.status(410).json({ message: 'Link da lista expirado. QR inválido.' });
                    }
                    await db.query(
                        'UPDATE guests SET checked_in = TRUE, checkin_time = CURRENT_TIMESTAMP WHERE id = $1',
                        [g.id]
                    );
                    const io = req.app.get('socketio');
                    if (io) {
                        io.to(`guest_list_${g.guest_list_id}`).emit('convidado_checkin', {
                            convidadoId: g.id,
                            nome: g.name,
                            status: 'CHECK-IN',
                            guest_list_id: g.guest_list_id
                        });
                    }
                    return res.status(200).json({
                        message: 'Check-in realizado com sucesso!',
                        convidado: g.name
                    });
                }
                return res.status(404).json({ message: 'QR Code inválido ou não encontrado.' });
            }

            // 1. Encontra o convidado por QR Code ou ID (fluxo existente: convidados)
            if (qrCodeData) {
                const sqlBusca = 'SELECT * FROM convidados WHERE qr_code = $1';
                const result = await db.query(sqlBusca, [qrCodeData]);
                if (result.rows.length === 0) {
                    return res.status(404).json({ message: 'QR Code inválido ou não encontrado.' });
                }
                convidado = result.rows[0];
            } else {
                // Buscar por ID direto
                const sqlBusca = 'SELECT * FROM convidados WHERE id = $1';
                const result = await db.query(sqlBusca, [convidadoId]);
                if (result.rows.length === 0) {
                    return res.status(404).json({ message: 'Convidado não encontrado.' });
                }
                convidado = result.rows[0];
            }

            // 2. Verifica se o check-in já foi feito
            if (convidado.status === 'CHECK-IN') {
                return res.status(409).json({ // 409 Conflict é o status ideal para "já existe"
                    message: `Check-in já realizado para ${convidado.nome} em ${new Date(convidado.data_checkin).toLocaleString('pt-BR')}.`
                });
            }

            // 3. Atualiza o status do convidado para 'CHECK-IN' com status de entrada
            const sqlUpdate = `
                UPDATE convidados 
                SET status = 'CHECK-IN', 
                    data_checkin = NOW(),
                    entrada_tipo = $1,
                    entrada_valor = $2
                WHERE id = $3
            `;
            await db.query(sqlUpdate, [
                entrada_tipo || null,
                entrada_valor || null,
                convidado.id
            ]);

            console.log(`Check-in realizado para: ${convidado.nome} (Reserva ID: ${convidado.reserva_id}) - Tipo: ${entrada_tipo || 'N/A'} - Valor: R$ ${entrada_valor || 0}`);

            // 4. ✨ A MÁGICA DO SOCKET.IO ✨
            // Notifica o app do promoter/aniversariante E o dashboard em tempo real
            io.to(`reserva_${convidado.reserva_id}`).emit('convidado_checkin', {
                convidadoId: convidado.id,
                nome: convidado.nome,
                status: 'CHECK-IN',
                entrada_tipo: entrada_tipo,
                entrada_valor: entrada_valor
            });

            // 5. Chama a função para verificar se algum brinde foi desbloqueado
            await verificarBrindes(convidado.reserva_id, db, io);

            res.status(200).json({ 
                message: 'Check-in realizado com sucesso!', 
                convidado: convidado.nome,
                entrada_tipo: entrada_tipo,
                entrada_valor: entrada_valor
            });

        } catch (error) {
            console.error('Erro no processo de check-in:', error);
            res.status(500).json({ message: 'Erro interno no servidor durante o check-in.' });
        }
    });

    return router;
};