const express = require('express');
const multer = require('multer');
const QRCodeReader = require('qrcode-reader');
const Jimp = require('jimp');
const QRCode = require('qrcode');
const db = require('../config/database'); // Ou pool, dependendo do que você usa

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

/**
 * Função para gerar QR Code e salvar no banco de dados
 */
async function generateQRCode(id, nomeDoEvento) {
    try {
        // Gerar o QR code no formato base64
        const qrCodeDataURL = await QRCode.toDataURL(nomeDoEvento);

        // Atualizar a reserva com o QR code gerado
        await db.promise().query('UPDATE reservas SET qrcode = ? WHERE id = ?', [qrCodeDataURL, id]);

        console.log(`QR code gerado e inserido para a reserva ID: ${id}`);
    } catch (error) {
        console.error('Erro ao gerar o QR code:', error);
    }
}

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

// Exportar tanto a função de gerar QR Code quanto a rota
module.exports = { generateQRCode, router };
