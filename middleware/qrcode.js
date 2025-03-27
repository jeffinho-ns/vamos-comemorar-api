// middleware/qrcode.js

const QRCode = require('qrcode');
const db = require('../config/database'); //Ou pool, dependendo do que for usar

async function generateQRCode(id, nomeDoEvento) {
    try {
        //gerar o QrCode no formato base64
        const qrCodeDataURL = await QRCode.toDataURL(nomeDoEvento);

        //Atualizar a reserva com o QR Code
        await db.promise().query('UPDATE reservas SET = ? WHERE id = ?', [qrCodeDataURL, id]);

        console.log(`Qr Code gerado e inserido a reserva ID: ${id}`);
    } catch (error) {
        console.error('Erro ao gerar o QR Code', error);
    }
    
}

module.exports = generateQRCode;