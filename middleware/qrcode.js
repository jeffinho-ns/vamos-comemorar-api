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
 * Rota para escanear QR Code e validar a reserva
 */
router.post('/scan', upload.single('qrcode'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'Nenhuma imagem enviada' });
        }

        // Ler a imagem do QR Code
        const image = await Jimp.read(req.file.buffer);
        const qr = new QRCodeReader();

        const value = await new Promise((resolve, reject) => {
            qr.callback = (err, result) => {
                if (err || !result) {
                    return reject('QR Code inválido ou não detectado');
                }
                resolve(result.result);
            };
            qr.decode(image.bitmap);
        });

        // Buscar a reserva no banco de dados
        const [rows] = await db.promise().query('SELECT * FROM reservas WHERE qrcode = ?', [value]);

        if (rows.length === 0) {
            return res.status(404).json({ message: 'Reserva não encontrada' });
        }

        res.json({ message: 'QR Code válido', reserva: rows[0] });
    } catch (error) {
        console.error('Erro ao ler o QR Code:', error);
        res.status(500).json({ message: 'Erro ao processar o QR Code' });
    }
});

// Exportar tanto a função de gerar QR Code quanto a rota
module.exports = { generateQRCode, router };
