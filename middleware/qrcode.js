const express = require('express');
const multer = require('multer');
const QRCode = require('qrcode');
const db = require('../config/database'); // Conexão com o banco de dados

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

/**
 * Função para gerar QR Code e salvar no banco de dados
 */
async function generateQRCode(id, nomeDoEvento) {
    try {
        console.log(`Gerando QR Code para reserva ID: ${id}, Evento: ${nomeDoEvento}`);

        // Gerar o QR Code no formato base64
        const qrCodeDataURL = await QRCode.toDataURL(nomeDoEvento);
        console.log(`QR Code gerado com sucesso!`);

        // Atualizar a reserva no banco de dados com o QR Code
        await db.promise().query('UPDATE reservas SET qrcode = ? WHERE id = ?', [qrCodeDataURL, id]);

        console.log(`QR Code salvo no banco para a reserva ID: ${id}`);
    } catch (error) {
        console.error('Erro ao gerar o QR code:', error);
    }
}

/**
 * Rota para atualizar o status da reserva e gerar QR Code se aprovado
 */
router.put('/reservas/update-status/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        console.log(`Atualizando status da reserva ID: ${id} para ${status}`);

        // Atualizar o status no banco de dados
        await db.promise().query('UPDATE reservas SET status = ? WHERE id = ?', [status, id]);

        // Se a reserva for aprovada, gerar o QR Code
        if (status === 'Aprovado') {
            const [reserva] = await db.promise().query('SELECT nome_do_evento FROM reservas WHERE id = ?', [id]);
            
            if (reserva.length > 0) {
                await generateQRCode(id, reserva[0].nome_do_evento);
            }
        }

        res.json({ success: true, message: 'Status atualizado com sucesso' });
    } catch (error) {
        console.error('Erro ao atualizar status:', error);
        res.status(500).json({ success: false, message: 'Erro ao atualizar status' });
    }
});

/**
 * Rota para validar QR Code escaneado
 */
router.post('/validar', async (req, res) => {
    try {
        const { qrCode } = req.body; // O frontend enviará o texto do QR Code

        if (!qrCode) {
            return res.status(400).json({ message: 'QR Code não enviado' });
        }

        // Buscar a reserva no banco de dados
        const [rows] = await db.promise().query('SELECT * FROM reservas WHERE qrcode = ?', [qrCode]);

        if (rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Reserva não encontrada' });
        }

        const reserva = rows[0];

        // Verificar se a reserva está aprovada
        if (reserva.status !== 'Aprovado') {
            return res.status(403).json({ success: false, message: 'Reserva não aprovada' });
        }

        res.json({ success: true, nome_do_evento: reserva.nome_do_evento, data_do_evento: reserva.data_do_evento });
    } catch (error) {
        console.error('Erro ao validar QR Code:', error);
        res.status(500).json({ success: false, message: 'Erro interno do servidor' });
    }
});

module.exports = { generateQRCode, router };
