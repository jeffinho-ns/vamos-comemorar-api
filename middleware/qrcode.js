const QRCode = require('qrcode');
const db = require('../config/database');


async function generateQRCode(id) {
    try {
        // Usa o próprio ID da reserva como o conteúdo do QR Code
        const qrCodeText = `reserva-${id}`;

        // Gera o QR Code em formato base64
        const qrCodeBase64 = await QRCode.toDataURL(qrCodeText);

        // Atualiza o banco de dados com o QR Code em base64
        await db.promise().query('UPDATE reservas SET qrcode = ? WHERE id = ?', [qrCodeBase64, id]);

        console.log(`QR Code gerado e salvo como base64 para a reserva ID: ${id}`);
    } catch (error) {
        console.error('Erro ao gerar o QR Code:', error);
    }
}

module.exports = generateQRCode;
