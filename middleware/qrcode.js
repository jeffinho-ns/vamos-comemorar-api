// middleware/qrcode.js

const QRCode = require('qrcode');
const db = require('../config/database'); // Ou pool, dependendo do que você usa

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

module.exports = generateQRCode;
