const QRCode = require('qrcode');
const db = require('../config/database');

async function generateQRCode(id) {
    try {
        // Usa o próprio ID da reserva como o conteúdo do QR Code
        const qrCodeText = `reserva-${id}`;

        // Atualiza o banco de dados com o texto do QR Code
        await db.promise().query('UPDATE reservas SET qrcode = ? WHERE id = ?', [qrCodeText, id]);

        console.log(`QR Code gerado e salvo para a reserva ID: ${id}`);
    } catch (error) {
        console.error('Erro ao gerar o QR Code:', error);
    }
}

module.exports = generateQRCode;